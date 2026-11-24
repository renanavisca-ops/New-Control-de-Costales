-- =========================================================
-- Fase 7: existencia del centro de distribución y de las tiendas desde Excel.
--   * El centro carga sus costales empacados con el mismo reporte del traslado (4ZTRAS99).
--   * Al cargar un traslado, los costales salen del inventario del centro; los que no estaban
--     se envían igual y quedan anotados para revisión.
--   * Las tiendas pueden cargar su inventario inicial con una plantilla de Excel.
-- =========================================================

alter type public.origen_costal add value if not exists 'EMPAQUE_CC';

alter table public.traslados
  add column sin_existencia text[] not null default '{}',
  add column revisado_por uuid references auth.users(id),
  add column revisado_at timestamptz,
  add column nota_revision text;

-- Productos que puede usar una tienda: los de su organización y los de los centros que la abastecen
create or replace function app.orgs_productos_de_tienda(p_tienda uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select app.org_de_tienda(p_tienda)
  union
  select t.organizacion_id from public.abastecimientos ab join public.tiendas t on t.id = ab.centro_id
   where ab.organizacion_id = app.org_de_tienda(p_tienda)
$$;
revoke all on function app.orgs_productos_de_tienda(uuid) from public, anon;
grant execute on function app.orgs_productos_de_tienda(uuid) to authenticated;

-- Carga de existencia (costales que ya están físicamente en la sucursal o en el centro).
-- p_costales: [{codigo, producto, piezas, precio, peso}]
-- Centro: productos nuevos se crean. Tienda: el producto debe existir.
-- Los códigos que ya están en esta misma sucursal en stock se omiten (permite cargar por partes).
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

  insert into public.costales (organizacion_id, codigo, categoria_id, piezas_empaque, peso_empaque, precio, tienda_id,
                               estado, origen, recibido_at)
  select t.organizacion_id, upper(trim(e->>'codigo')),
         (select c.id from public.categorias c
           where c.organizacion_id in (select app.orgs_productos_de_tienda(p_tienda))
             and upper(c.nombre) = upper(trim(e->>'producto'))
           order by (c.organizacion_id = t.organizacion_id) desc limit 1),
         (e->>'piezas')::integer, nullif(e->>'peso','')::numeric, nullif(e->>'precio','')::numeric, t.id, 'EN_TIENDA',
         case when t.es_central then 'EMPAQUE_CC'::public.origen_costal else 'INVENTARIO_INICIAL'::public.origen_costal end,
         now()
    from jsonb_array_elements(p_costales) e
   where not exists (select 1 from public.costales k where upper(k.codigo) = upper(trim(e->>'codigo')));
  get diagnostics v_insertados = row_count;
  v_omitidos := jsonb_array_length(p_costales) - v_insertados;

  return jsonb_build_object('cargados', v_insertados, 'ya_estaban', v_omitidos, 'productos_nuevos', v_nuevos_prod,
                            'tienda', t.codigo || ' · ' || t.nombre);
end $$;
revoke all on function public.cargar_existencia(uuid, jsonb) from public, anon;
grant execute on function public.cargar_existencia(uuid, jsonb) to authenticated;

-- Traslado: los costales que están en el inventario del centro salen de él; los que no, se crean y se anotan.
create or replace function public.importar_traslado(
  p_centro uuid, p_numero text, p_fecha date, p_referencia text, p_bodega_entrada text,
  p_archivo text, p_costales jsonb, p_total_piezas integer, p_total_precio numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_centro public.tiendas; v_tienda public.tiendas; v_id uuid; v_piezas integer; v_precio numeric;
  v_repetidos text; v_nuevos integer; v_sin text[];
begin
  select * into v_centro from public.tiendas where id = p_centro and es_central;
  if v_centro.id is null then raise exception 'Centro de distribución no válido'; end if;
  if not app.tiene_rol_org(v_centro.organizacion_id, array['ADMIN_ORG','BODEGA']::public.rol_admin[]) then
    raise exception 'Sin permiso';
  end if;
  if coalesce(trim(p_numero),'') = '' then raise exception 'El traslado no tiene número'; end if;
  if jsonb_typeof(p_costales) <> 'array' or jsonb_array_length(p_costales) = 0 then raise exception 'El traslado no tiene costales'; end if;

  select t.* into v_tienda from public.tiendas t
   where upper(t.bodega) = upper(trim(p_bodega_entrada)) and t.activa and not t.es_central
     and (t.organizacion_id = v_centro.organizacion_id
          or t.organizacion_id in (select ab.organizacion_id from public.abastecimientos ab where ab.centro_id = v_centro.id))
   limit 1;
  if v_tienda.id is null then
    raise exception 'Ninguna sucursal tiene la bodega de entrada %. Asígnala en Sucursales.', upper(trim(p_bodega_entrada));
  end if;
  if (select count(*) from public.tiendas t
       where upper(t.bodega) = upper(trim(p_bodega_entrada)) and t.activa and not t.es_central
         and (t.organizacion_id = v_centro.organizacion_id
              or t.organizacion_id in (select ab.organizacion_id from public.abastecimientos ab where ab.centro_id = v_centro.id))) > 1 then
    raise exception 'Hay más de una sucursal con la bodega %', upper(trim(p_bodega_entrada));
  end if;

  if exists (select 1 from public.traslados where centro_id = v_centro.id and upper(numero) = upper(trim(p_numero))) then
    raise exception 'El traslado % ya fue cargado', trim(p_numero);
  end if;

  if exists (select 1 from jsonb_array_elements(p_costales) e
              where coalesce(trim(e->>'codigo'),'') = '' or coalesce(trim(e->>'producto'),'') = ''
                 or (e->>'piezas')::integer < 0) then
    raise exception 'Hay filas sin código, sin producto o con piezas no válidas';
  end if;
  if (select count(distinct upper(trim(e->>'codigo'))) from jsonb_array_elements(p_costales) e) <> jsonb_array_length(p_costales) then
    raise exception 'El Excel tiene códigos de costal repetidos';
  end if;
  -- Solo se permite reutilizar un código si está en stock en este centro
  select string_agg(k.codigo, ', ') into v_repetidos from (
    select k.codigo from public.costales k
     where upper(k.codigo) in (select upper(trim(e->>'codigo')) from jsonb_array_elements(p_costales) e)
       and not (k.tienda_id = v_centro.id and k.estado = 'EN_TIENDA')
     limit 10) k;
  if v_repetidos is not null then raise exception 'Estos costales ya fueron enviados o están en otra sucursal: %', v_repetidos; end if;

  select sum((e->>'piezas')::integer), sum(coalesce((e->>'precio')::numeric, 0)) into v_piezas, v_precio
    from jsonb_array_elements(p_costales) e;
  if p_total_piezas is not null and p_total_piezas <> v_piezas then
    raise exception 'La suma de piezas (%) no coincide con el total del reporte (%)', v_piezas, p_total_piezas;
  end if;
  if p_total_precio is not null and abs(p_total_precio - v_precio) > 0.05 then
    raise exception 'La suma de precios (%) no coincide con el total del reporte (%)', v_precio, p_total_precio;
  end if;

  insert into public.categorias (organizacion_id, nombre, piezas_estandar)
  select distinct on (upper(trim(e->>'producto'))) v_centro.organizacion_id, upper(trim(e->>'producto')), (e->>'piezas')::integer
    from jsonb_array_elements(p_costales) e
   where not exists (select 1 from public.categorias c where c.organizacion_id = v_centro.organizacion_id
                                                         and upper(c.nombre) = upper(trim(e->>'producto')));
  get diagnostics v_nuevos = row_count;

  -- Costales que no estaban en el inventario del centro
  select coalesce(array_agg(upper(trim(e->>'codigo')) order by 1), '{}') into v_sin
    from jsonb_array_elements(p_costales) e
   where not exists (select 1 from public.costales k where upper(k.codigo) = upper(trim(e->>'codigo')));

  insert into public.traslados (centro_id, tienda_id, centro_org_id, organizacion_id, numero, referencia, fecha, archivo,
                                total_costales, total_piezas, total_precio, created_by, sin_existencia)
  values (v_centro.id, v_tienda.id, v_centro.organizacion_id, v_tienda.organizacion_id, trim(p_numero),
          nullif(trim(p_referencia),''), p_fecha, nullif(trim(p_archivo),''),
          jsonb_array_length(p_costales), v_piezas, v_precio, auth.uid(), v_sin)
  returning id into v_id;

  -- Salen del centro
  update public.costales k
     set organizacion_id = v_tienda.organizacion_id, tienda_id = v_tienda.id, estado = 'EN_TRANSITO',
         traslado_id = v_id, recibido_at = null, recibido_por = null,
         categoria_id = c.id, piezas_empaque = (e->>'piezas')::integer,
         peso_empaque = coalesce(nullif(e->>'peso','')::numeric, k.peso_empaque),
         precio = coalesce(nullif(e->>'precio','')::numeric, k.precio)
    from jsonb_array_elements(p_costales) e
    join public.categorias c on c.organizacion_id = v_centro.organizacion_id and upper(c.nombre) = upper(trim(e->>'producto'))
   where upper(k.codigo) = upper(trim(e->>'codigo')) and k.tienda_id = v_centro.id and k.estado = 'EN_TIENDA';

  -- No estaban en el centro: se crean
  insert into public.costales (organizacion_id, codigo, categoria_id, piezas_empaque, peso_empaque, precio, tienda_id,
                               estado, origen, traslado_id)
  select v_tienda.organizacion_id, upper(trim(e->>'codigo')), c.id, (e->>'piezas')::integer,
         nullif(e->>'peso','')::numeric, nullif(e->>'precio','')::numeric, v_tienda.id, 'EN_TRANSITO', 'TRASLADO', v_id
    from jsonb_array_elements(p_costales) e
    join public.categorias c on c.organizacion_id = v_centro.organizacion_id and upper(c.nombre) = upper(trim(e->>'producto'))
   where upper(trim(e->>'codigo')) = any(v_sin);

  return jsonb_build_object('id', v_id, 'tienda', v_tienda.codigo || ' · ' || v_tienda.nombre,
                            'costales', jsonb_array_length(p_costales), 'piezas', v_piezas, 'precio', v_precio,
                            'productos_nuevos', v_nuevos, 'sin_existencia', to_jsonb(v_sin));
end $$;

-- Anular: los costales que salieron del centro regresan a su inventario; los creados se borran
create or replace function public.anular_traslado(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare tr public.traslados;
begin
  select * into tr from public.traslados where id = p_id for update;
  if tr.id is null then raise exception 'Traslado no encontrado'; end if;
  if not app.tiene_rol_org(tr.centro_org_id, array['ADMIN_ORG','BODEGA']::public.rol_admin[]) then raise exception 'Sin permiso'; end if;
  if exists (select 1 from public.costales where traslado_id = p_id and estado <> 'EN_TRANSITO') then
    raise exception 'La tienda ya recibió costales de este traslado; no se puede anular';
  end if;
  delete from public.costales where traslado_id = p_id and upper(codigo) = any(tr.sin_existencia);
  update public.costales
     set organizacion_id = tr.centro_org_id, tienda_id = tr.centro_id, estado = 'EN_TIENDA', traslado_id = null
   where traslado_id = p_id;
  delete from public.traslados where id = p_id;
end $$;

-- Marcar revisado un traslado con costales que no estaban en el inventario del centro
create or replace function public.revisar_traslado(p_id uuid, p_nota text) returns void
language plpgsql security definer set search_path = '' as $$
declare tr public.traslados;
begin
  select * into tr from public.traslados where id = p_id;
  if tr.id is null then raise exception 'Traslado no encontrado'; end if;
  if not app.tiene_rol_org(tr.centro_org_id, array['ADMIN_ORG','BODEGA']::public.rol_admin[]) then raise exception 'Sin permiso'; end if;
  update public.traslados set revisado_por = auth.uid(), revisado_at = now(), nota_revision = nullif(trim(p_nota),'')
   where id = p_id;
end $$;

-- Versión con la revisión de costales sin existencia (reemplaza a resumen_traslados en la app)
create or replace function public.traslados_resumen(p_org uuid) returns table (
  id uuid, numero text, fecha date, referencia text, created_at timestamptz,
  centro text, tienda text, tienda_org text,
  total_costales integer, total_piezas integer, total_precio numeric,
  recibidos integer, pendientes integer, valor_pendiente numeric,
  sin_existencia text[], revisado_at timestamptz, nota_revision text)
language sql stable security definer set search_path = '' as $$
  select tr.id, tr.numero, tr.fecha, tr.referencia, tr.created_at,
         ce.codigo || ' · ' || ce.nombre, ti.etiqueta, o.nombre,
         tr.total_costales, tr.total_piezas, tr.total_precio,
         (select count(*) from public.costales k where k.traslado_id = tr.id and k.estado <> 'EN_TRANSITO')::integer,
         (select count(*) from public.costales k where k.traslado_id = tr.id and k.estado = 'EN_TRANSITO')::integer,
         coalesce((select sum(k.precio) from public.costales k where k.traslado_id = tr.id and k.estado = 'EN_TRANSITO'), 0),
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

revoke all on function public.revisar_traslado(uuid, text), public.traslados_resumen(uuid) from public, anon;
grant execute on function public.revisar_traslado(uuid, text), public.traslados_resumen(uuid) to authenticated;
