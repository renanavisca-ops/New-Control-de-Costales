-- =========================================================
-- Fase 8: formatos nuevos del sistema del centro (sin precio), contenedor y fecha de empaque por costal,
--         reporte por contenedor y faltantes de traslado en piezas.
-- =========================================================

alter table public.costales
  add column contenedor text,
  add column fecha_empaque date,
  add column empacado_en uuid references public.tiendas(id);
create index on public.costales (empacado_en, contenedor);
alter table public.traslados alter column total_precio drop not null;

-- Los costales creados por un traslado (no estaban en la existencia) también son del centro que los envía
create or replace function app.costal_empacado_en() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.empacado_en is null and new.traslado_id is not null then
    select centro_id into new.empacado_en from public.traslados where id = new.traslado_id;
  end if;
  return new;
end $$;
create trigger t_costal_empacado_en before insert on public.costales for each row execute function app.costal_empacado_en();

update public.costales k set empacado_en = tr.centro_id from public.traslados tr where tr.id = k.traslado_id and k.empacado_en is null;
update public.costales k set empacado_en = k.tienda_id where k.origen = 'EMPAQUE_CC' and k.empacado_en is null;

-- Carga de existencia: ahora guarda contenedor y fecha de empaque
-- p_costales: [{codigo, producto, piezas, peso, contenedor?, fecha?}]
create or replace function public.cargar_existencia(p_tienda uuid, p_costales jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tiendas; v_otros text; v_sin_producto text; v_nuevos_prod integer := 0; v_insertados integer; v_omitidos integer;
begin
  select * into t from public.tiendas where id = p_tienda and activa;
  if t.id is null then raise exception 'Sucursal no válida'; end if;
  if not (app.puede_supervisar_tienda(p_tienda)
          or (t.es_central and app.tiene_rol_org(t.organizacion_id, array['BODEGA']::public.rol_admin[]))) then
    raise exception 'Sin permiso';
  end if;
  if jsonb_typeof(p_costales) <> 'array' or jsonb_array_length(p_costales) = 0 then raise exception 'El archivo no tiene costales'; end if;
  if exists (select 1 from jsonb_array_elements(p_costales) e
              where coalesce(trim(e->>'codigo'),'') = '' or coalesce(trim(e->>'producto'),'') = ''
                 or coalesce(e->>'piezas','') !~ '^[0-9]+$') then
    raise exception 'Hay filas sin código, sin producto o con piezas no válidas';
  end if;
  if (select count(distinct upper(trim(e->>'codigo'))) from jsonb_array_elements(p_costales) e) <> jsonb_array_length(p_costales) then
    raise exception 'El archivo tiene códigos de costal repetidos';
  end if;

  -- Códigos registrados en otra sucursal o ya no disponibles
  select string_agg(k.codigo || ' (' || coalesce(ti.codigo,'?') || ')', ', ') into v_otros from (
    select k.codigo, k.tienda_id from public.costales k
     where upper(k.codigo) in (select upper(trim(e->>'codigo')) from jsonb_array_elements(p_costales) e)
       and not (k.tienda_id = p_tienda and k.estado = 'EN_TIENDA')
     limit 15) k left join public.tiendas ti on ti.id = k.tienda_id;
  if v_otros is not null then raise exception 'Estos costales ya están registrados en otro lugar o estado: %', v_otros; end if;

  if t.es_central then
    insert into public.categorias (organizacion_id, nombre, piezas_estandar)
    select distinct on (upper(trim(e->>'producto'))) t.organizacion_id, upper(trim(e->>'producto')), (e->>'piezas')::integer
      from jsonb_array_elements(p_costales) e
     where not exists (select 1 from public.categorias c where c.organizacion_id = t.organizacion_id
                                                           and upper(c.nombre) = upper(trim(e->>'producto')));
    get diagnostics v_nuevos_prod = row_count;
  else
    select string_agg(distinct upper(trim(e->>'producto')), ', ') into v_sin_producto
      from jsonb_array_elements(p_costales) e
     where not exists (select 1 from public.categorias c
                        where c.organizacion_id in (select app.orgs_productos_de_tienda(p_tienda))
                          and upper(c.nombre) = upper(trim(e->>'producto')));
    if v_sin_producto is not null then raise exception 'Estos productos no existen en la lista: %', v_sin_producto; end if;
  end if;

  -- Costales que ya estaban en esta sucursal: completar contenedor y fecha de empaque si faltaban
  update public.costales k
     set contenedor = coalesce(k.contenedor, nullif(trim(e->>'contenedor'),'')),
         fecha_empaque = coalesce(k.fecha_empaque, nullif(e->>'fecha','')::date)
    from jsonb_array_elements(p_costales) e
   where upper(k.codigo) = upper(trim(e->>'codigo')) and k.tienda_id = p_tienda
     and (k.contenedor is null or k.fecha_empaque is null);

  insert into public.costales (organizacion_id, codigo, categoria_id, piezas_empaque, peso_empaque, precio, tienda_id,
                               estado, origen, recibido_at, contenedor, fecha_empaque, empacado_en)
  select t.organizacion_id, upper(trim(e->>'codigo')),
         (select c.id from public.categorias c
           where c.organizacion_id in (select app.orgs_productos_de_tienda(p_tienda))
             and upper(c.nombre) = upper(trim(e->>'producto'))
           order by (c.organizacion_id = t.organizacion_id) desc limit 1),
         (e->>'piezas')::integer, nullif(e->>'peso','')::numeric, nullif(e->>'precio','')::numeric, t.id, 'EN_TIENDA',
         case when t.es_central then 'EMPAQUE_CC'::public.origen_costal else 'INVENTARIO_INICIAL'::public.origen_costal end,
         now(), nullif(trim(e->>'contenedor'),''), nullif(e->>'fecha','')::date, case when t.es_central then t.id end
    from jsonb_array_elements(p_costales) e
   where not exists (select 1 from public.costales k where upper(k.codigo) = upper(trim(e->>'codigo')));
  get diagnostics v_insertados = row_count;
  v_omitidos := jsonb_array_length(p_costales) - v_insertados;

  return jsonb_build_object('cargados', v_insertados, 'ya_estaban', v_omitidos, 'productos_nuevos', v_nuevos_prod,
                            'tienda', t.codigo || ' · ' || t.nombre);
end $$;

-- Traslados con faltantes en piezas (sin precios)
create or replace function public.traslados_lista(p_org uuid) returns table (
  id uuid, numero text, fecha date, referencia text, created_at timestamptz,
  centro text, tienda text, tienda_org text,
  total_costales integer, total_piezas integer,
  recibidos integer, pendientes integer, piezas_pendientes integer,
  sin_existencia text[], revisado_at timestamptz, nota_revision text)
language sql stable security definer set search_path = '' as $$
  select tr.id, tr.numero, tr.fecha, tr.referencia, tr.created_at,
         ce.codigo || ' · ' || ce.nombre, ti.etiqueta, o.nombre,
         tr.total_costales, tr.total_piezas,
         (select count(*) from public.costales k where k.traslado_id = tr.id and k.estado <> 'EN_TRANSITO')::integer,
         (select count(*) from public.costales k where k.traslado_id = tr.id and k.estado = 'EN_TRANSITO')::integer,
         coalesce((select sum(k.piezas_empaque) from public.costales k where k.traslado_id = tr.id and k.estado = 'EN_TRANSITO'), 0)::integer,
         tr.sin_existencia, tr.revisado_at, tr.nota_revision
    from public.traslados tr
    join public.tiendas ce on ce.id = tr.centro_id
    join lateral (select t.codigo || coalesce(' (' || t.bodega || ')', '') || ' · ' || t.nombre as etiqueta
                    from public.tiendas t where t.id = tr.tienda_id) ti on true
    join public.organizaciones o on o.id = tr.organizacion_id
   where (tr.centro_org_id = p_org or tr.organizacion_id = p_org)
     and (app.tiene_rol_org(tr.centro_org_id, array['ADMIN_ORG','BODEGA','SUPERVISOR','AUDITOR']::public.rol_admin[])
          or app.tiene_rol_org(tr.organizacion_id, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[])
          or app.soporte_activo(tr.centro_org_id) or app.soporte_activo(tr.organizacion_id))
   order by tr.created_at desc
   limit 500
$$;

-- Producción de cada contenedor: qué se empacó y dónde está cada costal ahora
create or replace function public.reporte_contenedores(p_org uuid) returns table (
  contenedor text, primera_fecha date, ultima_fecha date,
  costales integer, piezas integer, peso numeric,
  en_centro integer, en_transito integer, en_tienda integer, en_produccion integer, producidos integer,
  piezas_producidas integer, diferencia integer)
language sql stable security definer set search_path = '' as $$
  select coalesce(k.contenedor, 'SIN CONTENEDOR'), min(k.fecha_empaque), max(k.fecha_empaque),
         count(*)::integer, coalesce(sum(k.piezas_empaque), 0)::integer, round(coalesce(sum(k.peso_empaque), 0), 1),
         count(*) filter (where k.tienda_id = k.empacado_en and k.estado = 'EN_TIENDA')::integer,
         count(*) filter (where k.estado = 'EN_TRANSITO')::integer,
         count(*) filter (where k.tienda_id <> k.empacado_en and k.estado = 'EN_TIENDA')::integer,
         count(*) filter (where k.estado = 'EN_PRODUCCION')::integer,
         count(*) filter (where k.estado = 'PRODUCIDO')::integer,
         coalesce(sum(p.piezas_producidas) filter (where p.estado = 'FINALIZADO'), 0)::integer,
         coalesce(sum(p.diferencia) filter (where p.estado = 'FINALIZADO'), 0)::integer
    from public.costales k
    join public.tiendas c on c.id = k.empacado_en
    left join public.producciones p on p.costal_id = k.id
   where c.organizacion_id = p_org
     and (app.tiene_rol_org(p_org, array['ADMIN_ORG','BODEGA','AUDITOR']::public.rol_admin[]) or app.soporte_activo(p_org))
   group by coalesce(k.contenedor, 'SIN CONTENEDOR')
   order by max(k.fecha_empaque) desc nulls last, 1
$$;

revoke all on function public.cargar_existencia(uuid, jsonb), public.traslados_lista(uuid), public.reporte_contenedores(uuid) from public, anon;
grant execute on function public.cargar_existencia(uuid, jsonb), public.traslados_lista(uuid), public.reporte_contenedores(uuid) to authenticated;
revoke all on function app.costal_empacado_en() from public, anon, authenticated;
