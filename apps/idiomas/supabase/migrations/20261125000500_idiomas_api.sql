-- =================================================================================================
-- App de idiomas · Migración 5: API para el cliente (esquema idiomas_api, solo RPC)
-- Cada función valida en servidor: sesión válida + pertenencia activa + propiedad del recurso.
-- Las operaciones que cambian avance son idempotentes por ID de evento / ID de sesión.
-- =================================================================================================
set role idiomas_propietario;

create or replace function idiomas.racha(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  with d as (
    select fecha, fecha - (row_number() over (order by fecha))::int as g
      from idiomas.dias_estudio where user_id = p_user
  ), ult as (select max(fecha) as f from d)
  select case when (select f from ult) >= idiomas.dia_logico(p_user, now()) - 1
              then (select count(*)::int from d where g = (select g from d order by fecha desc limit 1))
              else 0 end
$$;

create or replace function idiomas.inscripcion_propia(p_insc uuid, p_user uuid) returns idiomas.inscripciones
language plpgsql stable security definer set search_path = '' as $$
declare i idiomas.inscripciones;
begin
  select * into i from idiomas.inscripciones where id = p_insc and user_id = p_user and estado <> 'eliminada';
  if i.id is null then raise exception 'inscripcion_no_existe' using errcode = 'P0002'; end if;
  return i;
end $$;

create or replace function idiomas.contar_sesion_dia(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  insert into idiomas.uso_diario (user_id, fecha, sesiones) values (p_user, idiomas.dia_logico(p_user, now()), 1)
  on conflict (user_id, fecha) do update set sesiones = idiomas.uso_diario.sesiones + 1
  returning sesiones into v_n;
  if v_n > idiomas.cfg_num('max_sesiones_dia', 40) then
    raise exception 'limite_sesiones_dia' using errcode = 'P0001', hint = 'Se alcanzó el límite diario de sesiones del piloto';
  end if;
end $$;

-- -------------------------------------------------------------------------------------------------
-- Pertenencia y perfil
-- -------------------------------------------------------------------------------------------------
create or replace function idiomas_api.unirme(p_codigo text, p_nombre text, p_zona text default null,
  p_idioma_interfaz text default 'es-419') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.uid(); c jsonb := idiomas.claims(); v_email text; cod idiomas.codigos_invitacion;
        v_rol text := 'alumno'; v_zona text := 'America/Guatemala';
begin
  if v is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  if exists (select 1 from idiomas.miembros where user_id = v) then
    return jsonb_build_object('ok', true, 'ya_era_miembro', true);
  end if;
  if coalesce((c ->> 'is_anonymous')::boolean, false) then raise exception 'cuenta_anonima_no_permitida'; end if;
  v_email := lower(c ->> 'email');
  if v_email is null or v_email = '' then raise exception 'correo_requerido'; end if;
  if split_part(v_email, '@', 2) in (select jsonb_array_elements_text(coalesce(idiomas.cfg('dominios_correo_bloqueados'), '[]'))) then
    raise exception 'cuenta_no_permitida';
  end if;
  if not coalesce((idiomas.cfg('inscripciones_abiertas') #>> '{}')::boolean, false) then
    raise exception 'inscripciones_cerradas';
  end if;
  perform pg_advisory_xact_lock(hashtext('idiomas.altas'));
  if (select count(*) from idiomas.miembros where estado = 'activo') >= idiomas.cfg_num('max_miembros', 50) then
    raise exception 'cupo_lleno';
  end if;
  if coalesce((idiomas.cfg('requiere_codigo_invitacion') #>> '{}')::boolean, true) then
    select * into cod from idiomas.codigos_invitacion
     where codigo = upper(btrim(coalesce(p_codigo, ''))) and activo and (vence_at is null or vence_at > now()) and usos < usos_max
     for update;
    if cod.codigo is null then raise exception 'codigo_invalido'; end if;
    update idiomas.codigos_invitacion set usos = usos + 1 where codigo = cod.codigo;
    v_rol := cod.rol;
  end if;
  if p_zona is not null and exists (select 1 from pg_catalog.pg_timezone_names where name = p_zona) then v_zona := p_zona; end if;
  insert into idiomas.miembros (user_id, rol, nombre_visible, idioma_interfaz, zona_horaria, codigo_invitacion)
  values (v, v_rol, left(coalesce(nullif(btrim(p_nombre), ''), split_part(v_email, '@', 1)), 60),
          coalesce(nullif(p_idioma_interfaz, ''), 'es-419'), v_zona, cod.codigo);
  return jsonb_build_object('ok', true, 'ya_era_miembro', false, 'rol', v_rol);
end $$;

create or replace function idiomas_api.mi_perfil() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := idiomas.uid(); m idiomas.miembros;
begin
  select * into m from idiomas.miembros where user_id = v and estado = 'activo';
  if m.user_id is null then return jsonb_build_object('miembro', false); end if;
  return jsonb_build_object(
    'miembro', true, 'rol', m.rol, 'nombre', m.nombre_visible, 'idioma_interfaz', m.idioma_interfaz,
    'zona_horaria', m.zona_horaria, 'consentimiento_reportes', m.consentimiento_reportes,
    'xp_total', coalesce((select sum(cantidad) from idiomas.xp_libro where user_id = v), 0),
    'racha', idiomas.racha(v),
    'inscripciones', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'curso_id', i.curso_id, 'titulo', c.titulo, 'idioma_base', c.idioma_base,
        'idioma_meta', c.idioma_meta, 'estado', i.estado, 'completado', i.completado_at is not null,
        'ultima_actividad_at', i.ultima_actividad_at) order by i.ultima_actividad_at desc nulls last, i.created_at)
      from idiomas.inscripciones i join idiomas.cursos c on c.id = i.curso_id
     where i.user_id = v and i.estado <> 'eliminada'), '[]'::jsonb));
end $$;

-- Cambiar el idioma de interfaz NO toca inscripciones ni sesiones.
create or replace function idiomas_api.actualizar_preferencias(p_idioma_interfaz text default null,
  p_zona text default null, p_consentimiento_reportes boolean default null, p_nombre text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro();
begin
  if p_zona is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = p_zona) then
    raise exception 'zona_invalida';
  end if;
  update idiomas.miembros set
    idioma_interfaz = coalesce(nullif(p_idioma_interfaz, ''), idioma_interfaz),
    zona_horaria = coalesce(p_zona, zona_horaria),
    consentimiento_reportes = coalesce(p_consentimiento_reportes, consentimiento_reportes),
    nombre_visible = coalesce(left(nullif(btrim(p_nombre), ''), 60), nombre_visible),
    updated_at = now()
   where user_id = v;
  return idiomas_api.mi_perfil();
end $$;

-- -------------------------------------------------------------------------------------------------
-- Catálogo e inscripciones (una por curso; cada curso conserva su propio avance)
-- -------------------------------------------------------------------------------------------------
create or replace function idiomas_api.catalogo(p_idioma_base text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'courseId', c.id, 'titulo', c.titulo, 'baseLocale', c.idioma_base, 'targetLocale', c.idioma_meta,
      'baseNombre', lb.nombre_nativo, 'targetNombre', lm.nombre_nativo,
      'publishedVersion', c.version_publicada, 'maxCefr', c.nivel_max, 'capabilities', c.capacidades,
      'estado', c.estado,
      'inscripcion_id', (select i.id from idiomas.inscripciones i where i.user_id = v and i.curso_id = c.id and i.estado <> 'eliminada'))
      order by c.idioma_base, c.titulo)
    from idiomas.cursos c
    join idiomas.lenguas lb on lb.codigo = c.idioma_base
    join idiomas.lenguas lm on lm.codigo = c.idioma_meta
   where c.estado in ('piloto', 'publicado') and c.version_publicada is not null
     and (p_idioma_base is null or c.idioma_base = p_idioma_base)), '[]'::jsonb);
end $$;

create or replace function idiomas_api.inscribirme(p_curso text, p_modo text default 'cero') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); c idiomas.cursos; i idiomas.inscripciones; v_primera text;
begin
  select * into c from idiomas.cursos where id = p_curso and estado in ('piloto', 'publicado') and version_publicada is not null;
  if c.id is null then raise exception 'curso_no_disponible'; end if;
  perform pg_advisory_xact_lock(hashtext(v::text || p_curso));
  select * into i from idiomas.inscripciones where user_id = v and curso_id = p_curso and estado <> 'eliminada';
  if i.id is not null then
    if i.estado = 'archivada' then update idiomas.inscripciones set estado = 'activa' where id = i.id; end if;
    return jsonb_build_object('inscripcion_id', i.id, 'nueva', false);
  end if;
  insert into idiomas.inscripciones (user_id, curso_id, version_curricular, modo_inicio)
  values (v, p_curso, c.version_publicada, case when p_modo = 'diagnostico' then 'diagnostico' else 'cero' end)
  returning * into i;
  select a.id into v_primera from idiomas.actividades a join idiomas.unidades u on u.id = a.unidad_id
   where u.curso_id = p_curso and u.version = c.version_publicada order by u.orden, a.orden limit 1;
  if v_primera is not null then
    insert into idiomas.actividad_progreso (inscripcion_id, actividad_id) values (i.id, v_primera);
  end if;
  return jsonb_build_object('inscripcion_id', i.id, 'nueva', true);
end $$;

create or replace function idiomas_api.archivar_inscripcion(p_insc uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); i idiomas.inscripciones := idiomas.inscripcion_propia(p_insc, v);
begin
  update idiomas.inscripciones set estado = 'archivada' where id = i.id;
  return jsonb_build_object('ok', true);
end $$;

-- Elimina el avance de UN curso. La fila queda como lápida ('eliminada') y sus sesiones se borran,
-- así que una sesión vieja sincronizada tarde no puede volver a crear avance.
create or replace function idiomas_api.eliminar_inscripcion(p_insc uuid, p_confirmacion text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); i idiomas.inscripciones := idiomas.inscripcion_propia(p_insc, v);
begin
  if p_confirmacion is distinct from 'ELIMINAR' then raise exception 'confirmacion_requerida'; end if;
  delete from idiomas.sesiones where inscripcion_id = i.id;
  delete from idiomas.actividad_progreso where inscripcion_id = i.id;
  delete from idiomas.dominio where inscripcion_id = i.id;
  delete from idiomas.hitos_curso where inscripcion_id = i.id;
  delete from idiomas.xp_libro where inscripcion_id = i.id;
  update idiomas.inscripciones set estado = 'eliminada', completado_at = null where id = i.id;
  return jsonb_build_object('ok', true);
end $$;

-- -------------------------------------------------------------------------------------------------
-- Ruta del curso
-- -------------------------------------------------------------------------------------------------
create or replace function idiomas_api.ruta(p_insc uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); i idiomas.inscripciones := idiomas.inscripcion_propia(p_insc, v);
        c idiomas.cursos; v_total int; v_hechas int;
begin
  select * into c from idiomas.cursos where id = i.curso_id;
  select count(*), count(*) filter (where ap.estado in ('completada', 'convalidada'))
    into v_total, v_hechas
    from idiomas.actividades a join idiomas.unidades u on u.id = a.unidad_id
    left join idiomas.actividad_progreso ap on ap.actividad_id = a.id and ap.inscripcion_id = i.id
   where u.curso_id = i.curso_id and u.version = i.version_curricular and a.obligatoria;
  return jsonb_build_object(
    'inscripcion_id', i.id, 'curso_id', c.id, 'titulo', c.titulo, 'idioma_base', c.idioma_base,
    'idioma_meta', c.idioma_meta, 'version', i.version_curricular, 'estado', i.estado,
    'avance', jsonb_build_object('hechas', v_hechas, 'total', v_total,
                                 'porcentaje', case when v_total = 0 then 0 else round(100.0 * v_hechas / v_total) end),
    'completado', i.completado_at is not null, 'completado_at', i.completado_at,
    'repasos_pendientes', (select count(*) from idiomas.dominio d where d.inscripcion_id = i.id and d.proximo_repaso <= now()),
    'siguiente', (select jsonb_build_object('actividad_id', a.id, 'titulo', a.titulo)
                    from idiomas.actividad_progreso ap join idiomas.actividades a on a.id = ap.actividad_id
                    join idiomas.unidades u on u.id = a.unidad_id
                   where ap.inscripcion_id = i.id and ap.estado in ('disponible', 'en_progreso')
                   order by u.orden, a.orden limit 1),
    'unidades', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'orden', u.orden, 'titulo', u.titulo, 'objetivo', u.objetivo, 'cefr', u.cefr, 'guia', u.guia,
        'actividades', (select jsonb_agg(jsonb_build_object(
            'id', a.id, 'titulo', a.titulo, 'tipo', a.tipo, 'obligatoria', a.obligatoria,
            'estado', coalesce(ap.estado, 'bloqueada'), 'mejor_precision', ap.mejor_precision, 'veces', coalesce(ap.veces, 0))
            order by a.orden)
          from idiomas.actividades a
          left join idiomas.actividad_progreso ap on ap.actividad_id = a.id and ap.inscripcion_id = i.id
         where a.unidad_id = u.id)) order by u.orden)
      from idiomas.unidades u where u.curso_id = i.curso_id and u.version = i.version_curricular), '[]'::jsonb));
end $$;

-- -------------------------------------------------------------------------------------------------
-- Sesiones
-- -------------------------------------------------------------------------------------------------
create or replace function idiomas_api.iniciar_leccion(p_sesion uuid, p_insc uuid, p_actividad text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); i idiomas.inscripciones; s idiomas.sesiones; a idiomas.actividades;
        v_estado text; v_n int; v_rep int;
begin
  select * into s from idiomas.sesiones where id = p_sesion;
  if s.id is not null then
    if s.user_id <> v then raise exception 'sesion_no_existe' using errcode = 'P0002'; end if;
    return idiomas.paquete(s.id);                                -- reanudar: mismo paquete
  end if;
  i := idiomas.inscripcion_propia(p_insc, v);
  if i.estado <> 'activa' then raise exception 'inscripcion_no_activa'; end if;
  select a2.* into a from idiomas.actividades a2 join idiomas.unidades u on u.id = a2.unidad_id
   where a2.id = p_actividad and u.curso_id = i.curso_id and u.version = i.version_curricular;
  if a.id is null then raise exception 'actividad_no_existe'; end if;
  select estado into v_estado from idiomas.actividad_progreso where inscripcion_id = i.id and actividad_id = a.id;
  if v_estado is null then raise exception 'actividad_bloqueada'; end if;
  perform idiomas.contar_sesion_dia(v);

  insert into idiomas.sesiones (id, user_id, inscripcion_id, actividad_id, modo, version_curricular, semilla)
  values (p_sesion, v, i.id, a.id, 'leccion', i.version_curricular, md5(p_sesion::text));
  insert into idiomas.sesion_items (sesion_id, posicion, item_id, item_version, origen)
  select p_sesion, row_number() over (order by ai.orden), ai.item_id, iv.version, 'nuevo'
    from idiomas.actividad_items ai join idiomas.item_vigente iv on iv.item_id = ai.item_id
   where ai.actividad_id = a.id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'actividad_sin_items'; end if;

  -- Una lección normal intercala repasos pendientes (no en pruebas de unidad)
  if a.tipo = 'leccion' then
    v_rep := idiomas.elegir_practica(p_sesion, idiomas.cfg_num('items_repaso_en_leccion', 2)::int, v_n + 1, false, false, true);
  end if;
  if v_estado = 'disponible' then
    update idiomas.actividad_progreso set estado = 'en_progreso' where inscripcion_id = i.id and actividad_id = a.id;
  end if;
  update idiomas.inscripciones set ultima_actividad_at = now() where id = i.id;
  return idiomas.paquete(p_sesion);
end $$;

-- Práctica personalizada (o mantenimiento si el curso ya se terminó)
create or replace function idiomas_api.armar_practica(p_sesion uuid, p_insc uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); i idiomas.inscripciones; s idiomas.sesiones; v_modo text; v_n int;
begin
  select * into s from idiomas.sesiones where id = p_sesion;
  if s.id is not null then
    if s.user_id <> v then raise exception 'sesion_no_existe' using errcode = 'P0002'; end if;
    return idiomas.paquete(s.id);
  end if;
  i := idiomas.inscripcion_propia(p_insc, v);
  if i.estado <> 'activa' then raise exception 'inscripcion_no_activa'; end if;
  perform idiomas.contar_sesion_dia(v);
  v_modo := case when i.completado_at is not null then 'mantenimiento' else 'repaso' end;
  insert into idiomas.sesiones (id, user_id, inscripcion_id, modo, version_curricular, semilla)
  values (p_sesion, v, i.id, v_modo, i.version_curricular,
          md5(p_sesion::text || idiomas.dia_logico(v, now())::text));
  v_n := idiomas.elegir_practica(p_sesion, idiomas.cfg_num('tamano_practica', 8)::int, 1, true, true);
  if v_n = 0 then raise exception 'sin_material_para_practicar' using hint = 'Completa una lección primero'; end if;
  update idiomas.inscripciones set ultima_actividad_at = now() where id = i.id;
  return idiomas.paquete(p_sesion)
    || jsonb_build_object('recomendaciones', (select jsonb_agg(jsonb_build_object(
          'habilidad_id', r.habilidad_id, 'modalidad', r.modalidad, 'motivo', r.motivo, 'explicacion', r.explicacion,
          'item_id', r.item_id) order by r.id) from idiomas.recomendaciones r where r.sesion_id = p_sesion));
end $$;

create or replace function idiomas_api.pedir_pista(p_sesion uuid, p_posicion integer, p_evento uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); s idiomas.sesiones; v_pista text; v_permite boolean;
begin
  select * into s from idiomas.sesiones where id = p_sesion and user_id = v;
  if s.id is null then raise exception 'sesion_no_existe' using errcode = 'P0002'; end if;
  if s.estado <> 'abierta' then raise exception 'sesion_cerrada'; end if;
  select coalesce(a.permite_pistas, true) into v_permite from idiomas.sesiones x
    left join idiomas.actividades a on a.id = x.actividad_id where x.id = p_sesion;
  if not v_permite then raise exception 'pistas_no_permitidas'; end if;
  select iv.pista into v_pista from idiomas.sesion_items si
    join idiomas.item_versiones iv on iv.item_id = si.item_id and iv.version = si.item_version
   where si.sesion_id = p_sesion and si.posicion = p_posicion;
  if v_pista is null then raise exception 'sin_pista'; end if;
  insert into idiomas.pistas_usadas (sesion_id, posicion, evento_id) values (p_sesion, p_posicion, p_evento)
  on conflict do nothing;
  return jsonb_build_object('posicion', p_posicion, 'pista', v_pista);
end $$;

create or replace function idiomas_api.responder(p_sesion uuid, p_evento uuid, p_posicion integer, p_respuesta text,
  p_pista_usada boolean default false, p_ocurrido_at timestamptz default null, p_fiabilidad numeric default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); s idiomas.sesiones; si idiomas.sesion_items; iv idiomas.item_versiones;
        it idiomas.items; ev record; v_prev jsonb; v_n int; v_total int; v_pista boolean; v_recibo jsonb; v_id bigint;
        v_ocurrido timestamptz; v_cal text; v_max_re int := idiomas.cfg_num('max_reintentos_item', 2)::int; v_ok boolean;
begin
  select recibo into v_prev from idiomas.intentos where sesion_id = p_sesion and evento_id = p_evento and user_id = v;
  if v_prev is not null then return v_prev || jsonb_build_object('duplicado', true); end if;

  select * into s from idiomas.sesiones where id = p_sesion for update;
  if s.id is null or s.user_id <> v then raise exception 'sesion_no_existe' using errcode = 'P0002'; end if;
  select recibo into v_prev from idiomas.intentos where sesion_id = p_sesion and evento_id = p_evento;
  if v_prev is not null then return v_prev || jsonb_build_object('duplicado', true); end if;
  if s.estado <> 'abierta' then raise exception 'sesion_cerrada'; end if;
  if not exists (select 1 from idiomas.inscripciones where id = s.inscripcion_id and estado = 'activa') then
    raise exception 'inscripcion_no_activa';
  end if;

  select * into si from idiomas.sesion_items where sesion_id = p_sesion and posicion = p_posicion;
  if si.sesion_id is null then raise exception 'posicion_invalida'; end if;
  select * into iv from idiomas.item_versiones where item_id = si.item_id and version = si.item_version;
  select * into it from idiomas.items where id = si.item_id;

  select count(*) filter (where posicion = p_posicion), count(*) into v_n, v_total
    from idiomas.intentos where sesion_id = p_sesion;
  if v_total >= idiomas.cfg_num('max_intentos_sesion', 80) then raise exception 'limite_intentos_sesion'; end if;
  if v_n > v_max_re then raise exception 'reintentos_agotados'; end if;
  v_n := v_n + 1;

  v_pista := coalesce(p_pista_usada, false)
          or exists (select 1 from idiomas.pistas_usadas where sesion_id = p_sesion and posicion = p_posicion);
  select * into ev from idiomas.evaluar(si.item_id, si.item_version, left(coalesce(p_respuesta, ''), 500), p_fiabilidad);
  v_ok := ev.resultado in ('correcta', 'aceptable_con_aviso');

  -- Hora del evento: se acepta la del dispositivo solo dentro de la ventana publicada.
  v_ocurrido := case when p_ocurrido_at between now() - make_interval(hours => idiomas.cfg_num('ventana_evento_tardio_horas', 72)::int)
                                            and now() + interval '5 minutes'
                     then p_ocurrido_at else now() end;

  v_recibo := jsonb_build_object(
    'evento_id', p_evento, 'posicion', p_posicion, 'numero_intento', v_n, 'resultado', ev.resultado,
    'correcta', v_ok, 'tipo_error', ev.tipo_error, 'pista_usada', v_pista,
    'feedback', coalesce(ev.feedback, case when v_ok then '¡Bien!' end),
    'solucion', case when ev.resultado in ('incorrecta', 'aceptable_con_aviso', 'omitida') then ev.solucion end,
    'explicacion', iv.explicacion,
    'reencolar', (ev.resultado in ('incorrecta', 'omitida') and v_n <= v_max_re)
              or (ev.resultado = 'no_evaluable' and v_n <= v_max_re));

  insert into idiomas.intentos (sesion_id, evento_id, user_id, inscripcion_id, posicion, item_id, item_version,
    habilidad_id, modalidad, numero_intento, respuesta, respuesta_normalizada, resultado, pista_usada, tipo_error,
    ocurrido_at, recibo)
  values (p_sesion, p_evento, v, s.inscripcion_id, p_posicion, si.item_id, si.item_version, it.habilidad_id,
    iv.modalidad, v_n, left(coalesce(p_respuesta, ''), 500), ev.normalizada, ev.resultado, v_pista, ev.tipo_error,
    v_ocurrido, v_recibo)
  returning id into v_id;

  v_cal := idiomas.aplicar_evidencia(v_id);
  v_recibo := v_recibo || jsonb_build_object('evidencia', v_cal);
  update idiomas.intentos set recibo = v_recibo where id = v_id;
  return v_recibo;
end $$;

create or replace function idiomas_api.completar_sesion(p_sesion uuid, p_evento uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); s idiomas.sesiones; i idiomas.inscripciones; a idiomas.actividades;
        v_total int; v_resp int; v_ok int; v_eval int; v_pistas int; v_prec numeric; v_superada boolean := true;
        v_prev_estado text; v_primera boolean := false; v_xp int := 0; v_n int; v_base int; v_dia date;
        v_dia_nuevo boolean := false; v_faltan int; v_curso_nuevo boolean := false; v_res jsonb; v_sig text;
begin
  select * into s from idiomas.sesiones where id = p_sesion for update;
  if s.id is null or s.user_id <> v then raise exception 'sesion_no_existe' using errcode = 'P0002'; end if;
  if s.estado = 'completada' then return s.resultado || jsonb_build_object('duplicado', true); end if;
  if s.estado = 'abandonada' then raise exception 'sesion_abandonada'; end if;
  select * into i from idiomas.inscripciones where id = s.inscripcion_id;
  if i.estado <> 'activa' then raise exception 'inscripcion_no_activa'; end if;

  select count(*) into v_total from idiomas.sesion_items where sesion_id = p_sesion;
  select count(distinct posicion) into v_resp from idiomas.intentos where sesion_id = p_sesion;
  if v_resp < v_total then raise exception 'sesion_incompleta' using hint = format('%s de %s ejercicios respondidos', v_resp, v_total); end if;

  select count(*) filter (where resultado in ('correcta', 'aceptable_con_aviso') and not pista_usada),
         count(*) filter (where resultado not in ('no_evaluable')),
         count(*) filter (where pista_usada)
    into v_ok, v_eval, v_pistas
    from idiomas.intentos where sesion_id = p_sesion and numero_intento = 1;
  v_prec := case when v_eval = 0 then 1 else round(v_ok::numeric / v_eval, 3) end;

  if s.modo = 'leccion' then
    select * into a from idiomas.actividades where id = s.actividad_id;
    if a.tipo = 'prueba_unidad' then v_superada := v_prec >= idiomas.cfg_num('umbral_prueba_unidad', 0.7); end if;
    select estado into v_prev_estado from idiomas.actividad_progreso where inscripcion_id = i.id and actividad_id = a.id for update;
    if v_superada then
      v_primera := coalesce(v_prev_estado not in ('completada', 'convalidada'), false);
      update idiomas.actividad_progreso set
        estado = case when estado = 'convalidada' then estado else 'completada' end,
        veces = veces + 1, mejor_precision = greatest(coalesce(mejor_precision, 0), v_prec),
        completada_at = coalesce(completada_at, now())
       where inscripcion_id = i.id and actividad_id = a.id;
      -- Desbloquea la siguiente actividad de la ruta
      select a2.id into v_sig from idiomas.actividades a2 join idiomas.unidades u2 on u2.id = a2.unidad_id
        join idiomas.unidades u on u.id = a.unidad_id
       where u2.curso_id = i.curso_id and u2.version = i.version_curricular
         and (u2.orden, a2.orden) > (u.orden, a.orden)
       order by u2.orden, a2.orden limit 1;
      if v_sig is not null then
        insert into idiomas.actividad_progreso (inscripcion_id, actividad_id) values (i.id, v_sig) on conflict do nothing;
      end if;
    else
      update idiomas.actividad_progreso set veces = veces + 1, mejor_precision = greatest(coalesce(mejor_precision, 0), v_prec)
       where inscripcion_id = i.id and actividad_id = a.id;
    end if;
  end if;

  -- Recompensas: una por fuente (restricción única). La primera completitud es aparte de la sesión.
  v_base := coalesce((idiomas.cfg('xp') ->> s.modo)::int, 10);
  insert into idiomas.xp_libro (user_id, inscripcion_id, fuente_tipo, fuente_id, cantidad)
  values (v, i.id, 'sesion', s.id::text, v_base) on conflict do nothing;
  get diagnostics v_n = row_count; if v_n > 0 then v_xp := v_xp + v_base; end if;
  if v_primera then
    v_base := coalesce((idiomas.cfg('xp') ->> 'primera_completitud')::int, 10);
    insert into idiomas.xp_libro (user_id, inscripcion_id, fuente_tipo, fuente_id, cantidad)
    values (v, i.id, 'primera_completitud', i.id::text || ':' || a.id, v_base) on conflict do nothing;
    get diagnostics v_n = row_count; if v_n > 0 then v_xp := v_xp + v_base; end if;
  end if;

  v_dia := idiomas.dia_logico(v, coalesce((select max(ocurrido_at) from idiomas.intentos where sesion_id = p_sesion), now()));
  insert into idiomas.dias_estudio (user_id, fecha, primera_sesion_id) values (v, v_dia, s.id) on conflict do nothing;
  get diagnostics v_n = row_count; v_dia_nuevo := v_n > 0;

  -- ¿Curso terminado? (todas las actividades obligatorias completas o convalidadas)
  if s.modo = 'leccion' and i.completado_at is null then
    select count(*) into v_faltan from idiomas.actividades a3 join idiomas.unidades u3 on u3.id = a3.unidad_id
      left join idiomas.actividad_progreso ap on ap.actividad_id = a3.id and ap.inscripcion_id = i.id
     where u3.curso_id = i.curso_id and u3.version = i.version_curricular and a3.obligatoria
       and coalesce(ap.estado, 'bloqueada') not in ('completada', 'convalidada');
    if v_faltan = 0 then
      update idiomas.inscripciones set completado_at = now() where id = i.id;
      insert into idiomas.hitos_curso (inscripcion_id, version_curricular, resumen)
      values (i.id, i.version_curricular, jsonb_build_object(
        'curso_id', i.curso_id,
        'por_modalidad', (select jsonb_object_agg(m.modalidad, m.nivel) from (
            select d.modalidad, round(avg(d.nivel), 2) as nivel from idiomas.dominio d
             where d.inscripcion_id = i.id group by d.modalidad) m),
        'habilidades', (select count(distinct habilidad_id) from idiomas.dominio where inscripcion_id = i.id)))
      on conflict do nothing;
      v_curso_nuevo := true;
    end if;
  end if;

  v_res := jsonb_build_object(
    'sesion_id', s.id, 'modo', s.modo, 'actividad_id', s.actividad_id,
    'ejercicios', v_total, 'aciertos_primer_intento', v_ok, 'evaluados', v_eval, 'precision', v_prec,
    'pistas', v_pistas, 'superada', v_superada, 'primera_completitud', v_primera,
    'xp_ganado', v_xp, 'dia_estudio_nuevo', v_dia_nuevo, 'racha', idiomas.racha(v),
    'curso_completado', v_curso_nuevo,
    'errores', coalesce((select jsonb_agg(distinct jsonb_build_object('habilidad', coalesce(h.nombre ->> 'es', h.id), 'modalidad', x.modalidad, 'tipo_error', x.tipo_error))
        from idiomas.intentos x join idiomas.habilidades h on h.id = x.habilidad_id
       where x.sesion_id = p_sesion and x.numero_intento = 1 and x.resultado = 'incorrecta'), '[]'::jsonb));
  update idiomas.sesiones set estado = 'completada', cierre_evento_id = p_evento, resultado = v_res, completada_at = now()
   where id = s.id;
  update idiomas.inscripciones set ultima_actividad_at = now() where id = i.id;
  return v_res;
end $$;

-- Abandonar: guarda el estado, sin recompensas de completitud.
create or replace function idiomas_api.abandonar_sesion(p_sesion uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro();
begin
  update idiomas.sesiones set estado = 'abandonada' where id = p_sesion and user_id = v and estado = 'abierta';
  return jsonb_build_object('ok', true);
end $$;

-- Sincronización offline: lote ordenado de eventos con un recibo por evento.
-- [{ "tipo": "pista"|"respuesta"|"cierre", "evento_id": uuid, "posicion": n, "respuesta": "...",
--    "pista_usada": bool, "ocurrido_at": iso, "fiabilidad": 0..1 }]
create or replace function idiomas_api.sincronizar(p_sesion uuid, p_eventos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); e jsonb; r jsonb; v_recibos jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_eventos) <> 'array' or jsonb_array_length(p_eventos) > 200 then raise exception 'lote_invalido'; end if;
  for e in select * from jsonb_array_elements(p_eventos) loop
    begin
      if e ->> 'tipo' = 'pista' then
        r := idiomas_api.pedir_pista(p_sesion, (e ->> 'posicion')::int, (e ->> 'evento_id')::uuid);
        r := jsonb_build_object('estado', 'aceptado');
      elsif e ->> 'tipo' = 'respuesta' then
        r := idiomas_api.responder(p_sesion, (e ->> 'evento_id')::uuid, (e ->> 'posicion')::int, e ->> 'respuesta',
               coalesce((e ->> 'pista_usada')::boolean, false), (e ->> 'ocurrido_at')::timestamptz, (e ->> 'fiabilidad')::numeric);
        r := jsonb_build_object('estado', case when coalesce((r ->> 'duplicado')::boolean, false) then 'duplicado' else 'aceptado' end,
                                'recibo', r - 'duplicado');
      elsif e ->> 'tipo' = 'cierre' then
        r := idiomas_api.completar_sesion(p_sesion, (e ->> 'evento_id')::uuid);
        r := jsonb_build_object('estado', case when coalesce((r ->> 'duplicado')::boolean, false) then 'duplicado' else 'aceptado' end,
                                'resultado', r - 'duplicado');
      else
        r := jsonb_build_object('estado', 'rechazado', 'motivo', 'tipo_desconocido');
      end if;
    exception when others then
      r := jsonb_build_object('estado', case when sqlerrm in ('sesion_incompleta') then 'esperar_dependencias' else 'rechazado' end,
                              'motivo', sqlerrm);
    end;
    v_recibos := v_recibos || jsonb_build_array(jsonb_build_object('evento_id', e ->> 'evento_id', 'tipo', e ->> 'tipo') || r);
  end loop;
  return jsonb_build_object('sesion_id', p_sesion, 'recibos', v_recibos);
end $$;

-- -------------------------------------------------------------------------------------------------
-- Dominio, recomendaciones y capacidades
-- -------------------------------------------------------------------------------------------------
create or replace function idiomas_api.mi_dominio(p_insc uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); i idiomas.inscripciones := idiomas.inscripcion_propia(p_insc, v); c idiomas.cursos;
begin
  select * into c from idiomas.cursos where id = i.curso_id;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'habilidad_id', d.habilidad_id, 'habilidad', coalesce(h.nombre ->> c.idioma_base, h.id), 'modalidad', d.modalidad,
      'nivel', d.nivel, 'paso', d.paso, 'proximo_repaso', d.proximo_repaso, 'pendiente', d.proximo_repaso <= now(),
      'aciertos_independientes', d.aciertos_independientes, 'aciertos_con_ayuda', d.aciertos_con_ayuda,
      'correcciones', d.correcciones, 'fallos', d.fallos, 'fallos_sin_pista_recientes', d.fallos_sin_pista_recientes,
      'ultimo_tipo_error', d.ultimo_tipo_error) order by d.habilidad_id, d.modalidad)
    from idiomas.dominio d join idiomas.habilidades h on h.id = d.habilidad_id where d.inscripcion_id = i.id), '[]'::jsonb);
end $$;

create or replace function idiomas_api.capacidades() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro();
begin
  return jsonb_build_object(
    'ia_conversacion', coalesce(idiomas.cfg('ia_conversacion'), '{"habilitada": false}'),
    'evaluacion_ia', coalesce(idiomas.cfg('evaluacion_ia'), '{"habilitada": false}'),
    'voz', 'dispositivo',
    'limites', jsonb_build_object('max_sesiones_dia', idiomas.cfg_num('max_sesiones_dia', 40),
      'max_bytes_medio', idiomas.cfg_num('max_bytes_medio', 1048576)));
end $$;

-- Conversación con IA: interfaz preparada, desactivada en el piloto. No llama a ningún proveedor.
create or replace function idiomas_api.iniciar_conversacion(p_insc uuid, p_escenario text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); i idiomas.inscripciones := idiomas.inscripcion_propia(p_insc, v); c jsonb;
begin
  c := coalesce(idiomas.cfg('ia_conversacion'), '{"habilitada": false}');
  if not coalesce((c ->> 'habilitada')::boolean, false) or c ->> 'proveedor' is null then
    return jsonb_build_object('disponible', false, 'motivo', 'desactivada_en_piloto',
      'alternativa', 'Practica el diálogo de la unidad en la sección Práctica.');
  end if;
  -- Un proveedor real emitiría aquí un token efímero desde un servicio de servidor.
  return jsonb_build_object('disponible', false, 'motivo', 'proveedor_no_implementado');
end $$;

create or replace function idiomas_api.reportar_item(p_sesion uuid, p_posicion integer, p_tipo text,
  p_comentario text default null, p_respuesta text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro(); si idiomas.sesion_items; v_n int; v_consent boolean;
begin
  select si2.* into si from idiomas.sesion_items si2 join idiomas.sesiones s on s.id = si2.sesion_id
   where si2.sesion_id = p_sesion and si2.posicion = p_posicion and s.user_id = v;
  if si.sesion_id is null then raise exception 'posicion_invalida'; end if;
  insert into idiomas.uso_diario (user_id, fecha, reportes) values (v, idiomas.dia_logico(v, now()), 1)
  on conflict (user_id, fecha) do update set reportes = idiomas.uso_diario.reportes + 1 returning reportes into v_n;
  if v_n > idiomas.cfg_num('max_reportes_dia', 20) then raise exception 'limite_reportes_dia'; end if;
  select consentimiento_reportes into v_consent from idiomas.miembros where user_id = v;
  insert into idiomas.reportes_contenido (user_id, sesion_id, item_id, item_version, tipo, comentario, respuesta)
  values (v, p_sesion, si.item_id, si.item_version, p_tipo, left(p_comentario, 500),
          case when v_consent then left(p_respuesta, 300) end);
  return jsonb_build_object('ok', true, 'respuesta_guardada', coalesce(v_consent, false) and p_respuesta is not null);
end $$;

-- Borra TODOS los datos de idiomas de quien llama (no toca Auth ni otras apps).
create or replace function idiomas_api.eliminar_mi_perfil(p_confirmacion text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := idiomas.exigir_miembro();
begin
  if p_confirmacion is distinct from 'ELIMINAR' then raise exception 'confirmacion_requerida'; end if;
  delete from idiomas.miembros where user_id = v;   -- en cascada: inscripciones, sesiones, intentos, evidencia, dominio…
  return jsonb_build_object('ok', true, 'eliminado', true);
end $$;

-- Permisos: solo authenticated ejecuta la API (nunca anon).
revoke all on all functions in schema idiomas_api from public;
grant execute on all functions in schema idiomas_api to authenticated;

reset role;
