-- =================================================================================================
-- Puente · Migración 1: base. Pensada para un proyecto Supabase DEDICADO a Puente.
--
-- · Esquemas propios:  idiomas      → datos (no expuesto por la API)
--                      idiomas_api  → únicas operaciones invocables desde el cliente (RPC)
-- · Rol propietario:   idiomas_propietario (NOLOGIN). Es dueño de tablas y funciones de idiomas y
--                      NO tiene privilegios sobre public, auth ni storage. Las funciones SECURITY
--                      DEFINER corren con este rol (mínimo privilegio).
-- · Pertenencia:       idiomas.miembros. Tener usuario en Auth NO da acceso: todas las operaciones y
--                      políticas exigen una fila activa en miembros.
-- =================================================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'idiomas_propietario') then
    create role idiomas_propietario nologin noinherit;
  end if;
end $$;
grant idiomas_propietario to postgres;   -- para poder crear objetos con ese dueño en las migraciones

create schema if not exists idiomas authorization idiomas_propietario;
create schema if not exists idiomas_api authorization idiomas_propietario;
revoke all on schema idiomas, idiomas_api from public;
grant usage on schema idiomas to authenticated;        -- solo para las políticas RLS y lecturas propias
grant usage on schema idiomas_api to authenticated, service_role;

set role idiomas_propietario;

-- Ninguna función nueva de este rol queda ejecutable por PUBLIC (el permiso por defecto de Postgres
-- solo se puede quitar de forma global para el rol, no por esquema). Cada función expuesta se
-- concede explícitamente a authenticated o service_role.
alter default privileges for role idiomas_propietario revoke execute on functions from public;
alter default privileges for role idiomas_propietario in schema idiomas revoke all on tables from public;

-- -------------------------------------------------------------------------------------------------
-- Configuración y límites del piloto (todo ajustable sin desplegar código)
-- -------------------------------------------------------------------------------------------------
create table idiomas.config (
  clave text primary key,
  valor jsonb not null,
  descripcion text not null,
  updated_at timestamptz not null default now()
);

insert into idiomas.config (clave, valor, descripcion) values
  ('inscripciones_abiertas', 'true', 'Permite nuevas altas de miembros'),
  ('requiere_codigo_invitacion', 'true', 'Las altas necesitan un código de invitación del piloto'),
  ('max_miembros', '50', 'Tope de miembros activos del piloto'),
  ('dominios_correo_bloqueados', '[]', 'Dominios de correo que no pueden unirse (p. ej. cuentas técnicas)'),
  ('max_sesiones_dia', '40', 'Sesiones (lección o repaso) por alumno y día'),
  ('max_intentos_sesion', '80', 'Respuestas por sesión (incluye reintentos)'),
  ('max_reintentos_item', '2', 'Veces que un ítem fallado vuelve a aparecer en la misma sesión'),
  ('max_reportes_dia', '20', 'Reportes de contenido por alumno y día'),
  ('max_bytes_medio', '1048576', 'Tamaño máximo de cada archivo multimedia (bytes)'),
  ('intervalos_repaso_dias', '[1, 3, 7, 14, 30]', 'Intervalos del repaso espaciado ante aciertos independientes'),
  ('repaso_tras_fallo_minutos', '10', 'Tras un fallo conceptual el concepto vuelve a estar pendiente en estos minutos'),
  ('items_repaso_en_leccion', '2', 'Ítems de repaso pendientes que se intercalan en una lección'),
  ('tamano_practica', '8', 'Ítems de una práctica personalizada'),
  ('ventana_evento_tardio_horas', '72', 'Antigüedad máxima aceptada para la hora local de un evento offline'),
  ('xp', '{"leccion": 20, "repaso": 10, "mantenimiento": 10, "primera_completitud": 10}', 'XP base por tipo de sesión'),
  ('muestra_minima_revision', '20', 'Alumnos distintos necesarios antes de marcar un ítem para revisión'),
  ('umbral_precision_baja', '0.5', 'Precisión al primer intento por debajo de la cual un ítem se analiza'),
  ('umbral_concentracion_respuesta', '0.5', 'Parte de los fallos que comparten la misma respuesta (posible variante válida)'),
  ('umbral_reportes_validez', '0.1', 'Proporción de alumnos que reportan "mi respuesta es válida"'),
  ('ia_conversacion', '{"habilitada": false, "proveedor": null}', 'Conversación con IA: desactivada en el piloto (sin proveedores de pago)'),
  ('evaluacion_ia', '{"habilitada": false}', 'Evaluación de respuestas abiertas con IA: desactivada');

create or replace function idiomas.cfg(p_clave text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select valor from idiomas.config where clave = p_clave
$$;

-- -------------------------------------------------------------------------------------------------
-- Identidad y pertenencia
-- -------------------------------------------------------------------------------------------------
-- auth.uid() equivalente sin depender de privilegios sobre el esquema auth.
create or replace function idiomas.uid() returns uuid
language sql stable set search_path = '' as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('request.jwt.claim.sub', true), '')), '')::uuid
$$;

create or replace function idiomas.claims() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create table idiomas.miembros (
  user_id uuid primary key,
  rol text not null default 'alumno' check (rol in ('alumno', 'editor', 'revisor', 'admin')),
  estado text not null default 'activo' check (estado in ('activo', 'suspendido')),
  nombre_visible text not null check (length(nombre_visible) between 1 and 60),
  idioma_interfaz text not null default 'es-419',
  zona_horaria text not null default 'America/Guatemala',
  codigo_invitacion text,
  consentimiento_reportes boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table idiomas.codigos_invitacion (
  codigo text primary key,
  usos_max integer not null default 50 check (usos_max > 0),
  usos integer not null default 0,
  rol text not null default 'alumno' check (rol in ('alumno', 'editor', 'revisor')),
  vence_at timestamptz,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function idiomas.es_miembro() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from idiomas.miembros m where m.user_id = idiomas.uid() and m.estado = 'activo')
$$;

create or replace function idiomas.tiene_rol(p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from idiomas.miembros m
                  where m.user_id = idiomas.uid() and m.estado = 'activo' and (m.rol = any(p_roles) or m.rol = 'admin'))
$$;

-- Lanza error si quien llama no es miembro activo. Devuelve su uid.
create or replace function idiomas.exigir_miembro() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := idiomas.uid();
begin
  if v is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  if not exists (select 1 from idiomas.miembros where user_id = v and estado = 'activo') then
    raise exception 'no_miembro' using errcode = '42501', hint = 'La cuenta no pertenece a la app de idiomas';
  end if;
  return v;
end $$;

-- -------------------------------------------------------------------------------------------------
-- Currículo versionado (idioma de interfaz ≠ idioma base ≠ idioma meta)
-- -------------------------------------------------------------------------------------------------
create table idiomas.lenguas (
  codigo text primary key,                    -- BCP 47: es, en, fr, en-US …
  nombre_nativo text not null,
  escritura text not null default 'Latn',
  direccion text not null default 'ltr' check (direccion in ('ltr', 'rtl')),
  voz_tts text                                -- variante para la voz del dispositivo, p. ej. en-US
);

create table idiomas.cursos (
  id text primary key,                        -- es-en = inglés desde español
  idioma_base text not null references idiomas.lenguas(codigo),
  idioma_meta text not null references idiomas.lenguas(codigo),
  titulo text not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'piloto', 'publicado', 'archivado')),
  version_publicada integer,
  nivel_max text not null default 'A1',
  capacidades jsonb not null default '{}'::jsonb,
  unique (idioma_base, idioma_meta),
  check (idioma_base <> idioma_meta)
);

create table idiomas.curso_versiones (
  curso_id text not null references idiomas.cursos(id),
  version integer not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'publicada', 'retirada')),
  notas text,
  publicada_at timestamptz,
  primary key (curso_id, version)
);

create table idiomas.habilidades (
  id text primary key,                        -- p. ej. en.disponibilidad
  idioma_meta text not null references idiomas.lenguas(codigo),
  nombre jsonb not null,                      -- por idioma base: {"es": "Preguntar si tienen algo"}
  descripcion jsonb not null default '{}'::jsonb
);

create table idiomas.unidades (
  id text primary key,
  curso_id text not null references idiomas.cursos(id),
  version integer not null,
  orden integer not null,
  titulo text not null,
  objetivo text not null,
  cefr text not null default 'A1',
  guia jsonb not null default '[]'::jsonb,    -- frases clave y notas para la guía de la unidad
  foreign key (curso_id, version) references idiomas.curso_versiones(curso_id, version),
  unique (curso_id, version, orden)
);

create table idiomas.actividades (
  id text primary key,
  unidad_id text not null references idiomas.unidades(id),
  orden integer not null,
  tipo text not null check (tipo in ('leccion', 'repaso_unidad', 'prueba_unidad')),
  titulo text not null,
  obligatoria boolean not null default true,
  permite_pistas boolean not null default true,
  unique (unidad_id, orden)
);

create table idiomas.actividad_habilidades (
  actividad_id text not null references idiomas.actividades(id),
  habilidad_id text not null references idiomas.habilidades(id),
  primary key (actividad_id, habilidad_id)
);

create table idiomas.items (
  id text primary key,
  curso_id text not null references idiomas.cursos(id),
  habilidad_id text not null references idiomas.habilidades(id),
  concepto text not null,                     -- ítems con el mismo concepto son "hermanos" para transferencia
  created_at timestamptz not null default now()
);

create table idiomas.item_versiones (
  item_id text not null references idiomas.items(id),
  version integer not null,
  estado text not null default 'aprobado' check (estado in ('borrador', 'en_revision', 'aprobado', 'retirado')),
  tipo text not null check (tipo in ('seleccion', 'traduccion', 'fichas', 'escuchar_seleccion', 'dictado', 'hablar', 'completar')),
  modalidad text not null check (modalidad in ('escuchar', 'hablar', 'leer', 'escribir')),
  dificultad smallint not null default 1 check (dificultad between 1 and 5),
  contenido jsonb not null,                   -- lo que ve el alumno: enunciado, opciones, fichas, texto de audio
  pista text,
  explicacion text not null,
  tipo_error_por_defecto text not null default 'gramatica',
  publicado_at timestamptz not null default now(),
  primary key (item_id, version)
);

-- Claves de respuesta: PRIVADAS. Sin GRANT a ningún rol de API y con RLS sin políticas.
create table idiomas.item_claves (
  item_id text not null,
  version integer not null,
  aceptadas text[] not null default '{}',     -- respuestas de texto aceptadas
  opcion_correcta text,                       -- para selección
  reglas jsonb not null default '{}'::jsonb,  -- {"mayusculas": false, "puntuacion": false, "tildes": false}
  errores_previstos jsonb not null default '[]'::jsonb, -- [{"respuesta": "...", "tipo": "...", "feedback": "..."}]
  primary key (item_id, version),
  foreign key (item_id, version) references idiomas.item_versiones(item_id, version)
);

create table idiomas.actividad_items (
  actividad_id text not null references idiomas.actividades(id),
  item_id text not null references idiomas.items(id),
  orden integer not null,
  primary key (actividad_id, item_id)
);

create table idiomas.medios (
  id uuid primary key default gen_random_uuid(),
  curso_id text references idiomas.cursos(id),
  tipo text not null check (tipo in ('audio', 'imagen')),
  fuente text not null check (fuente in ('tts_dispositivo', 'grabacion_propia', 'licenciado')),
  ruta_storage text,                          -- objeto en el bucket idiomas-medios (null si es TTS)
  licencia text not null,
  autor text,
  bytes integer check (bytes is null or bytes > 0),
  sha256 text,
  transcripcion text,
  created_at timestamptz not null default now()
);

-- Versión vigente (aprobada más reciente) de cada ítem
create or replace view idiomas.item_vigente with (security_invoker = true) as
  select distinct on (iv.item_id) iv.*
    from idiomas.item_versiones iv
   where iv.estado = 'aprobado'
   order by iv.item_id, iv.version desc;

-- -------------------------------------------------------------------------------------------------
-- RLS en todas las tablas. Las tablas de contenido no se conceden a ningún rol de API: el cliente
-- solo las ve a través de funciones de idiomas_api que filtran lo necesario (nunca claves).
-- -------------------------------------------------------------------------------------------------
alter table idiomas.config enable row level security;
alter table idiomas.miembros enable row level security;
alter table idiomas.codigos_invitacion enable row level security;
alter table idiomas.lenguas enable row level security;
alter table idiomas.cursos enable row level security;
alter table idiomas.curso_versiones enable row level security;
alter table idiomas.habilidades enable row level security;
alter table idiomas.unidades enable row level security;
alter table idiomas.actividades enable row level security;
alter table idiomas.actividad_habilidades enable row level security;
alter table idiomas.items enable row level security;
alter table idiomas.item_versiones enable row level security;
alter table idiomas.item_claves enable row level security;
alter table idiomas.actividad_items enable row level security;
alter table idiomas.medios enable row level security;

grant select on idiomas.miembros to authenticated;
create policy miembros_propio on idiomas.miembros for select to authenticated
  using (user_id = idiomas.uid());

grant execute on function idiomas.uid(), idiomas.claims(), idiomas.es_miembro(), idiomas.tiene_rol(text[]) to authenticated;

reset role;

-- -------------------------------------------------------------------------------------------------
-- Almacenamiento: bucket PRIVADO solo para medios de idiomas, con límite de tamaño y tipos.
-- -------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('idiomas-medios', 'idiomas-medios', false, 1048576,
        array['audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4', 'image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "idiomas_medios_leer" on storage.objects for select to authenticated
  using (bucket_id = 'idiomas-medios' and idiomas.es_miembro());
create policy "idiomas_medios_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'idiomas-medios' and idiomas.tiene_rol(array['editor']));
create policy "idiomas_medios_cambiar" on storage.objects for update to authenticated
  using (bucket_id = 'idiomas-medios' and idiomas.tiene_rol(array['editor']))
  with check (bucket_id = 'idiomas-medios' and idiomas.tiene_rol(array['editor']));
create policy "idiomas_medios_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'idiomas-medios' and idiomas.tiene_rol(array['editor']));
