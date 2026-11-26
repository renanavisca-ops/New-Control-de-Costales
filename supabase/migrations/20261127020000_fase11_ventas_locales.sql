-- =========================================================
-- Fase 11: bodega de ventas locales (B037). El centro le traslada costales que no van a tiendas;
--          quedan disponibles sin recepción y el centro los escanea al venderlos.
-- (fase11a: estado VENDIDO, tiendas.es_venta_local, costales.vendido_at / vendido_por)
-- =========================================================

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

  -- Bodega de ventas locales: los costales quedan disponibles para vender, sin recepción por escaneo
  if v_tienda.es_venta_local then
    update public.costales set estado = 'EN_TIENDA', recibido_at = now() where traslado_id = v_id;
  end if;

  return jsonb_build_object('id', v_id, 'tienda', v_tienda.codigo || ' · ' || v_tienda.nombre,
                            'costales', jsonb_array_length(p_costales), 'piezas', v_piezas, 'precio', v_precio,
                            'productos_nuevos', v_nuevos, 'sin_existencia', to_jsonb(v_sin));
end $$;


-- ¿Puede vender en esta bodega de ventas locales? Admin de la organización o bodega de un centro de la misma organización
create or replace function app.puede_vender(p_tienda uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tiendas t where t.id = p_tienda and t.es_venta_local)
     and (app.tiene_rol_org(app.org_de_tienda(p_tienda), array['ADMIN_ORG']::public.rol_admin[])
          or exists (select 1 from public.asignaciones_rol r join public.administradores a on a.id = r.administrador_id
                       join public.tiendas c on c.id = r.tienda_id
                      where r.administrador_id = auth.uid() and a.activo and r.rol = 'BODEGA'
                        and c.es_central and c.organizacion_id = app.org_de_tienda(p_tienda)))
$$;
revoke all on function app.puede_vender(uuid) from public, anon;
grant execute on function app.puede_vender(uuid) to authenticated;

-- Vender un costal escaneado (o digitado) en la bodega de ventas locales
create or replace function public.vender_costal(p_tienda uuid, p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_codigo text; k public.costales; v_prod text;
begin
  if not app.puede_vender(p_tienda) then raise exception 'Sin permiso'; end if;
  v_codigo := upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9-]', '', 'g'));
  if length(v_codigo) < 4 then return jsonb_build_object('ok', false, 'error', 'Código no válido.'); end if;
  select * into k from public.costales where upper(codigo) = v_codigo for update;
  if k.id is null then return jsonb_build_object('ok', false, 'codigo', v_codigo, 'error', 'Ese costal no está registrado.'); end if;
  select nombre into v_prod from public.categorias where id = k.categoria_id;
  if k.estado = 'VENDIDO' then
    return jsonb_build_object('ok', false, 'codigo', v_codigo, 'producto', v_prod, 'error', 'Ya estaba vendido (' || to_char(k.vendido_at at time zone 'America/Guatemala', 'DD/MM/YYYY HH24:MI') || ').');
  end if;
  if k.tienda_id <> p_tienda or k.estado <> 'EN_TIENDA' then
    return jsonb_build_object('ok', false, 'codigo', v_codigo, 'producto', v_prod,
      'error', 'Ese costal no está disponible en esta bodega (' || coalesce((select codigo from public.tiendas where id = k.tienda_id), '?') || ', ' || k.estado || ').');
  end if;
  update public.costales set estado = 'VENDIDO', vendido_at = now(), vendido_por = auth.uid() where id = k.id;
  return jsonb_build_object('ok', true, 'codigo', v_codigo, 'producto', v_prod, 'piezas', k.piezas_empaque);
end $$;

-- Deshacer una venta (escaneada por error)
create or replace function public.anular_venta(p_tienda uuid, p_codigo text) returns void
language plpgsql security definer set search_path = '' as $$
declare k public.costales;
begin
  if not app.puede_vender(p_tienda) then raise exception 'Sin permiso'; end if;
  select * into k from public.costales where upper(codigo) = upper(trim(p_codigo)) and tienda_id = p_tienda for update;
  if k.id is null or k.estado <> 'VENDIDO' then raise exception 'Ese costal no está vendido en esta bodega'; end if;
  update public.costales set estado = 'EN_TIENDA', vendido_at = null, vendido_por = null where id = k.id;
end $$;

-- Ventas locales: stock por producto y ventas del período
create or replace function public.ventas_locales(p_tienda uuid, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not app.puede_vender(p_tienda) then null else jsonb_build_object(
    'stock', coalesce((select jsonb_agg(x order by x->>'producto') from (
        select jsonb_build_object('producto', coalesce(c.nombre, 'SIN PRODUCTO'), 'costales', count(*), 'piezas', coalesce(sum(k.piezas_empaque), 0)) x
          from public.costales k left join public.categorias c on c.id = k.categoria_id
         where k.tienda_id = p_tienda and k.estado = 'EN_TIENDA' group by c.nombre) s), '[]'::jsonb),
    'ventas', coalesce((select jsonb_agg(x order by x->>'vendido_at' desc) from (
        select jsonb_build_object('codigo', k.codigo, 'producto', c.nombre, 'piezas', k.piezas_empaque, 'contenedor', k.contenedor,
                                  'vendido_at', k.vendido_at, 'vendido_por', a.nombre) x
          from public.costales k left join public.categorias c on c.id = k.categoria_id
          left join public.administradores a on a.id = k.vendido_por
         where k.tienda_id = p_tienda and k.estado = 'VENDIDO'
           and (k.vendido_at at time zone 'America/Guatemala')::date between p_desde and p_hasta
         limit 2000) s), '[]'::jsonb)
  ) end
$$;

-- Producción por contenedor con ventas locales (reemplaza a centro_contenedores / reporte_contenedores en la app)
create or replace function public.contenedores_centro(p_centro uuid) returns table (
  contenedor text, primera_fecha date, ultima_fecha date,
  costales integer, piezas integer, peso numeric,
  en_centro integer, en_transito integer, en_tienda integer, en_produccion integer, producidos integer, vendidos integer,
  piezas_producidas integer, diferencia integer)
language sql stable security definer set search_path = '' as $$
  select coalesce(k.contenedor, 'SIN CONTENEDOR'), min(k.fecha_empaque), max(k.fecha_empaque),
         count(*)::integer, coalesce(sum(k.piezas_empaque), 0)::integer, round(coalesce(sum(k.peso_empaque), 0), 1),
         count(*) filter (where k.tienda_id = k.empacado_en and k.estado = 'EN_TIENDA')::integer,
         count(*) filter (where k.estado = 'EN_TRANSITO')::integer,
         count(*) filter (where k.tienda_id <> k.empacado_en and k.estado = 'EN_TIENDA')::integer,
         count(*) filter (where k.estado = 'EN_PRODUCCION')::integer,
         count(*) filter (where k.estado = 'PRODUCIDO')::integer,
         count(*) filter (where k.estado = 'VENDIDO')::integer,
         coalesce(sum(p.piezas_producidas) filter (where p.estado = 'FINALIZADO'), 0)::integer,
         coalesce(sum(p.diferencia) filter (where p.estado = 'FINALIZADO'), 0)::integer
    from public.costales k
    left join public.producciones p on p.costal_id = k.id
   where k.empacado_en = p_centro and app.puede_ver_centro(p_centro)
   group by coalesce(k.contenedor, 'SIN CONTENEDOR')
   order by max(k.fecha_empaque) desc nulls last, 1
$$;

create or replace function public.contenedores_org(p_org uuid) returns table (
  contenedor text, primera_fecha date, ultima_fecha date,
  costales integer, piezas integer, peso numeric,
  en_centro integer, en_transito integer, en_tienda integer, en_produccion integer, producidos integer, vendidos integer,
  piezas_producidas integer, diferencia integer)
language sql stable security definer set search_path = '' as $$
  select coalesce(k.contenedor, 'SIN CONTENEDOR'), min(k.fecha_empaque), max(k.fecha_empaque),
         count(*)::integer, coalesce(sum(k.piezas_empaque), 0)::integer, round(coalesce(sum(k.peso_empaque), 0), 1),
         count(*) filter (where k.tienda_id = k.empacado_en and k.estado = 'EN_TIENDA')::integer,
         count(*) filter (where k.estado = 'EN_TRANSITO')::integer,
         count(*) filter (where k.tienda_id <> k.empacado_en and k.estado = 'EN_TIENDA')::integer,
         count(*) filter (where k.estado = 'EN_PRODUCCION')::integer,
         count(*) filter (where k.estado = 'PRODUCIDO')::integer,
         count(*) filter (where k.estado = 'VENDIDO')::integer,
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

revoke all on function public.vender_costal(uuid, text), public.anular_venta(uuid, text), public.ventas_locales(uuid, date, date),
  public.contenedores_centro(uuid), public.contenedores_org(uuid) from public, anon;
grant execute on function public.vender_costal(uuid, text), public.anular_venta(uuid, text), public.ventas_locales(uuid, date, date),
  public.contenedores_centro(uuid), public.contenedores_org(uuid) to authenticated;

-- Bodega B037 de ventas locales del centro (el documento T01BD es el del traslado del CC a esta bodega)
insert into public.tiendas (organizacion_id, codigo, nombre, bodega, es_venta_local, documento_traslado, documento_nombre)
select t.organizacion_id, 'B037', 'Ventas locales', 'B037', true, 'T01BD', 'TRASLADO EMPAQUE A BODEGA DE DESPACHO'
  from public.tiendas t where t.es_central and t.codigo = 'B090'
on conflict do nothing;
update public.tiendas set documento_traslado = null, documento_nombre = null where es_central and codigo = 'B090';
