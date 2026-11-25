-- =================================================================================================
-- App de idiomas · Migración 3: motor de evaluación y aprendizaje por alumno
-- Todo en Postgres, sin servicios externos ni IA de pago.
-- =================================================================================================
set role idiomas_propietario;

-- -------------------------------------------------------------------------------------------------
-- Utilidades
-- -------------------------------------------------------------------------------------------------
create or replace function idiomas.cfg_num(p_clave text, p_defecto numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select (valor #>> '{}')::numeric from idiomas.config where clave = p_clave), p_defecto)
$$;

create or replace function idiomas.quitar_tildes(p text) returns text
language sql immutable set search_path = '' as $$
  select translate(p, 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')
$$;

-- Normaliza para comparar. La entrada original se conserva aparte.
-- reglas: {"mayusculas": bool, "puntuacion": bool, "tildes": bool}  (true = la diferencia cuenta)
create or replace function idiomas.normalizar(p text, p_reglas jsonb default '{}'::jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := normalize(coalesce(p, ''), NFC);
begin
  v := translate(v, '’‘`´“”', '''''''''""');
  if not coalesce((p_reglas ->> 'mayusculas')::boolean, false) then v := lower(v); end if;
  if not coalesce((p_reglas ->> 'puntuacion')::boolean, false) then
    v := regexp_replace(v, '[.,;:!?¡¿"()«»…-]', ' ', 'g');
  end if;
  v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
  return v;
end $$;

-- Distancia de edición (Levenshtein) acotada, solo para detectar erratas menores.
create or replace function idiomas.distancia(a text, b text) returns integer
language plpgsql immutable set search_path = '' as $$
declare la int := length(a); lb int := length(b); prev int[]; cur int[]; i int; j int; costo int;
begin
  if a = b then return 0; end if;
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;
  if abs(la - lb) > 3 then return abs(la - lb); end if;
  prev := array(select generate_series(0, lb));
  for i in 1..la loop
    cur := array[i] || array_fill(0, array[lb]);
    for j in 1..lb loop
      costo := case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end;
      cur[j + 1] := least(prev[j + 1] + 1, cur[j] + 1, prev[j] + costo);
    end loop;
    prev := cur;
  end loop;
  return prev[lb + 1];
end $$;

-- Día lógico del alumno según su zona horaria
create or replace function idiomas.dia_logico(p_user uuid, p_ts timestamptz) returns date
language sql stable security definer set search_path = '' as $$
  select (p_ts at time zone coalesce((select zona_horaria from idiomas.miembros where user_id = p_user), 'UTC'))::date
$$;

create or replace function idiomas.nombre_modalidad(p text) returns text
language sql immutable set search_path = '' as $$
  select case p when 'escuchar' then 'comprensión auditiva' when 'hablar' then 'expresión oral'
                when 'leer' then 'lectura' when 'escribir' then 'escritura' else p end
$$;

create or replace function idiomas.numero_texto(n integer) returns text
language sql immutable set search_path = '' as $$
  select coalesce((array['un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'])[n], n::text)
$$;

-- -------------------------------------------------------------------------------------------------
-- Evaluación determinista (las claves nunca salen de la base salvo la solución tras responder)
-- -------------------------------------------------------------------------------------------------
create or replace function idiomas.evaluar(p_item text, p_version integer, p_respuesta text,
  p_fiabilidad numeric default null,
  out resultado text, out tipo_error text, out feedback text, out solucion text, out normalizada text)
language plpgsql stable security definer set search_path = '' as $$
declare
  k idiomas.item_claves; iv idiomas.item_versiones;
  v_reglas jsonb; v_acept text; v_cmp text; e jsonb; v_min int := 999; v_d int;
  v_tildes boolean;
begin
  select * into iv from idiomas.item_versiones where item_id = p_item and version = p_version;
  select * into k from idiomas.item_claves where item_id = p_item and version = p_version;
  if k.item_id is null then
    resultado := 'no_evaluable'; feedback := 'Este ejercicio no se pudo evaluar.'; normalizada := coalesce(p_respuesta, '');
    return;
  end if;
  v_reglas := k.reglas;
  v_tildes := coalesce((v_reglas ->> 'tildes')::boolean, false);
  solucion := coalesce(
    (select o ->> 'texto' from jsonb_array_elements(coalesce(iv.contenido -> 'opciones', '[]'::jsonb)) o
      where o ->> 'id' = k.opcion_correcta limit 1),
    k.aceptadas[1]);
  normalizada := idiomas.normalizar(p_respuesta, v_reglas);

  if coalesce(btrim(p_respuesta), '') = '' then
    resultado := 'omitida'; tipo_error := 'sin_respuesta'; feedback := 'No respondiste este ejercicio.'; return;
  end if;

  -- Voz: si el reconocedor no está seguro, es un problema técnico, no un error del alumno.
  if iv.modalidad = 'hablar' and p_fiabilidad is not null and p_fiabilidad < 0.4 then
    resultado := 'no_evaluable'; tipo_error := 'audio_incierto';
    feedback := 'No te escuchamos con claridad. Puedes intentarlo otra vez; no cuenta como error.'; return;
  end if;

  -- Selección: por identificador de opción
  if iv.tipo in ('seleccion', 'escuchar_seleccion') then
    if p_respuesta = k.opcion_correcta then resultado := 'correcta';
    else
      resultado := 'incorrecta'; tipo_error := iv.tipo_error_por_defecto;
      select x ->> 'feedback', coalesce(x ->> 'tipo', iv.tipo_error_por_defecto) into feedback, tipo_error
        from jsonb_array_elements(k.errores_previstos) x where x ->> 'respuesta' = p_respuesta limit 1;
      tipo_error := coalesce(tipo_error, iv.tipo_error_por_defecto);
    end if;
    return;
  end if;

  -- Texto (traducción, fichas, dictado, completar, transcripción de voz)
  foreach v_acept in array k.aceptadas loop
    v_cmp := idiomas.normalizar(v_acept, v_reglas);
    if normalizada = v_cmp then resultado := 'correcta'; solucion := v_acept; return; end if;
  end loop;

  -- Errores previstos: diferencias pequeñas que CAMBIAN el sentido (no son erratas)
  for e in select * from jsonb_array_elements(k.errores_previstos) loop
    if normalizada = idiomas.normalizar(e ->> 'respuesta', v_reglas) then
      resultado := 'incorrecta'; tipo_error := coalesce(e ->> 'tipo', iv.tipo_error_por_defecto);
      feedback := e ->> 'feedback'; return;
    end if;
  end loop;

  -- Tildes: solo se relajan si el ítem lo permite
  if not v_tildes then
    foreach v_acept in array k.aceptadas loop
      if idiomas.quitar_tildes(normalizada) = idiomas.quitar_tildes(idiomas.normalizar(v_acept, v_reglas)) then
        resultado := 'aceptable_con_aviso'; tipo_error := 'tildes'; solucion := v_acept;
        feedback := 'Correcto. Revisa las tildes: ' || v_acept; return;
      end if;
    end loop;
  end if;

  -- Errata menor (1 letra) en respuestas largas: aceptable con aviso
  foreach v_acept in array k.aceptadas loop
    v_d := idiomas.distancia(normalizada, idiomas.normalizar(v_acept, v_reglas));
    if v_d < v_min then v_min := v_d; solucion := v_acept; end if;
  end loop;
  if v_min = 1 and length(normalizada) >= 8 and iv.tipo <> 'fichas' then
    resultado := 'aceptable_con_aviso'; tipo_error := 'ortografia';
    feedback := 'Casi perfecto: hay una pequeña errata. Se escribe: ' || solucion; return;
  end if;

  resultado := 'incorrecta';
  tipo_error := case when v_min <= 2 and length(normalizada) >= 8 then 'ortografia' else iv.tipo_error_por_defecto end;
end $$;

reset role;
