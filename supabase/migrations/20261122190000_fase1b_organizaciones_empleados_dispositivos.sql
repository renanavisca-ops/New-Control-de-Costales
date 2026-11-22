-- =========================================================
-- Fase 1b: modelo tipo Asistencia biométrica
--   superadmin → organizaciones → tiendas (una o más pueden ser centro de distribución)
--   un centro puede abastecer a otras organizaciones
--   administradores con roles por organización/tienda
--   empleados con código + PIN, celulares fijados a una tienda
-- Se aplica después de 20261122185900_fase1b_limpieza_esquema_anterior.sql
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

create type public.rol_admin as enum ('SUPERADMIN','ADMIN_ORG','SUPERVISOR','BODEGA','AUDITOR');
create type public.estado_dispositivo as enum ('PENDIENTE','ACTIVO','BLOQUEADO');

-- ---------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------
create table public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  prefijo_empleado text not null check (prefijo_empleado ~ '^[A-Z0-9]{2,6}$'),
  siguiente_numero integer not null default 1,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index organizaciones_prefijo_unico on public.organizaciones (prefijo_empleado);

create table public.tiendas (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  codigo text not null,
  nombre text not null,
  direccion text,
  es_central boolean not null default false,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tiendas_codigo_unico on public.tiendas (organizacion_id, upper(codigo));
create index on public.tiendas (organizacion_id);

-- Un centro de distribución (tienda es_central) abastece a otras organizaciones
create table public.abastecimientos (
  centro_id uuid not null references public.tiendas(id) on delete cascade,
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (centro_id, organizacion_id)
);
create index on public.abastecimientos (organizacion_id);

-- Categorías: pertenecen a una organización (la dueña del centro) y las ven sus clientes
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  nombre text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index categorias_nombre_unico on public.categorias (organizacion_id, upper(nombre));

-- Administradores (usuarios con correo)
create table public.administradores (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text not null,
  activo boolean not null default true,
  debe_cambiar_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.asignaciones_rol (
  id uuid primary key default gen_random_uuid(),
  administrador_id uuid not null references public.administradores(id) on delete cascade,
  rol public.rol_admin not null,
  organizacion_id uuid references public.organizaciones(id) on delete cascade,
  tienda_id uuid references public.tiendas(id) on delete cascade,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint alcance_rol check (
    (rol = 'SUPERADMIN' and organizacion_id is null and tienda_id is null)
    or (rol in ('ADMIN_ORG','AUDITOR') and organizacion_id is not null and tienda_id is null)
    or (rol in ('SUPERVISOR','BODEGA') and organizacion_id is not null and tienda_id is not null)
  )
);
create unique index asignaciones_unicas on public.asignaciones_rol
  (administrador_id, rol, coalesce(organizacion_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(tienda_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index on public.asignaciones_rol (organizacion_id);
create index on public.asignaciones_rol (tienda_id);

-- Empleados de tienda: se identifican con código + PIN en el celular de la tienda
create table public.empleados (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  codigo text not null,
  nombre text not null,
  apellidos text,
  pin_hash text,
  pin_intentos integer not null default 0,
  bloqueado_hasta timestamptz,
  activo boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index empleados_codigo_unico on public.empleados (upper(codigo));
create index on public.empleados (organizacion_id);

create table public.empleado_tiendas (
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  tienda_id uuid not null references public.tiendas(id) on delete cascade,
  primary key (empleado_id, tienda_id)
);
create index on public.empleado_tiendas (tienda_id);

-- Celulares de tienda (quedan fijados a una tienda)
create table public.dispositivos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  tienda_id uuid not null references public.tiendas(id) on delete restrict,
  nombre text not null,
  estado public.estado_dispositivo not null default 'PENDIENTE',
  usuario_id uuid unique references auth.users(id) on delete set null,
  codigo_activacion_hash text,
  codigo_expira timestamptz,
  activado_at timestamptz,
  ultimo_contacto timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.dispositivos (tienda_id);
create index on public.dispositivos (organizacion_id);
create unique index dispositivos_codigo_hash on public.dispositivos (codigo_activacion_hash) where codigo_activacion_hash is not null;

-- updated_at
create trigger t_org_upd before update on public.organizaciones for each row execute function app.tocar_updated_at();
create trigger t_tiendas_upd before update on public.tiendas for each row execute function app.tocar_updated_at();
create trigger t_categorias_upd before update on public.categorias for each row execute function app.tocar_updated_at();
create trigger t_admins_upd before update on public.administradores for each row execute function app.tocar_updated_at();
create trigger t_empleados_upd before update on public.empleados for each row execute function app.tocar_updated_at();
create trigger t_dispositivos_upd before update on public.dispositivos for each row execute function app.tocar_updated_at();

-- ---------------------------------------------------------
-- Funciones auxiliares de permisos (esquema app, no expuesto)
-- ---------------------------------------------------------
create or replace function app.es_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.asignaciones_rol r join public.administradores a on a.id = r.administrador_id
     where r.administrador_id = auth.uid() and r.rol = 'SUPERADMIN' and a.activo)
$$;

-- ¿Tiene el usuario alguno de estos roles en la organización? (superadmin siempre sí)
create or replace function app.tiene_rol_org(p_org uuid, p_roles public.rol_admin[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.es_superadmin() or exists (
    select 1 from public.asignaciones_rol r join public.administradores a on a.id = r.administrador_id
     where r.administrador_id = auth.uid() and a.activo and r.organizacion_id = p_org and r.rol = any(p_roles))
$$;

-- Dispositivo de la sesión actual (si la sesión es un celular de tienda)
create or replace function app.mi_dispositivo_tienda() returns uuid
language sql stable security definer set search_path = '' as $$
  select tienda_id from public.dispositivos where usuario_id = auth.uid() and estado = 'ACTIVO'
$$;

create or replace function app.mi_dispositivo_org() returns uuid
language sql stable security definer set search_path = '' as $$
  select organizacion_id from public.dispositivos where usuario_id = auth.uid() and estado = 'ACTIVO'
$$;

-- Organizaciones donde el usuario tiene algún rol (o la del dispositivo)
create or replace function app.orgs_propias() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select o.id from public.organizaciones o where app.es_superadmin()
  union
  select r.organizacion_id from public.asignaciones_rol r join public.administradores a on a.id = r.administrador_id
   where r.administrador_id = auth.uid() and a.activo and r.organizacion_id is not null
  union
  select app.mi_dispositivo_org() where app.mi_dispositivo_org() is not null
$$;

-- Organizaciones proveedoras (dueñas de centros que abastecen a mis organizaciones), incluida la propia
create or replace function app.orgs_proveedoras() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from app.orgs_propias() as id
  union
  select t.organizacion_id from public.abastecimientos ab join public.tiendas t on t.id = ab.centro_id
   where ab.organizacion_id in (select app.orgs_propias())
$$;

-- Organizaciones clientes de los centros de mis organizaciones
create or replace function app.orgs_clientes() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select ab.organizacion_id from public.abastecimientos ab join public.tiendas t on t.id = ab.centro_id
   where t.organizacion_id in (select app.orgs_propias())
$$;

revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table public.organizaciones enable row level security;
alter table public.tiendas enable row level security;
alter table public.abastecimientos enable row level security;
alter table public.categorias enable row level security;
alter table public.administradores enable row level security;
alter table public.asignaciones_rol enable row level security;
alter table public.empleados enable row level security;
alter table public.empleado_tiendas enable row level security;
alter table public.dispositivos enable row level security;

-- organizaciones
create policy org_select on public.organizaciones for select to authenticated
  using (id in (select app.orgs_propias()) or id in (select app.orgs_clientes()) or id in (select app.orgs_proveedoras()));
create policy org_insert on public.organizaciones for insert to authenticated
  with check (app.es_superadmin());
create policy org_update on public.organizaciones for update to authenticated
  using (app.tiene_rol_org(id, array['ADMIN_ORG']::public.rol_admin[]))
  with check (app.tiene_rol_org(id, array['ADMIN_ORG']::public.rol_admin[]));

-- tiendas: las de mis organizaciones, las de mis clientes (para despachar) y los centros que me abastecen
create policy tiendas_select on public.tiendas for select to authenticated
  using (organizacion_id in (select app.orgs_propias())
         or organizacion_id in (select app.orgs_clientes())
         or id in (select ab.centro_id from public.abastecimientos ab where ab.organizacion_id in (select app.orgs_propias())));
create policy tiendas_insert on public.tiendas for insert to authenticated
  with check (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG']::public.rol_admin[]));
create policy tiendas_update on public.tiendas for update to authenticated
  using (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG']::public.rol_admin[]))
  with check (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG']::public.rol_admin[]));

-- abastecimientos: los ven ambas partes; solo el superadmin los define
create policy abast_select on public.abastecimientos for select to authenticated
  using (organizacion_id in (select app.orgs_propias())
         or centro_id in (select t.id from public.tiendas t where t.organizacion_id in (select app.orgs_propias())));
create policy abast_insert on public.abastecimientos for insert to authenticated with check (app.es_superadmin());
create policy abast_delete on public.abastecimientos for delete to authenticated using (app.es_superadmin());

-- categorias: propias y de proveedores; las administra la organización dueña
create policy cat_select on public.categorias for select to authenticated
  using (organizacion_id in (select app.orgs_proveedoras()));
create policy cat_insert on public.categorias for insert to authenticated
  with check (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG']::public.rol_admin[]));
create policy cat_update on public.categorias for update to authenticated
  using (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG']::public.rol_admin[]))
  with check (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG']::public.rol_admin[]));

-- administradores y roles: escritura solo vía Edge Function
create policy admins_select on public.administradores for select to authenticated
  using (id = (select auth.uid()) or app.es_superadmin()
         or id in (select r.administrador_id from public.asignaciones_rol r
                    where app.tiene_rol_org(r.organizacion_id, array['ADMIN_ORG']::public.rol_admin[])));
create policy roles_select on public.asignaciones_rol for select to authenticated
  using (administrador_id = (select auth.uid()) or app.es_superadmin()
         or app.tiene_rol_org(organizacion_id, array['ADMIN_ORG']::public.rol_admin[]));

-- empleados: los ven administradores de su organización; el PIN nunca se expone
create policy emp_select on public.empleados for select to authenticated
  using (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[]));
create policy emp_tiendas_select on public.empleado_tiendas for select to authenticated
  using (empleado_id in (select id from public.empleados));
revoke select on public.empleados from anon, authenticated;
grant select (id, organizacion_id, codigo, nombre, apellidos, activo, created_at, updated_at) on public.empleados to authenticated;
revoke insert, update, delete on public.empleados, public.empleado_tiendas from anon, authenticated;

-- dispositivos: los ven administradores y supervisores; el celular ve su propio registro
create policy disp_select on public.dispositivos for select to authenticated
  using (usuario_id = (select auth.uid())
         or app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[]));
revoke select on public.dispositivos from anon, authenticated;
grant select (id, organizacion_id, tienda_id, nombre, estado, codigo_expira, activado_at, ultimo_contacto, created_at) on public.dispositivos to authenticated;
revoke insert, update, delete on public.dispositivos from anon, authenticated;

-- ---------------------------------------------------------
-- RPC
-- ---------------------------------------------------------

-- Contexto de la sesión: administrador (con roles) o dispositivo de tienda
create or replace function public.mi_contexto() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.administradores where id = auth.uid()) then
      jsonb_build_object(
        'tipo', 'ADMIN',
        'admin', (select to_jsonb(a) - 'created_at' - 'updated_at' from public.administradores a where a.id = auth.uid()),
        'roles', coalesce((select jsonb_agg(jsonb_build_object('rol', r.rol, 'organizacion_id', r.organizacion_id, 'tienda_id', r.tienda_id))
                             from public.asignaciones_rol r where r.administrador_id = auth.uid()), '[]'::jsonb))
    when exists (select 1 from public.dispositivos where usuario_id = auth.uid()) then
      (select jsonb_build_object(
         'tipo', 'DISPOSITIVO',
         'dispositivo', jsonb_build_object('id', d.id, 'nombre', d.nombre, 'estado', d.estado),
         'tienda', jsonb_build_object('id', t.id, 'codigo', t.codigo, 'nombre', t.nombre, 'es_central', t.es_central),
         'organizacion', jsonb_build_object('id', o.id, 'nombre', o.nombre))
       from public.dispositivos d join public.tiendas t on t.id = d.tienda_id join public.organizaciones o on o.id = d.organizacion_id
       where d.usuario_id = auth.uid())
    else jsonb_build_object('tipo', 'NINGUNO')
  end
$$;

create or replace function public.marcar_password_cambiada() returns void
language sql security definer set search_path = '' as $$
  update public.administradores set debe_cambiar_password = false where id = auth.uid()
$$;

-- Crear organización (superadmin)
create or replace function public.crear_organizacion(p_nombre text, p_prefijo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.es_superadmin() then raise exception 'Sin permiso'; end if;
  insert into public.organizaciones (nombre, prefijo_empleado)
  values (trim(p_nombre), upper(trim(p_prefijo))) returning id into v_id;
  return v_id;
end $$;

-- Empleados
create or replace function public.crear_empleado(p_org uuid, p_nombre text, p_apellidos text, p_tiendas uuid[], p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_num integer; v_prefijo text; v_codigo text; v_id uuid;
begin
  if not app.tiene_rol_org(p_org, array['ADMIN_ORG']::public.rol_admin[]) then raise exception 'Sin permiso'; end if;
  if coalesce(trim(p_nombre),'') = '' then raise exception 'Nombre requerido'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'El PIN debe tener de 4 a 6 dígitos'; end if;
  if exists (select 1 from unnest(coalesce(p_tiendas, '{}'::uuid[])) t
              where t not in (select id from public.tiendas where organizacion_id = p_org)) then
    raise exception 'Tienda no válida';
  end if;
  update public.organizaciones set siguiente_numero = siguiente_numero + 1
   where id = p_org returning siguiente_numero - 1, prefijo_empleado into v_num, v_prefijo;
  v_codigo := v_prefijo || '-' || lpad(v_num::text, 4, '0');
  insert into public.empleados (organizacion_id, codigo, nombre, apellidos, pin_hash, created_by)
  values (p_org, v_codigo, trim(p_nombre), nullif(trim(p_apellidos),''), extensions.crypt(p_pin, extensions.gen_salt('bf')), auth.uid())
  returning id into v_id;
  insert into public.empleado_tiendas (empleado_id, tienda_id) select v_id, unnest(coalesce(p_tiendas, '{}'::uuid[]));
  return jsonb_build_object('id', v_id, 'codigo', v_codigo);
end $$;

create or replace function public.actualizar_empleado(p_id uuid, p_nombre text, p_apellidos text, p_tiendas uuid[], p_activo boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organizacion_id into v_org from public.empleados where id = p_id;
  if v_org is null or not app.tiene_rol_org(v_org, array['ADMIN_ORG']::public.rol_admin[]) then raise exception 'Sin permiso'; end if;
  if exists (select 1 from unnest(coalesce(p_tiendas, '{}'::uuid[])) t
              where t not in (select id from public.tiendas where organizacion_id = v_org)) then
    raise exception 'Tienda no válida';
  end if;
  update public.empleados set nombre = trim(p_nombre), apellidos = nullif(trim(p_apellidos),''), activo = p_activo where id = p_id;
  delete from public.empleado_tiendas where empleado_id = p_id;
  insert into public.empleado_tiendas (empleado_id, tienda_id) select p_id, unnest(coalesce(p_tiendas, '{}'::uuid[]));
end $$;

create or replace function public.establecer_pin_empleado(p_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organizacion_id into v_org from public.empleados where id = p_id;
  if v_org is null or not app.tiene_rol_org(v_org, array['ADMIN_ORG']::public.rol_admin[]) then raise exception 'Sin permiso'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'El PIN debe tener de 4 a 6 dígitos'; end if;
  update public.empleados set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), pin_intentos = 0, bloqueado_hasta = null where id = p_id;
end $$;

-- Verificación de código + PIN desde el celular de la tienda (5 intentos, bloqueo de 10 minutos)
create or replace function public.verificar_empleado(p_codigo text, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tienda uuid; e public.empleados;
begin
  v_tienda := app.mi_dispositivo_tienda();
  if v_tienda is null then return jsonb_build_object('ok', false, 'error', 'Este dispositivo no está activo.'); end if;
  select * into e from public.empleados where upper(codigo) = upper(trim(p_codigo));
  if e.id is null or not e.activo
     or not exists (select 1 from public.empleado_tiendas where empleado_id = e.id and tienda_id = v_tienda) then
    return jsonb_build_object('ok', false, 'error', 'Código no válido para esta tienda.');
  end if;
  if e.bloqueado_hasta is not null and e.bloqueado_hasta > now() then
    return jsonb_build_object('ok', false, 'error', 'Demasiados intentos. Intenta de nuevo en unos minutos.');
  end if;
  if e.pin_hash is null or e.pin_hash <> extensions.crypt(p_pin, e.pin_hash) then
    update public.empleados
       set pin_intentos = pin_intentos + 1,
           bloqueado_hasta = case when pin_intentos + 1 >= 5 then now() + interval '10 minutes' else null end
     where id = e.id;
    return jsonb_build_object('ok', false, 'error', 'PIN incorrecto.');
  end if;
  update public.empleados set pin_intentos = 0, bloqueado_hasta = null where id = e.id;
  update public.dispositivos set ultimo_contacto = now() where usuario_id = auth.uid();
  return jsonb_build_object('ok', true, 'empleado',
    jsonb_build_object('id', e.id, 'codigo', e.codigo, 'nombre', trim(e.nombre || ' ' || coalesce(e.apellidos,''))));
end $$;

-- Dispositivos: crear / regenerar código de activación / bloquear
create or replace function app.nuevo_codigo_activacion() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '')
    from (select extensions.gen_random_bytes(8) b) x, generate_series(0, 7) i
$$;

create or replace function public.crear_dispositivo(p_tienda uuid, p_nombre text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_codigo text; v_id uuid;
begin
  select organizacion_id into v_org from public.tiendas where id = p_tienda;
  if v_org is null or not app.tiene_rol_org(v_org, array['ADMIN_ORG']::public.rol_admin[]) then raise exception 'Sin permiso'; end if;
  v_codigo := app.nuevo_codigo_activacion();
  insert into public.dispositivos (organizacion_id, tienda_id, nombre, codigo_activacion_hash, codigo_expira, created_by)
  values (v_org, p_tienda, coalesce(nullif(trim(p_nombre),''), 'Celular'),
          encode(extensions.digest(v_codigo, 'sha256'), 'hex'), now() + interval '24 hours', auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'codigo', v_codigo);
end $$;

create or replace function public.regenerar_codigo_dispositivo(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_codigo text;
begin
  select organizacion_id into v_org from public.dispositivos where id = p_id;
  if v_org is null or not app.tiene_rol_org(v_org, array['ADMIN_ORG']::public.rol_admin[]) then raise exception 'Sin permiso'; end if;
  v_codigo := app.nuevo_codigo_activacion();
  update public.dispositivos
     set codigo_activacion_hash = encode(extensions.digest(v_codigo, 'sha256'), 'hex'),
         codigo_expira = now() + interval '24 hours', estado = 'PENDIENTE'
   where id = p_id;
  return jsonb_build_object('id', p_id, 'codigo', v_codigo);
end $$;

create or replace function public.cambiar_estado_dispositivo(p_id uuid, p_bloquear boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_usuario uuid;
begin
  select organizacion_id, usuario_id into v_org, v_usuario from public.dispositivos where id = p_id;
  if v_org is null or not app.tiene_rol_org(v_org, array['ADMIN_ORG']::public.rol_admin[]) then raise exception 'Sin permiso'; end if;
  update public.dispositivos
     set estado = case when p_bloquear then 'BLOQUEADO'::public.estado_dispositivo
                       when v_usuario is not null then 'ACTIVO'::public.estado_dispositivo
                       else 'PENDIENTE'::public.estado_dispositivo end
   where id = p_id;
end $$;

-- Permisos de ejecución de RPC
revoke all on function public.mi_contexto(), public.marcar_password_cambiada(), public.crear_organizacion(text, text),
  public.crear_empleado(uuid, text, text, uuid[], text), public.actualizar_empleado(uuid, text, text, uuid[], boolean),
  public.establecer_pin_empleado(uuid, text), public.verificar_empleado(text, text),
  public.crear_dispositivo(uuid, text), public.regenerar_codigo_dispositivo(uuid), public.cambiar_estado_dispositivo(uuid, boolean)
  from public, anon;
grant execute on function public.mi_contexto(), public.marcar_password_cambiada(), public.crear_organizacion(text, text),
  public.crear_empleado(uuid, text, text, uuid[], text), public.actualizar_empleado(uuid, text, text, uuid[], boolean),
  public.establecer_pin_empleado(uuid, text), public.verificar_empleado(text, text),
  public.crear_dispositivo(uuid, text), public.regenerar_codigo_dispositivo(uuid), public.cambiar_estado_dispositivo(uuid, boolean)
  to authenticated;
revoke all on function app.nuevo_codigo_activacion() from public, anon, authenticated;

-- ---------------------------------------------------------
-- Datos iniciales
-- ---------------------------------------------------------
with o as (insert into public.organizaciones (nombre, prefijo_empleado) values ('Paca Tu Amigo, S.A.', 'PTA') returning id)
insert into public.tiendas (organizacion_id, codigo, nombre, es_central)
select o.id, 'B090', 'Centro de Distribución', true from o;

insert into public.categorias (organizacion_id, nombre)
select o.id, x.nombre from public.organizaciones o,
  (values ('EXCLUSIVA A'),('ROPA A'),('ZAPATO A'),('CARTERA A'),('PELUCHE A'),('CINCHO A'),
          ('ROPA B'),('ZAPATO B'),('CARTERA B'),('PELUCHE B'),('CINCHO B'),
          ('ROPA C'),('ZAPATO C'),('ACCESORIOS C'),('ELECTRONICOS C'),('BISUTERIA C'),('JUGUETE C'),
          ('ROPA GRANDE C'),('PACA C'),('TEXTIL A'),('TEXTIL B'),('TEXTIL C')) as x(nombre)
where o.prefijo_empleado = 'PTA';

-- Superadmin inicial: se asignó manualmente al usuario dueño de la plataforma
-- (insert en public.administradores + asignaciones_rol con rol SUPERADMIN).
