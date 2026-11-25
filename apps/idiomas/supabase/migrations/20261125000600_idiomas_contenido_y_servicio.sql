-- =================================================================================================
-- App de idiomas · Migración 6:
--   A) Mejora del contenido con datos agregados de varios alumnos → cola editorial con revisión
--      obligatoria antes de publicar. No se guardan audios ni se entrenan modelos.
--   B) Funciones de servicio (solo service_role) para registro y borrado seguro de cuentas.
-- =================================================================================================
set role idiomas_propietario;

create table idiomas.cola_editorial (
  id bigint generated always as identity primary key,
  item_id text not null,
  item_version integer not null,
  hallazgo text not null check (hallazgo in ('dificil', 'confuso', 'posible_respuesta_valida_rechazada')),
  estado text not null default 'abierto' check (estado in ('abierto', 'en_revision', 'resuelto', 'descartado')),
  metricas jsonb not null,                     -- solo agregados: ninguna fila identifica a un alumno
  detectado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  resuelto_por uuid,
  resuelto_at timestamptz,
  nota text,
  foreign key (item_id, item_version) references idiomas.item_versiones(item_id, version)
);
create unique index cola_editorial_abierta on idiomas.cola_editorial (item_id, item_version, hallazgo)
  where estado in ('abierto', 'en_revision');

create table idiomas.cambios_contenido (
  id bigint generated always as identity primary key,
  tipo text not null default 'item' check (tipo in ('item', 'curriculo')),
  item_id text,
  version_base integer,
  propuesta jsonb not null,
  motivo text not null,
  cola_id bigint references idiomas.cola_editorial(id),
  propuesto_por uuid not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado', 'publicado')),
  revisado_por uuid,
  revisado_at timestamptz,
  comentario_revision text,
  publicado_por uuid,
  publicado_at timestamptz,
  version_nueva integer,
  created_at timestamptz not null default now(),
  check (revisado_por is null or revisado_por <> propuesto_por)  -- nadie aprueba su propio cambio
);
alter table idiomas.cola_editorial enable row level security;
alter table idiomas.cambios_contenido enable row level security;

-- Métricas por ítem y versión (sin identificadores personales en la salida)
create or replace function idiomas.metricas_items()
returns table (item_id text, item_version integer, alumnos bigint, primeros_intentos bigint,
  precision_primer numeric, tasa_pista numeric, correccion_tras_error numeric, presentados bigint,
  tasa_abandono numeric, reportes_validez bigint, reportes_confusion bigint,
  respuesta_frecuente text, alumnos_respuesta_frecuente bigint, concentracion_error numeric)
language sql stable security definer set search_path = '' as $$
  with p as (
    select x.item_id, x.item_version, x.user_id, x.sesion_id, x.posicion, x.resultado, x.pista_usada
      from idiomas.intentos x where x.numero_intento = 1 and x.resultado <> 'no_evaluable'
  ), base as (
    select p.item_id, p.item_version, count(distinct p.user_id) as alumnos, count(*) as n,
           avg((p.resultado in ('correcta', 'aceptable_con_aviso'))::int) as prec, avg(p.pista_usada::int) as tp
      from p group by 1, 2
  ), corr as (
    select p.item_id, p.item_version,
           avg((exists (select 1 from idiomas.intentos y where y.sesion_id = p.sesion_id and y.posicion = p.posicion
                        and y.numero_intento > 1 and y.resultado in ('correcta', 'aceptable_con_aviso')))::int) as cf
      from p where p.resultado = 'incorrecta' group by 1, 2
  ), mal as (
    select x.item_id, x.item_version, x.respuesta_normalizada, count(distinct x.user_id) as u
      from idiomas.intentos x where x.numero_intento = 1 and x.resultado = 'incorrecta' group by 1, 2, 3
  ), top as (
    select distinct on (m.item_id, m.item_version) m.item_id, m.item_version, m.respuesta_normalizada, m.u,
           m.u::numeric / nullif(sum(m.u) over (partition by m.item_id, m.item_version), 0) as conc
      from mal m order by m.item_id, m.item_version, m.u desc, m.respuesta_normalizada
  ), pres as (
    select si.item_id, si.item_version, count(*) as presentados,
           count(*) filter (where (s.estado = 'abandonada' or (s.estado = 'abierta' and s.created_at < now() - interval '24 hours'))
                              and not exists (select 1 from idiomas.intentos y where y.sesion_id = si.sesion_id and y.posicion = si.posicion)) as aband
      from idiomas.sesion_items si join idiomas.sesiones s on s.id = si.sesion_id group by 1, 2
  ), rep as (
    select r.item_id, r.item_version,
           count(distinct r.user_id) filter (where r.tipo = 'respuesta_valida_rechazada') as rv,
           count(distinct r.user_id) filter (where r.tipo in ('enunciado_confuso', 'error_en_contenido')) as rc
      from idiomas.reportes_contenido r group by 1, 2
  )
  select b.item_id, b.item_version, b.alumnos, b.n, round(b.prec, 3), round(b.tp, 3), round(c.cf, 3),
         coalesce(pr.presentados, 0), round(coalesce(pr.aband::numeric / nullif(pr.presentados, 0), 0), 3),
         coalesce(r.rv, 0), coalesce(r.rc, 0), t.respuesta_normalizada, coalesce(t.u, 0), round(coalesce(t.conc, 0), 3)
    from base b
    left join corr c on c.item_id = b.item_id and c.item_version = b.item_version
    left join top t on t.item_id = b.item_id and t.item_version = b.item_version
    left join pres pr on pr.item_id = b.item_id and pr.item_version = b.item_version
    left join rep r on r.item_id = b.item_id and r.item_version = b.item_version
$$;

-- Clasificación: distingue un ítem DIFÍCIL (se aprende tras el feedback, errores dispersos) de uno
-- CONFUSO (no se corrige tras el feedback, se abandona o se reporta como confuso) y de uno que
-- RECHAZA respuestas válidas (muchos alumnos escriben la misma "respuesta incorrecta" y luego
-- corrigen sin problema, o la reportan como válida).
create or replace function idiomas.clasificar_item(m record) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_min numeric := idiomas.cfg_num('muestra_minima_revision', 20);
  v_baja numeric := idiomas.cfg_num('umbral_precision_baja', 0.5);
  v_conc numeric := idiomas.cfg_num('umbral_concentracion_respuesta', 0.5);
  v_rep numeric := idiomas.cfg_num('umbral_reportes_validez', 0.1);
begin
  if m.alumnos < v_min then return null; end if;
  if m.reportes_validez::numeric / m.alumnos >= v_rep
     or (m.concentracion_error >= v_conc and m.alumnos_respuesta_frecuente >= greatest(3, ceil(v_min * 0.15))
         and m.precision_primer < 0.9 and coalesce(m.correccion_tras_error, 0) >= 0.5) then
    -- Muchos escriben LO MISMO y, al ver la solución, la reproducen sin problema: sabían el
    -- concepto; probablemente su variante también es válida.
    return 'posible_respuesta_valida_rechazada';
  end if;
  if m.precision_primer < v_baja then
    if m.tasa_abandono >= 0.2 or m.reportes_confusion::numeric / m.alumnos >= v_rep
       or coalesce(m.correccion_tras_error, 0) < 0.5 then
      return 'confuso';
    end if;
    return 'dificil';
  end if;
  return null;
end $$;

-- -------------------------------------------------------------------------------------------------
-- API editorial (roles de la app de idiomas: editor, revisor, admin)
-- -------------------------------------------------------------------------------------------------
create or replace function idiomas_api.editor_analizar_contenido() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); m record; h text; v_n int := 0; v_eval int := 0;
begin
  if not idiomas.tiene_rol(array['editor', 'revisor']) then raise exception 'sin_permiso' using errcode = '42501'; end if;
  for m in select * from idiomas.metricas_items() loop
    v_eval := v_eval + 1;
    h := idiomas.clasificar_item(m);
    continue when h is null;
    insert into idiomas.cola_editorial (item_id, item_version, hallazgo, metricas)
    values (m.item_id, m.item_version, h, to_jsonb(m))
    on conflict (item_id, item_version, hallazgo) where estado in ('abierto', 'en_revision')
    do update set metricas = excluded.metricas, actualizado_at = now();
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('items_con_datos', v_eval, 'hallazgos', v_n,
                            'muestra_minima', idiomas.cfg_num('muestra_minima_revision', 20));
end $$;

create or replace function idiomas_api.editor_cola(p_estado text default 'abierto') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro();
begin
  if not idiomas.tiene_rol(array['editor', 'revisor']) then raise exception 'sin_permiso' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', q.id, 'item_id', q.item_id, 'item_version', q.item_version, 'hallazgo', q.hallazgo, 'estado', q.estado,
      'metricas', q.metricas, 'enunciado', iv.contenido, 'tipo', iv.tipo, 'detectado_at', q.detectado_at) order by q.detectado_at)
    from idiomas.cola_editorial q join idiomas.item_versiones iv on iv.item_id = q.item_id and iv.version = q.item_version
   where p_estado is null or q.estado = p_estado), '[]'::jsonb);
end $$;

-- Detalle editorial de un ítem, incluidas sus claves: SOLO para roles editoriales.
create or replace function idiomas_api.editor_item(p_item text, p_version integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro();
begin
  if not idiomas.tiene_rol(array['editor', 'revisor']) then raise exception 'sin_permiso' using errcode = '42501'; end if;
  return (select jsonb_build_object('item_id', iv.item_id, 'version', iv.version, 'tipo', iv.tipo, 'estado', iv.estado,
      'contenido', iv.contenido, 'pista', iv.pista, 'explicacion', iv.explicacion,
      'aceptadas', to_jsonb(k.aceptadas), 'opcion_correcta', k.opcion_correcta, 'errores_previstos', k.errores_previstos,
      'cambios', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'estado', c.estado, 'motivo', c.motivo,
          'propuesta', c.propuesta, 'propio', c.propuesto_por = v) order by c.id), '[]'::jsonb)
        from idiomas.cambios_contenido c where c.item_id = iv.item_id and c.version_base = iv.version))
    from idiomas.item_versiones iv join idiomas.item_claves k using (item_id, version)
   where iv.item_id = p_item and iv.version = p_version);
end $$;

create or replace function idiomas_api.editor_proponer_cambio(p_item text, p_version_base integer, p_propuesta jsonb,
  p_motivo text, p_cola_id bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); v_id bigint; k text;
begin
  if not idiomas.tiene_rol(array['editor']) then raise exception 'sin_permiso' using errcode = '42501'; end if;
  if not exists (select 1 from idiomas.item_versiones where item_id = p_item and version = p_version_base) then
    raise exception 'item_no_existe';
  end if;
  for k in select jsonb_object_keys(p_propuesta) loop
    if k not in ('contenido', 'pista', 'explicacion', 'aceptadas', 'opcion_correcta', 'errores_previstos', 'reglas') then
      raise exception 'campo_no_editable: %', k;
    end if;
  end loop;
  insert into idiomas.cambios_contenido (item_id, version_base, propuesta, motivo, cola_id, propuesto_por)
  values (p_item, p_version_base, p_propuesta, p_motivo, p_cola_id, v) returning id into v_id;
  if p_cola_id is not null then update idiomas.cola_editorial set estado = 'en_revision', actualizado_at = now() where id = p_cola_id; end if;
  return jsonb_build_object('cambio_id', v_id, 'estado', 'pendiente');
end $$;

create or replace function idiomas_api.revisor_resolver_cambio(p_cambio bigint, p_aprobar boolean, p_comentario text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); c idiomas.cambios_contenido;
begin
  if not idiomas.tiene_rol(array['revisor']) then raise exception 'sin_permiso' using errcode = '42501'; end if;
  select * into c from idiomas.cambios_contenido where id = p_cambio for update;
  if c.id is null or c.estado <> 'pendiente' then raise exception 'cambio_no_pendiente'; end if;
  if c.propuesto_por = v then raise exception 'no_puedes_revisar_tu_propio_cambio'; end if;
  update idiomas.cambios_contenido set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
    revisado_por = v, revisado_at = now(), comentario_revision = p_comentario where id = c.id;
  return jsonb_build_object('cambio_id', c.id, 'estado', case when p_aprobar then 'aprobado' else 'rechazado' end);
end $$;

-- Publica un cambio APROBADO como nueva versión del ítem. La versión anterior se conserva para las
-- sesiones ya iniciadas (cada sesión fija item_id + versión).
create or replace function idiomas_api.editor_publicar_cambio(p_cambio bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); c idiomas.cambios_contenido; iv idiomas.item_versiones; k idiomas.item_claves;
        v_nueva int; p jsonb;
begin
  if not idiomas.tiene_rol(array['editor']) then raise exception 'sin_permiso' using errcode = '42501'; end if;
  select * into c from idiomas.cambios_contenido where id = p_cambio for update;
  if c.id is null then raise exception 'cambio_no_existe'; end if;
  if c.estado <> 'aprobado' then raise exception 'requiere_revision_aprobada'; end if;
  if c.tipo <> 'item' then raise exception 'publicacion_curricular_manual'; end if;
  p := c.propuesta;
  select * into iv from idiomas.item_versiones where item_id = c.item_id and version = c.version_base;
  select * into k from idiomas.item_claves where item_id = c.item_id and version = c.version_base;
  select max(version) + 1 into v_nueva from idiomas.item_versiones where item_id = c.item_id;
  insert into idiomas.item_versiones (item_id, version, estado, tipo, modalidad, dificultad, contenido, pista, explicacion, tipo_error_por_defecto)
  values (c.item_id, v_nueva, 'aprobado', iv.tipo, iv.modalidad, iv.dificultad,
          coalesce(p -> 'contenido', iv.contenido), coalesce(p ->> 'pista', iv.pista),
          coalesce(p ->> 'explicacion', iv.explicacion), iv.tipo_error_por_defecto);
  insert into idiomas.item_claves (item_id, version, aceptadas, opcion_correcta, reglas, errores_previstos)
  values (c.item_id, v_nueva,
          coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'aceptadas') x), k.aceptadas),
          coalesce(p ->> 'opcion_correcta', k.opcion_correcta), coalesce(p -> 'reglas', k.reglas),
          coalesce(p -> 'errores_previstos', k.errores_previstos));
  update idiomas.item_versiones set estado = 'retirado' where item_id = c.item_id and version < v_nueva and estado = 'aprobado';
  update idiomas.cambios_contenido set estado = 'publicado', publicado_por = v, publicado_at = now(), version_nueva = v_nueva where id = c.id;
  if c.cola_id is not null then
    update idiomas.cola_editorial set estado = 'resuelto', resuelto_por = v, resuelto_at = now() where id = c.cola_id;
  end if;
  return jsonb_build_object('cambio_id', c.id, 'item_id', c.item_id, 'version_nueva', v_nueva);
end $$;

revoke all on all functions in schema idiomas_api from public;
grant execute on all functions in schema idiomas_api to authenticated;

reset role;

-- -------------------------------------------------------------------------------------------------
-- B) Funciones de servicio. Dueño: postgres (necesitan leer si el usuario existe en la otra app,
-- SOLO para devolver un booleano). Ejecutables únicamente por service_role, nunca desde el cliente.
-- -------------------------------------------------------------------------------------------------
create or replace function idiomas_api.servicio_pertenece_a_otra_app(p_user uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare r boolean := false;
begin
  if to_regclass('public.administradores') is not null then
    execute 'select exists (select 1 from public.administradores where id = $1)' into r using p_user;
  end if;
  if not r and to_regclass('public.dispositivos') is not null then
    execute 'select exists (select 1 from public.dispositivos where usuario_id = $1)' into r using p_user;
  end if;
  return r;
end $$;

revoke all on function idiomas_api.servicio_pertenece_a_otra_app(uuid) from public, anon, authenticated;
grant execute on function idiomas_api.servicio_pertenece_a_otra_app(uuid) to idiomas_propietario, service_role;

-- El resto de funciones de servicio pertenecen al rol de idiomas (no necesitan nada de la otra app)
set role idiomas_propietario;
create or replace function idiomas_api.servicio_estado_usuario(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'miembro_idiomas', exists (select 1 from idiomas.miembros where user_id = p_user),
    'otra_app', idiomas_api.servicio_pertenece_a_otra_app(p_user),
    'puede_borrar_auth', not exists (select 1 from idiomas.miembros where user_id = p_user)
                         and not idiomas_api.servicio_pertenece_a_otra_app(p_user))
$$;

create or replace function idiomas_api.servicio_validar_alta(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'abiertas', coalesce((idiomas.cfg('inscripciones_abiertas') #>> '{}')::boolean, false),
    'cupo', (select count(*) from idiomas.miembros where estado = 'activo') < idiomas.cfg_num('max_miembros', 50),
    'codigo_valido', not coalesce((idiomas.cfg('requiere_codigo_invitacion') #>> '{}')::boolean, true)
      or exists (select 1 from idiomas.codigos_invitacion where codigo = upper(btrim(coalesce(p_codigo, '')))
                  and activo and (vence_at is null or vence_at > now()) and usos < usos_max))
$$;

revoke all on function idiomas_api.servicio_estado_usuario(uuid), idiomas_api.servicio_validar_alta(text)
  from public, anon, authenticated;
grant execute on function idiomas_api.servicio_estado_usuario(uuid), idiomas_api.servicio_validar_alta(text) to service_role;
reset role;
