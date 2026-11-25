-- =================================================================================================
-- App de idiomas · Migración 4: aprendizaje por alumno
--   · aplicar_evidencia: actualiza el dominio UNA vez por intento (evidencia única por intento)
--   · elegir_practica:  arma la práctica combinando pendientes, errores recurrentes, material nuevo
--                       y variedad de modalidades; verifica con OTRO enunciado y explica el porqué.
-- =================================================================================================
set role idiomas_propietario;

create or replace function idiomas.aplicar_evidencia(p_intento bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare
  t idiomas.intentos; d idiomas.dominio;
  v_int jsonb := coalesce(idiomas.cfg('intervalos_repaso_dias'), '[1,3,7,14,30]'::jsonb);
  v_n int; v_calidad text; v_ok boolean; v_superficial boolean; v_id bigint;
  v_fallo_min numeric := idiomas.cfg_num('repaso_tras_fallo_minutos', 10);
begin
  v_n := jsonb_array_length(v_int);
  select * into t from idiomas.intentos where id = p_intento;
  v_ok := t.resultado in ('correcta', 'aceptable_con_aviso');
  v_calidad := case
    when t.resultado in ('no_evaluable', 'omitida') then 'no_evaluable'
    when t.numero_intento > 1 then case when v_ok then 'correccion' else 'fallo' end
    when v_ok and t.pista_usada then 'con_ayuda'
    when v_ok then 'independiente'
    when t.pista_usada then 'fallo_con_ayuda'
    else 'fallo' end;

  insert into idiomas.evidencias (intento_id, user_id, inscripcion_id, habilidad_id, modalidad, item_id, item_version, calidad, tipo_error)
  values (t.id, t.user_id, t.inscripcion_id, t.habilidad_id, t.modalidad, t.item_id, t.item_version, v_calidad, t.tipo_error)
  on conflict (intento_id) do nothing
  returning id into v_id;
  if v_id is null or v_calidad = 'no_evaluable' then return v_calidad; end if;  -- ya aplicado o técnico

  insert into idiomas.dominio (inscripcion_id, habilidad_id, modalidad, user_id)
  values (t.inscripcion_id, t.habilidad_id, t.modalidad, t.user_id) on conflict do nothing;
  select * into d from idiomas.dominio
   where inscripcion_id = t.inscripcion_id and habilidad_id = t.habilidad_id and modalidad = t.modalidad for update;

  v_superficial := t.tipo_error in ('ortografia', 'tildes');

  if v_calidad = 'independiente' then
    -- El intervalo solo avanza cuando el repaso ya tocaba (o es la primera vez): varios aciertos el
    -- mismo día no saltan de 1 a 30 días.
    if d.proximo_repaso is null or d.proximo_repaso <= now() + interval '6 hours' then
      d.paso := least(d.paso + 1, v_n - 1);
      d.proximo_repaso := now() + make_interval(days => (v_int ->> d.paso)::int);
    end if;
    d.nivel := d.nivel + (case when t.resultado = 'correcta' then 0.25 else 0.2 end) * (1 - d.nivel);
    d.aciertos_independientes := d.aciertos_independientes + 1;
    d.fallos_sin_pista_recientes := 0;
  elsif v_calidad = 'con_ayuda' then
    -- Acierto con pista: NO avanza el intervalo y el repaso queda más cerca que tras un acierto solo.
    d.paso := greatest(d.paso, -1);
    d.proximo_repaso := least(coalesce(d.proximo_repaso, 'infinity'), now() + make_interval(days => (v_int ->> 0)::int));
    d.nivel := d.nivel + 0.08 * (1 - d.nivel);
    d.aciertos_con_ayuda := d.aciertos_con_ayuda + 1;
  elsif v_calidad = 'correccion' then
    d.nivel := d.nivel + 0.03 * (1 - d.nivel);
    d.correcciones := d.correcciones + 1;
  elsif v_calidad in ('fallo', 'fallo_con_ayuda') then
    if t.numero_intento = 1 then
      -- Fallo conceptual: reinicia la cadena y adelanta el repaso. Lapsus superficial: retrocede un paso.
      d.paso := case when v_superficial then greatest(d.paso - 1, -1) else -1 end;
      d.nivel := d.nivel * (case when v_superficial then 0.85 when v_calidad = 'fallo' then 0.6 else 0.7 end);
      d.proximo_repaso := now() + make_interval(mins => v_fallo_min::int);
      if v_calidad = 'fallo' then d.fallos_sin_pista_recientes := d.fallos_sin_pista_recientes + 1; end if;
    end if;
    d.fallos := d.fallos + 1;
    d.ultimo_tipo_error := t.tipo_error;
    d.ultimo_item_fallado := t.item_id;
  end if;

  update idiomas.dominio set
    paso = d.paso, proximo_repaso = d.proximo_repaso, nivel = round(d.nivel, 3),
    aciertos_independientes = d.aciertos_independientes, aciertos_con_ayuda = d.aciertos_con_ayuda,
    correcciones = d.correcciones, fallos = d.fallos, fallos_sin_pista_recientes = d.fallos_sin_pista_recientes,
    ultimo_tipo_error = d.ultimo_tipo_error, ultimo_item_fallado = d.ultimo_item_fallado, ultima_evidencia_at = now()
   where inscripcion_id = d.inscripcion_id and habilidad_id = d.habilidad_id and modalidad = d.modalidad;
  return v_calidad;
end $$;

-- Explicación simple de cada recomendación
create or replace function idiomas.explicar(p_motivo text, p_habilidad text, p_modalidad text, p_n integer, p_paso integer)
returns text language sql immutable set search_path = '' as $$
  select case p_motivo
    when 'errores_recurrentes' then format('Repasar %s (%s) porque fallaste %s ejercicios sin pistas.',
         p_habilidad, idiomas.nombre_modalidad(p_modalidad), idiomas.numero_texto(p_n))
    when 'fallo_reciente' then format('Repasar %s (%s) porque fallaste un ejercicio sin pistas; ahora con otro enunciado.',
         p_habilidad, idiomas.nombre_modalidad(p_modalidad))
    when 'solo_con_ayuda' then format('Practicar %s (%s) sin pistas: hasta ahora solo acertaste con ayuda.',
         p_habilidad, idiomas.nombre_modalidad(p_modalidad))
    when 'repaso_vencido' then format('Repasar %s (%s): hoy toca repaso espaciado.',
         p_habilidad, idiomas.nombre_modalidad(p_modalidad))
    when 'refuerzo' then format('Reforzar %s (%s): es lo que tienes menos dominado.',
         p_habilidad, idiomas.nombre_modalidad(p_modalidad))
    else format('Practicar %s (%s).', p_habilidad, idiomas.nombre_modalidad(p_modalidad)) end
$$;

-- Elige un ítem para (habilidad, modalidad): prefiere OTRO enunciado distinto del último fallado y
-- el visto hace más tiempo. Solo usa la modalidad pedida: escuchar, hablar, leer y escribir se
-- evalúan por separado.
create or replace function idiomas.elegir_item(p_sesion uuid, p_curso text, p_user uuid, p_habilidad text,
  p_modalidad text, p_evitar text, p_semilla text, out item_id text, out item_version integer)
language sql stable security definer set search_path = '' as $$
  select iv.item_id, iv.version
    from idiomas.item_vigente iv join idiomas.items i on i.id = iv.item_id
   where i.curso_id = p_curso and i.habilidad_id = p_habilidad and iv.modalidad = p_modalidad
     and iv.item_id not in (select si.item_id from idiomas.sesion_items si where si.sesion_id = p_sesion)
   order by (iv.item_id = coalesce(p_evitar, '')),
            (select max(x.recibido_at) from idiomas.intentos x where x.user_id = p_user and x.item_id = iv.item_id) asc nulls first,
            md5(p_semilla || iv.item_id)
   limit 1
$$;

-- Agrega hasta p_n ítems a la sesión a partir de p_posicion. Devuelve cuántos agregó.
create or replace function idiomas.elegir_practica(p_sesion uuid, p_n integer, p_posicion integer, p_incluir_nuevo boolean,
  p_incluir_refuerzo boolean default true, p_solo_vencidos boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  s idiomas.sesiones; v_curso text; v_base text; r record; v_item text; v_ver int;
  v_pos int := p_posicion; v_agregados int := 0; v_expl text; v_origen text; v_nuevos int;
begin
  select * into s from idiomas.sesiones where id = p_sesion;
  select c.id, c.idioma_base into v_curso, v_base
    from idiomas.inscripciones i join idiomas.cursos c on c.id = i.curso_id where i.id = s.inscripcion_id;

  -- 1) Pendientes: errores recurrentes > fallo reciente > solo con ayuda > repaso vencido.
  --    Se intercalan modalidades (row_number por modalidad) para variar los ejercicios.
  for r in
    with d as (
      select d.*, coalesce(h.nombre ->> v_base, d.habilidad_id) as hnombre,
        case when d.fallos_sin_pista_recientes >= 2 then 'errores_recurrentes'
             when d.fallos_sin_pista_recientes = 1 then 'fallo_reciente'
             when d.aciertos_independientes = 0 and d.aciertos_con_ayuda > 0 then 'solo_con_ayuda'
             when d.proximo_repaso <= now() then 'repaso_vencido' end as motivo
        from idiomas.dominio d join idiomas.habilidades h on h.id = d.habilidad_id
       where d.inscripcion_id = s.inscripcion_id
    ), p as (
      select d.*, case motivo when 'errores_recurrentes' then 4 when 'fallo_reciente' then 3
                              when 'solo_con_ayuda' then 2 else 1 end as prioridad
        from d where motivo is not null and (not p_solo_vencidos or d.proximo_repaso <= now())
    )
    select p.*, row_number() over (partition by p.modalidad order by p.prioridad desc, p.proximo_repaso) as rn
      from p order by rn, prioridad desc, proximo_repaso, habilidad_id
  loop
    exit when v_agregados >= p_n;
    select e.item_id, e.item_version into v_item, v_ver
      from idiomas.elegir_item(p_sesion, v_curso, s.user_id, r.habilidad_id, r.modalidad, r.ultimo_item_fallado, s.semilla) e;
    continue when v_item is null;
    v_origen := case when r.motivo in ('errores_recurrentes', 'fallo_reciente')
                     then case when v_item = r.ultimo_item_fallado then 'error' else 'transferencia' end
                     else 'repaso' end;
    v_expl := idiomas.explicar(r.motivo, r.hnombre, r.modalidad, r.fallos_sin_pista_recientes, r.paso);
    insert into idiomas.sesion_items (sesion_id, posicion, item_id, item_version, origen, motivo)
    values (p_sesion, v_pos, v_item, v_ver, v_origen, v_expl);
    insert into idiomas.recomendaciones (sesion_id, inscripcion_id, user_id, habilidad_id, modalidad, motivo, explicacion, item_id)
    values (p_sesion, s.inscripcion_id, s.user_id, r.habilidad_id, r.modalidad, r.motivo, v_expl, v_item);
    v_pos := v_pos + 1; v_agregados := v_agregados + 1;
  end loop;

  -- 2) Material nuevo: ítems de la siguiente actividad disponible que el alumno aún no vio.
  if p_incluir_nuevo and v_agregados < p_n then
    v_nuevos := greatest(1, (p_n - v_agregados) / 2);
    for r in
      select ai.item_id, iv.version, a.titulo, iv.modalidad, it.habilidad_id
        from idiomas.actividad_progreso ap
        join idiomas.actividades a on a.id = ap.actividad_id
        join idiomas.unidades u on u.id = a.unidad_id
        join idiomas.actividad_items ai on ai.actividad_id = a.id
        join idiomas.items it on it.id = ai.item_id
        join idiomas.item_vigente iv on iv.item_id = ai.item_id
       where ap.inscripcion_id = s.inscripcion_id and ap.estado in ('disponible', 'en_progreso')
         and not exists (select 1 from idiomas.intentos x where x.user_id = s.user_id and x.item_id = ai.item_id)
         and ai.item_id not in (select si.item_id from idiomas.sesion_items si where si.sesion_id = p_sesion)
       order by u.orden, a.orden, ai.orden
       limit v_nuevos
    loop
      v_expl := format('Material nuevo de «%s».', r.titulo);
      insert into idiomas.sesion_items (sesion_id, posicion, item_id, item_version, origen, motivo)
      values (p_sesion, v_pos, r.item_id, r.version, 'nuevo', v_expl);
      insert into idiomas.recomendaciones (sesion_id, inscripcion_id, user_id, habilidad_id, modalidad, motivo, explicacion, item_id)
      values (p_sesion, s.inscripcion_id, s.user_id, r.habilidad_id, r.modalidad, 'nuevo', v_expl, r.item_id);
      v_pos := v_pos + 1; v_agregados := v_agregados + 1;
    end loop;
  end if;

  -- 3) Refuerzo: lo menos dominado (variando modalidad) hasta completar.
  if p_incluir_refuerzo and v_agregados < p_n then
    for r in
      select d.*, coalesce(h.nombre ->> v_base, d.habilidad_id) as hnombre,
             row_number() over (partition by d.modalidad order by d.nivel, d.ultima_evidencia_at) as rn
        from idiomas.dominio d join idiomas.habilidades h on h.id = d.habilidad_id
       where d.inscripcion_id = s.inscripcion_id
         and not exists (select 1 from idiomas.recomendaciones r0 where r0.sesion_id = p_sesion
                          and r0.habilidad_id = d.habilidad_id and r0.modalidad = d.modalidad)
       order by rn, d.nivel, d.habilidad_id
    loop
      exit when v_agregados >= p_n;
      select e.item_id, e.item_version into v_item, v_ver
        from idiomas.elegir_item(p_sesion, v_curso, s.user_id, r.habilidad_id, r.modalidad, r.ultimo_item_fallado, s.semilla) e;
      continue when v_item is null;
      v_expl := idiomas.explicar('refuerzo', r.hnombre, r.modalidad, 0, r.paso);
      insert into idiomas.sesion_items (sesion_id, posicion, item_id, item_version, origen, motivo)
      values (p_sesion, v_pos, v_item, v_ver, 'refuerzo', v_expl);
      insert into idiomas.recomendaciones (sesion_id, inscripcion_id, user_id, habilidad_id, modalidad, motivo, explicacion, item_id)
      values (p_sesion, s.inscripcion_id, s.user_id, r.habilidad_id, r.modalidad, 'refuerzo', v_expl, v_item);
      v_pos := v_pos + 1; v_agregados := v_agregados + 1;
    end loop;
  end if;
  return v_agregados;
end $$;

-- Paquete público de una sesión: NUNCA incluye claves de respuesta. Opciones y fichas se barajan
-- con la semilla de la sesión, así que reanudar devuelve el mismo paquete.
create or replace function idiomas.paquete(p_sesion uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sesion_id', s.id, 'modo', s.modo, 'estado', s.estado, 'actividad_id', s.actividad_id,
    'version_curricular', s.version_curricular, 'curso_id', i.curso_id,
    'permite_pistas', coalesce(a.permite_pistas, true),
    'max_reintentos_item', idiomas.cfg_num('max_reintentos_item', 2),
    'voz', (select l.voz_tts from idiomas.lenguas l where l.codigo = c.idioma_meta),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'posicion', si.posicion, 'item_id', si.item_id, 'version', si.item_version,
        'tipo', iv.tipo, 'modalidad', iv.modalidad, 'origen', si.origen, 'motivo', si.motivo,
        'habilidad', coalesce(h.nombre ->> c.idioma_base, h.id),
        'tiene_pista', iv.pista is not null and coalesce(a.permite_pistas, true),
        'contenido', (iv.contenido - 'opciones' - 'fichas')
          || case when iv.contenido ? 'opciones' then jsonb_build_object('opciones',
               (select jsonb_agg(o order by md5(s.semilla || si.posicion || (o ->> 'id')))
                  from jsonb_array_elements(iv.contenido -> 'opciones') o)) else '{}'::jsonb end
          || case when iv.contenido ? 'fichas' then jsonb_build_object('fichas',
               (select jsonb_agg(f order by md5(s.semilla || si.posicion || f::text || n))
                  from jsonb_array_elements(iv.contenido -> 'fichas') with ordinality as x(f, n))) else '{}'::jsonb end)
        order by si.posicion)
        from idiomas.sesion_items si
        join idiomas.item_versiones iv on iv.item_id = si.item_id and iv.version = si.item_version
        join idiomas.items it on it.id = si.item_id
        join idiomas.habilidades h on h.id = it.habilidad_id
       where si.sesion_id = s.id), '[]'::jsonb))
    from idiomas.sesiones s
    join idiomas.inscripciones i on i.id = s.inscripcion_id
    join idiomas.cursos c on c.id = i.curso_id
    left join idiomas.actividades a on a.id = s.actividad_id
   where s.id = p_sesion
$$;

reset role;
