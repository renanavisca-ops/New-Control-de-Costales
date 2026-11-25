-- Shim LOCAL de Supabase para pruebas (NO se aplica en producción). Se ejecuta como superusuario
-- `supabase_admin`, igual que la plataforma. Las migraciones de Puente se aplican después como
-- `postgres`, que —como en Supabase hospedado— NO es superusuario: CREATEROLE, BYPASSRLS y
-- membresía en los roles de API. Así se detectan permisos que fallarían en el proyecto real.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'postgres') then
    create role postgres login createrole createdb bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin nologin; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;
grant create on database postgres to postgres;
grant all on schema public to postgres;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to postgres, anon, authenticated, service_role;

-- auth --------------------------------------------------------------------------------------
create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema auth to postgres, anon, authenticated, service_role;
create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud text, role text,
  email text unique,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  is_anonymous boolean not null default false,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table auth.users owner to supabase_auth_admin;
grant all on auth.users to postgres;          -- en Supabase, postgres puede leer/borrar usuarios
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', current_user) $$;
grant execute on function auth.jwt(), auth.uid(), auth.role() to postgres, anon, authenticated, service_role;

-- storage (mínimo) --------------------------------------------------------------------------
create schema if not exists storage authorization supabase_storage_admin;
grant usage on schema storage to postgres, anon, authenticated, service_role;
create table if not exists storage.buckets (
  id text primary key, name text not null unique, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now());
alter table storage.buckets owner to supabase_storage_admin;
alter table storage.objects owner to supabase_storage_admin;
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant all on storage.buckets, storage.objects to postgres;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
-- En Supabase, postgres puede definir políticas sobre storage.objects
grant supabase_storage_admin to postgres;

-- Privilegios por defecto que Supabase aplica en public
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
