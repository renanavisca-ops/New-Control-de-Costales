-- Corrige recursión infinita entre las políticas de tiendas y abastecimientos
-- usando funciones auxiliares (security definer) en lugar de subconsultas cruzadas.
create or replace function app.centros_proveedores() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select ab.centro_id from public.abastecimientos ab where ab.organizacion_id in (select app.orgs_propias())
$$;

create or replace function app.tiendas_propias() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.tiendas t where t.organizacion_id in (select app.orgs_propias())
$$;

revoke all on function app.centros_proveedores(), app.tiendas_propias() from public, anon;
grant execute on function app.centros_proveedores(), app.tiendas_propias() to authenticated;

alter policy tiendas_select on public.tiendas
  using (organizacion_id in (select app.orgs_propias())
         or organizacion_id in (select app.orgs_clientes())
         or id in (select app.centros_proveedores()));

alter policy abast_select on public.abastecimientos
  using (organizacion_id in (select app.orgs_propias())
         or centro_id in (select app.tiendas_propias()));
