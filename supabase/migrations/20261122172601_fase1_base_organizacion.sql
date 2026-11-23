-- =========================================================
-- Fase 1: organización, usuarios, bodegas y categorías
-- (aplicada en el proyecto Supabase control-de-costales)
-- =========================================================
create schema if not exists app;

create type public.rol_usuario as enum ('ADMIN_CENTRO','BODEGA','ADMIN_EMPRESA','SUPERVISOR','OPERADOR');
create type public.tipo_bodega as enum ('CENTRAL','TIENDA');

create table public.centros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.centro_empresas (
  centro_id uuid not null references public.centros(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (centro_id, empresa_id)
);
create index on public.centro_empresas (empresa_id);

create table public.bodegas (
  id uuid primary key default gen_random_uuid(),
  centro_id uuid not null references public.centros(id) on delete restrict,
  empresa_id uuid references public.empresas(id) on delete restrict,
  codigo text not null,
  nombre text not null,
  direccion text,
  tipo public.tipo_bodega not null default 'TIENDA',
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bodega_tienda_tiene_empresa check (tipo = 'CENTRAL' or empresa_id is not null),
  constraint bodega_central_sin_empresa check (tipo = 'TIENDA' or empresa_id is null)
);
create unique index bodegas_codigo_unico on public.bodegas (centro_id, upper(codigo));
create index on public.bodegas (empresa_id);

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text not null,
  rol public.rol_usuario not null,
  centro_id uuid references public.centros(id) on delete restrict,
  empresa_id uuid references public.empresas(id) on delete restrict,
  activo boolean not null default true,
  debe_cambiar_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint perfil_alcance check (
    (rol in ('ADMIN_CENTRO','BODEGA') and centro_id is not null and empresa_id is null)
    or (rol in ('ADMIN_EMPRESA','SUPERVISOR','OPERADOR') and empresa_id is not null and centro_id is null)
  )
);
create index on public.perfiles (centro_id);
create index on public.perfiles (empresa_id);

create table public.perfil_bodegas (
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  bodega_id uuid not null references public.bodegas(id) on delete cascade,
  primary key (perfil_id, bodega_id)
);
create index on public.perfil_bodegas (bodega_id);

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  centro_id uuid not null references public.centros(id) on delete restrict,
  nombre text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index categorias_nombre_unico on public.categorias (centro_id, upper(nombre));

-- Funciones auxiliares (esquema app, no expuesto en la API)
create or replace function app.mi_rol() returns public.rol_usuario
language sql stable security definer set search_path = '' as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

create or replace function app.mi_centro() returns uuid
language sql stable security definer set search_path = '' as $$
  select centro_id from public.perfiles where id = auth.uid() and activo
$$;

create or replace function app.mi_empresa() returns uuid
language sql stable security definer set search_path = '' as $$
  select empresa_id from public.perfiles where id = auth.uid() and activo
$$;

create or replace function app.empresas_visibles() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.empresa_id from public.perfiles p
   where p.id = auth.uid() and p.activo and p.empresa_id is not null
  union
  select ce.empresa_id from public.perfiles p
    join public.centro_empresas ce on ce.centro_id = p.centro_id
   where p.id = auth.uid() and p.activo and p.centro_id is not null
$$;

create or replace function app.centros_visibles() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.centro_id from public.perfiles p
   where p.id = auth.uid() and p.activo and p.centro_id is not null
  union
  select ce.centro_id from public.perfiles p
    join public.centro_empresas ce on ce.empresa_id = p.empresa_id
   where p.id = auth.uid() and p.activo and p.empresa_id is not null
$$;

revoke all on schema app from public;
grant usage on schema app to authenticated;
revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

create or replace function app.tocar_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger t_bodegas_upd before update on public.bodegas for each row execute function app.tocar_updated_at();
create trigger t_perfiles_upd before update on public.perfiles for each row execute function app.tocar_updated_at();
create trigger t_categorias_upd before update on public.categorias for each row execute function app.tocar_updated_at();

-- RLS
alter table public.centros enable row level security;
alter table public.empresas enable row level security;
alter table public.centro_empresas enable row level security;
alter table public.bodegas enable row level security;
alter table public.perfiles enable row level security;
alter table public.perfil_bodegas enable row level security;
alter table public.categorias enable row level security;

create policy centros_select on public.centros for select to authenticated
  using (id in (select app.centros_visibles()));
create policy centros_update on public.centros for update to authenticated
  using ((select app.mi_rol()) = 'ADMIN_CENTRO' and id = (select app.mi_centro()))
  with check (id = (select app.mi_centro()));

create policy empresas_select on public.empresas for select to authenticated
  using (id in (select app.empresas_visibles()));
create policy empresas_update on public.empresas for update to authenticated
  using ((select app.mi_rol()) = 'ADMIN_CENTRO' and id in (select app.empresas_visibles()))
  with check (id in (select app.empresas_visibles()));

create policy ce_select on public.centro_empresas for select to authenticated
  using (centro_id in (select app.centros_visibles()) or empresa_id in (select app.empresas_visibles()));

create policy bodegas_select on public.bodegas for select to authenticated
  using (centro_id = (select app.mi_centro()) or empresa_id in (select app.empresas_visibles()));
create policy bodegas_insert on public.bodegas for insert to authenticated
  with check ((select app.mi_rol()) = 'ADMIN_CENTRO' and centro_id = (select app.mi_centro())
              and (empresa_id is null or empresa_id in (select app.empresas_visibles())));
create policy bodegas_update on public.bodegas for update to authenticated
  using ((select app.mi_rol()) = 'ADMIN_CENTRO' and centro_id = (select app.mi_centro()))
  with check (centro_id = (select app.mi_centro())
              and (empresa_id is null or empresa_id in (select app.empresas_visibles())));

create policy perfiles_select on public.perfiles for select to authenticated
  using (
    id = (select auth.uid())
    or ((select app.mi_rol()) = 'ADMIN_CENTRO'
        and (centro_id = (select app.mi_centro()) or empresa_id in (select app.empresas_visibles())))
    or ((select app.mi_rol()) = 'ADMIN_EMPRESA' and empresa_id = (select app.mi_empresa()))
  );

create policy perfil_bodegas_select on public.perfil_bodegas for select to authenticated
  using (perfil_id in (select id from public.perfiles));

create policy categorias_select on public.categorias for select to authenticated
  using (centro_id in (select app.centros_visibles()));
create policy categorias_insert on public.categorias for insert to authenticated
  with check ((select app.mi_rol()) = 'ADMIN_CENTRO' and centro_id = (select app.mi_centro()));
create policy categorias_update on public.categorias for update to authenticated
  using ((select app.mi_rol()) = 'ADMIN_CENTRO' and centro_id = (select app.mi_centro()))
  with check (centro_id = (select app.mi_centro()));

-- RPC
create or replace function public.crear_empresa(p_nombre text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_centro uuid;
begin
  if app.mi_rol() is distinct from 'ADMIN_CENTRO' then
    raise exception 'Sin permiso';
  end if;
  if coalesce(trim(p_nombre),'') = '' then
    raise exception 'Nombre requerido';
  end if;
  v_centro := app.mi_centro();
  insert into public.empresas (nombre) values (trim(p_nombre)) returning id into v_id;
  insert into public.centro_empresas (centro_id, empresa_id) values (v_centro, v_id);
  return v_id;
end $$;
revoke all on function public.crear_empresa(text) from public, anon;
grant execute on function public.crear_empresa(text) to authenticated;

create or replace function public.marcar_password_cambiada() returns void
language sql security definer set search_path = '' as $$
  update public.perfiles set debe_cambiar_password = false where id = auth.uid()
$$;
revoke all on function public.marcar_password_cambiada() from public, anon;
grant execute on function public.marcar_password_cambiada() to authenticated;

-- Datos iniciales
with c as (insert into public.centros (nombre) values ('Paca Tu Amigo - Centro de Distribución') returning id),
     e as (insert into public.empresas (nombre) values ('Paca Tu Amigo, S.A.') returning id),
     l as (insert into public.centro_empresas (centro_id, empresa_id) select c.id, e.id from c, e returning centro_id)
insert into public.bodegas (centro_id, empresa_id, codigo, nombre, tipo)
select c.id, null, 'B090', 'Centro de Distribución', 'CENTRAL' from c;

insert into public.categorias (centro_id, nombre)
select c.id, x.nombre from public.centros c,
  (values ('EXCLUSIVA A'),('ROPA A'),('ZAPATO A'),('CARTERA A'),('PELUCHE A'),('CINCHO A'),
          ('ROPA B'),('ZAPATO B'),('CARTERA B'),('PELUCHE B'),('CINCHO B'),
          ('ROPA C'),('ZAPATO C'),('ACCESORIOS C'),('ELECTRONICOS C'),('BISUTERIA C'),('JUGUETE C'),
          ('ROPA GRANDE C'),('PACA C'),('TEXTIL A'),('TEXTIL B'),('TEXTIL C')) as x(nombre);
