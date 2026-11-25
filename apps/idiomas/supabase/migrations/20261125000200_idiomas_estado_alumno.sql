-- =================================================================================================
-- App de idiomas · Migración 2: estado del alumno (inscripciones, sesiones, intentos, evidencia,
-- dominio, repaso, recompensas). Todo por inscripción: cada curso conserva su propio avance.
-- =================================================================================================
set role idiomas_propietario;

insert into idiomas.config (clave, valor, descripcion) values
  ('umbral_prueba_unidad', '0.7', 'Precisión al primer intento necesaria para superar la prueba de unidad')
on conflict (clave) do nothing;

create table idiomas.inscripciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idiomas.miembros(user_id) on delete cascade,
  curso_id text not null references idiomas.cursos(id),
  version_curricular integer not null,
  estado text not null default 'activa' check (estado in ('activa', 'archivada', 'eliminada')),
  modo_inicio text not null default 'cero' check (modo_inicio in ('cero', 'diagnostico')),
  completado_at timestamptz,
  created_at timestamptz not null default now(),
  ultima_actividad_at timestamptz
);
create unique index inscripciones_unica_vigente on idiomas.inscripciones (user_id, curso_id) where estado <> 'eliminada';

create table idiomas.actividad_progreso (
  inscripcion_id uuid not null references idiomas.inscripciones(id) on delete cascade,
  actividad_id text not null references idiomas.actividades(id),
  estado text not null default 'disponible' check (estado in ('disponible', 'en_progreso', 'completada', 'convalidada')),
  veces integer not null default 0,
  mejor_precision numeric(4, 3),
  completada_at timestamptz,
  primary key (inscripcion_id, actividad_id)
);

create table idiomas.sesiones (
  id uuid primary key,                         -- lo genera el cliente: permite reintentar sin duplicar
  user_id uuid not null references idiomas.miembros(user_id) on delete cascade,
  inscripcion_id uuid not null references idiomas.inscripciones(id) on delete cascade,
  actividad_id text references idiomas.actividades(id),
  modo text not null check (modo in ('leccion', 'repaso', 'mantenimiento')),
  version_curricular integer not null,
  semilla text not null,
  estado text not null default 'abierta' check (estado in ('abierta', 'completada', 'abandonada')),
  cierre_evento_id uuid,
  resultado jsonb,
  created_at timestamptz not null default now(),
  completada_at timestamptz
);
create index sesiones_insc on idiomas.sesiones (inscripcion_id, created_at desc);

create table idiomas.sesion_items (
  sesion_id uuid not null references idiomas.sesiones(id) on delete cascade,
  posicion integer not null,
  item_id text not null,
  item_version integer not null,
  origen text not null check (origen in ('nuevo', 'repaso', 'error', 'transferencia', 'refuerzo')),
  motivo text,
  primary key (sesion_id, posicion),
  foreign key (item_id, item_version) references idiomas.item_versiones(item_id, version)
);

create table idiomas.pistas_usadas (
  sesion_id uuid not null references idiomas.sesiones(id) on delete cascade,
  posicion integer not null,
  evento_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (sesion_id, posicion),
  unique (sesion_id, evento_id)
);

create table idiomas.intentos (
  id bigint generated always as identity primary key,
  sesion_id uuid not null references idiomas.sesiones(id) on delete cascade,
  evento_id uuid not null,
  user_id uuid not null,
  inscripcion_id uuid not null,
  posicion integer not null,
  item_id text not null,
  item_version integer not null,
  habilidad_id text not null,
  modalidad text not null,
  numero_intento integer not null,
  respuesta text not null,
  respuesta_normalizada text not null,
  resultado text not null check (resultado in ('correcta', 'aceptable_con_aviso', 'incorrecta', 'no_evaluable', 'omitida')),
  pista_usada boolean not null,
  tipo_error text,
  ocurrido_at timestamptz not null,
  recibido_at timestamptz not null default now(),
  recibo jsonb not null,
  unique (sesion_id, evento_id)
);
create index intentos_item on idiomas.intentos (item_id, item_version);
create index intentos_user_item on idiomas.intentos (user_id, item_id, recibido_at desc);

-- Evidencia append-only: una fila por intento (unique), nunca se actualiza.
create table idiomas.evidencias (
  id bigint generated always as identity primary key,
  intento_id bigint not null unique references idiomas.intentos(id) on delete cascade,
  user_id uuid not null,
  inscripcion_id uuid not null,
  habilidad_id text not null,
  modalidad text not null,
  item_id text not null,
  item_version integer not null,
  calidad text not null check (calidad in ('independiente', 'con_ayuda', 'correccion', 'fallo', 'fallo_con_ayuda', 'no_evaluable')),
  tipo_error text,
  created_at timestamptz not null default now()
);

create table idiomas.dominio (
  inscripcion_id uuid not null references idiomas.inscripciones(id) on delete cascade,
  habilidad_id text not null references idiomas.habilidades(id),
  modalidad text not null check (modalidad in ('escuchar', 'hablar', 'leer', 'escribir')),
  user_id uuid not null,
  nivel numeric(4, 3) not null default 0,     -- dominio estimado 0..1
  paso integer not null default -1,           -- índice en intervalos_repaso_dias (-1 = sin acierto sólido)
  proximo_repaso timestamptz,
  aciertos_independientes integer not null default 0,
  aciertos_con_ayuda integer not null default 0,
  correcciones integer not null default 0,
  fallos integer not null default 0,
  fallos_sin_pista_recientes integer not null default 0,
  ultimo_tipo_error text,
  ultimo_item_fallado text,
  ultima_evidencia_at timestamptz,
  primary key (inscripcion_id, habilidad_id, modalidad)
);

create table idiomas.recomendaciones (
  id bigint generated always as identity primary key,
  sesion_id uuid not null references idiomas.sesiones(id) on delete cascade,
  inscripcion_id uuid not null,
  user_id uuid not null,
  habilidad_id text not null,
  modalidad text not null,
  motivo text not null,
  explicacion text not null,
  item_id text not null,
  created_at timestamptz not null default now()
);

create table idiomas.xp_libro (
  id bigint generated always as identity primary key,
  user_id uuid not null references idiomas.miembros(user_id) on delete cascade,
  inscripcion_id uuid,
  fuente_tipo text not null,
  fuente_id text not null,
  cantidad integer not null check (cantidad >= 0),
  created_at timestamptz not null default now(),
  unique (fuente_tipo, fuente_id)              -- una recompensa por fuente
);

create table idiomas.dias_estudio (
  user_id uuid not null references idiomas.miembros(user_id) on delete cascade,
  fecha date not null,
  estado text not null default 'estudiado' check (estado in ('estudiado', 'protegido', 'reparado')),
  primera_sesion_id uuid,
  primary key (user_id, fecha)
);

create table idiomas.hitos_curso (
  inscripcion_id uuid not null references idiomas.inscripciones(id) on delete cascade,
  version_curricular integer not null,
  completado_at timestamptz not null default now(),
  resumen jsonb not null,
  primary key (inscripcion_id, version_curricular)
);

create table idiomas.reportes_contenido (
  id bigint generated always as identity primary key,
  user_id uuid not null references idiomas.miembros(user_id) on delete cascade,
  sesion_id uuid,
  item_id text not null,
  item_version integer not null,
  tipo text not null check (tipo in ('respuesta_valida_rechazada', 'enunciado_confuso', 'error_en_contenido', 'audio', 'otro')),
  comentario text check (length(comentario) <= 500),
  respuesta text check (length(respuesta) <= 300),  -- solo con consentimiento del alumno
  created_at timestamptz not null default now()
);

create table idiomas.uso_diario (
  user_id uuid not null references idiomas.miembros(user_id) on delete cascade,
  fecha date not null,
  sesiones integer not null default 0,
  reportes integer not null default 0,
  primary key (user_id, fecha)
);

-- RLS: el alumno puede leer SOLO sus filas (y solo si es miembro activo). No hay permisos de
-- escritura directa: todo cambio pasa por funciones de idiomas_api con validaciones.
do $$ declare t text; begin
  foreach t in array array['inscripciones', 'actividad_progreso', 'sesiones', 'sesion_items', 'pistas_usadas',
    'intentos', 'evidencias', 'dominio', 'recomendaciones', 'xp_libro', 'dias_estudio', 'hitos_curso',
    'reportes_contenido', 'uso_diario'] loop
    execute format('alter table idiomas.%I enable row level security', t);
  end loop;
end $$;

grant select on idiomas.inscripciones, idiomas.dominio, idiomas.evidencias, idiomas.recomendaciones,
  idiomas.xp_libro, idiomas.dias_estudio, idiomas.actividad_progreso to authenticated;

create policy propio on idiomas.inscripciones for select to authenticated
  using (user_id = idiomas.uid() and idiomas.es_miembro());
create policy propio on idiomas.dominio for select to authenticated
  using (user_id = idiomas.uid() and idiomas.es_miembro());
create policy propio on idiomas.evidencias for select to authenticated
  using (user_id = idiomas.uid() and idiomas.es_miembro());
create policy propio on idiomas.recomendaciones for select to authenticated
  using (user_id = idiomas.uid() and idiomas.es_miembro());
create policy propio on idiomas.xp_libro for select to authenticated
  using (user_id = idiomas.uid() and idiomas.es_miembro());
create policy propio on idiomas.dias_estudio for select to authenticated
  using (user_id = idiomas.uid() and idiomas.es_miembro());
create policy propio on idiomas.actividad_progreso for select to authenticated
  using (idiomas.es_miembro() and inscripcion_id in (select i.id from idiomas.inscripciones i where i.user_id = idiomas.uid()));

reset role;
