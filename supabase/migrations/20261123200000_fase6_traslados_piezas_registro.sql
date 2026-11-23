-- =========================================================
-- Fase 6: traslados desde Excel, piezas estándar por producto, bodega de entrada por sucursal
-- =========================================================

-- Piezas que normalmente lleva un costal de cada producto
alter table public.categorias add column piezas_estandar integer check (piezas_estandar is null or piezas_estandar >= 0);

update public.categorias c set piezas_estandar = x.p
  from (values ('EXCLUSIVA A',20),('ROPA A',100),('ZAPATO A',15),('CARTERA A',15),('PELUCHE A',10),('CINCHO A',15),
               ('ROPA B',80),('ZAPATO B',15),('CARTERA B',15),('PELUCHE B',15),('CINCHO B',15),
               ('ROPA C',80),('ZAPATO C',20),('ACCESORIOS C',15),('ELECTRONICOS C',15),('BISUTERIA C',20),
               ('JUGUETE C',15),('ROPA GRANDE C',65),('PACA C',200),('TEXTIL A',10),('TEXTIL B',10),('TEXTIL C',10)) as x(n, p)
 where upper(c.nombre) = x.n and c.piezas_estandar is null;

-- Bodega del sistema del centro (ej. B102) a la que corresponde cada sucursal
alter table public.tiendas add column bodega text;
create unique index tiendas_bodega_unica on public.tiendas (organizacion_id, upper(bodega)) where bodega is not null;
update public.tiendas set bodega = upper(codigo) where es_central and bodega is null;

-- Traslados (un Excel = un traslado)
create table public.traslados (
  id uuid primary key default gen_random_uuid(),
  centro_id uuid not null references public.tiendas(id) on delete restrict,
  tienda_id uuid not null references public.tiendas(id) on delete restrict,
  centro_org_id uuid not null references public.organizaciones(id) on delete restrict,
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  numero text not null,
  referencia text,
  fecha date,
  archivo text,
  total_costales integer not null,
  total_piezas integer not null,
  total_precio numeric(14,2) not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index traslados_numero_unico on public.traslados (centro_id, upper(numero));
create index on public.traslados (organizacion_id, created_at);
create index on public.traslados (centro_org_id, created_at);

alter table public.costales add column traslado_id uuid references public.traslados(id) on delete set null;
create index on public.costales (traslado_id);

alter table public.traslados enable row level security;
create policy traslados_select on public.traslados for select to authenticated
  using (app.tiene_rol_org(centro_org_id, array['ADMIN_ORG','BODEGA','SUPERVISOR','AUDITOR']::public.rol_admin[])
         or app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[])
         or app.soporte_activo(centro_org_id) or app.soporte_activo(organizacion_id));
revoke insert, update, delete on public.traslados from anon, authenticated;

-- Importa un traslado ya leído del Excel.
-- p_costales: [{codigo, producto, piezas, precio, peso}]  (producto = nombre exacto; se crea si no existe)
create or replace function public.importar_traslado(
  p_centro uuid, p_numero text, p_fecha date, p_referencia text, p_bodega_entrada text,
  p_archivo text, p_costales jsonb, p_total_piezas integer, p_total_precio numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_centro public.tiendas; v_tienda public.tiendas; v_id uuid; v_piezas integer; v_precio numeric;
  v_repetidos text; v_nuevos integer;
begin
  select * into v_centro from public.tiendas where id = p_centro and es_central;
  if v_centro.id is null then raise exception 'Centro de distribución no válido'; end if;
  if not app.tiene_rol_org(v_centro.organizacion_id, array['ADMIN_ORG','BODEGA']::public.rol_admin[]) then
    raise exception 'Sin permiso';
  end if;
  if coalesce(trim(p_numero),'') = '' then raise exception 'El traslado no tiene número'; end if;
  if jsonb_typeof(p_costales) <> 'array' or jsonb_array_length(p_costales) = 0 then raise exception 'El traslado no tiene costales'; end if;

  -- Sucursal destino: su bodega debe coincidir, en la organización del centro o en las que abastece
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

  -- Validaciones de las filas
  if exists (select 1 from jsonb_array_elements(p_costales) e
              where coalesce(trim(e->>'codigo'),'') = '' or coalesce(trim(e->>'producto'),'') = ''
                 or (e->>'piezas')::integer < 0) then
    raise exception 'Hay filas sin código, sin producto o con piezas no válidas';
  end if;
  if (select count(distinct upper(trim(e->>'codigo'))) from jsonb_array_elements(p_costales) e) <> jsonb_array_length(p_costales) then
    raise exception 'El Excel tiene códigos de costal repetidos';
  end if;
  select string_agg(k.codigo, ', ') into v_repetidos from (
    select k.codigo from public.costales k
     where upper(k.codigo) in (select upper(trim(e->>'codigo')) from jsonb_array_elements(p_costales) e) limit 10) k;
  if v_repetidos is not null then raise exception 'Estos costales ya existen en el sistema: %', v_repetidos; end if;

  select sum((e->>'piezas')::integer), sum(coalesce((e->>'precio')::numeric, 0)) into v_piezas, v_precio
    from jsonb_array_elements(p_costales) e;
  if p_total_piezas is not null and p_total_piezas <> v_piezas then
    raise exception 'La suma de piezas (%) no coincide con el total del reporte (%)', v_piezas, p_total_piezas;
  end if;
  if p_total_precio is not null and abs(p_total_precio - v_precio) > 0.05 then
    raise exception 'La suma de precios (%) no coincide con el total del reporte (%)', v_precio, p_total_precio;
  end if;

  -- Productos nuevos del centro
  insert into public.categorias (organizacion_id, nombre, piezas_estandar)
  select distinct on (upper(trim(e->>'producto'))) v_centro.organizacion_id, upper(trim(e->>'producto')), (e->>'piezas')::integer
    from jsonb_array_elements(p_costales) e
   where not exists (select 1 from public.categorias c where c.organizacion_id = v_centro.organizacion_id
                                                         and upper(c.nombre) = upper(trim(e->>'producto')));
  get diagnostics v_nuevos = row_count;

  insert into public.traslados (centro_id, tienda_id, centro_org_id, organizacion_id, numero, referencia, fecha, archivo,
                                total_costales, total_piezas, total_precio, created_by)
  values (v_centro.id, v_tienda.id, v_centro.organizacion_id, v_tienda.organizacion_id, trim(p_numero),
          nullif(trim(p_referencia),''), p_fecha, nullif(trim(p_archivo),''),
          jsonb_array_length(p_costales), v_piezas, v_precio, auth.uid())
  returning id into v_id;

  insert into public.costales (organizacion_id, codigo, categoria_id, piezas_empaque, peso_empaque, precio, tienda_id,
                               estado, origen, traslado_id)
  select v_tienda.organizacion_id, upper(trim(e->>'codigo')), c.id, (e->>'piezas')::integer,
         nullif(e->>'peso','')::numeric, nullif(e->>'precio','')::numeric, v_tienda.id, 'EN_TRANSITO', 'TRASLADO', v_id
    from jsonb_array_elements(p_costales) e
    join public.categorias c on c.organizacion_id = v_centro.organizacion_id and upper(c.nombre) = upper(trim(e->>'producto'));

  return jsonb_build_object('id', v_id, 'tienda', v_tienda.codigo || ' · ' || v_tienda.nombre,
                            'costales', jsonb_array_length(p_costales), 'piezas', v_piezas, 'precio', v_precio,
                            'productos_nuevos', v_nuevos);
end $$;

-- Resumen de traslados visibles, con avance de recepción
create or replace function public.resumen_traslados(p_org uuid) returns table (
  id uuid, numero text, fecha date, referencia text, created_at timestamptz,
  centro text, tienda text, tienda_org text,
  total_costales integer, total_piezas integer, total_precio numeric,
  recibidos integer, pendientes integer, valor_pendiente numeric)
language sql stable security definer set search_path = '' as $$
  select tr.id, tr.numero, tr.fecha, tr.referencia, tr.created_at,
         ce.codigo || ' · ' || ce.nombre, ti.coalesce_codigo, o.nombre,
         tr.total_costales, tr.total_piezas, tr.total_precio,
         (select count(*) from public.costales k where k.traslado_id = tr.id and k.estado <> 'EN_TRANSITO')::integer,
         (select count(*) from public.costales k where k.traslado_id = tr.id and k.estado = 'EN_TRANSITO')::integer,
         coalesce((select sum(k.precio) from public.costales k where k.traslado_id = tr.id and k.estado = 'EN_TRANSITO'), 0)
    from public.traslados tr
    join public.tiendas ce on ce.id = tr.centro_id
    join lateral (select t.codigo || coalesce(' (' || t.bodega || ')', '') || ' · ' || t.nombre as coalesce_codigo
                    from public.tiendas t where t.id = tr.tienda_id) ti on true
    join public.organizaciones o on o.id = tr.organizacion_id
   where (tr.centro_org_id = p_org or tr.organizacion_id = p_org)
     and (app.tiene_rol_org(tr.centro_org_id, array['ADMIN_ORG','BODEGA','SUPERVISOR','AUDITOR']::public.rol_admin[])
          or app.tiene_rol_org(tr.organizacion_id, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[])
          or app.soporte_activo(tr.centro_org_id) or app.soporte_activo(tr.organizacion_id))
   order by tr.created_at desc
   limit 500
$$;

-- Detalle de un traslado: cada costal con su estado
create or replace function public.detalle_traslado(p_id uuid) returns table (
  codigo text, producto text, piezas integer, precio numeric, peso numeric, estado public.estado_costal,
  recibido_at timestamptz, recibido_por text)
language sql stable security definer set search_path = '' as $$
  select k.codigo, c.nombre, k.piezas_empaque, k.precio, k.peso_empaque, k.estado, k.recibido_at,
         trim(e.nombre || ' ' || coalesce(e.apellidos,''))
    from public.costales k
    join public.traslados tr on tr.id = k.traslado_id
    left join public.categorias c on c.id = k.categoria_id
    left join public.empleados e on e.id = k.recibido_por
   where k.traslado_id = p_id
     and (app.tiene_rol_org(tr.centro_org_id, array['ADMIN_ORG','BODEGA','SUPERVISOR','AUDITOR']::public.rol_admin[])
          or app.tiene_rol_org(tr.organizacion_id, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[])
          or app.soporte_activo(tr.centro_org_id) or app.soporte_activo(tr.organizacion_id))
   order by k.estado, c.nombre, k.codigo
$$;

-- Anular un traslado cargado por error (solo si la tienda aún no recibió nada)
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
  delete from public.costales where traslado_id = p_id;
  delete from public.traslados where id = p_id;
end $$;

revoke all on function public.importar_traslado(uuid, text, date, text, text, text, jsonb, integer, numeric),
  public.resumen_traslados(uuid), public.detalle_traslado(uuid), public.anular_traslado(uuid) from public, anon;
grant execute on function public.importar_traslado(uuid, text, date, text, text, text, jsonb, integer, numeric),
  public.resumen_traslados(uuid), public.detalle_traslado(uuid), public.anular_traslado(uuid) to authenticated;

-- Organizaciones creadas desde el registro público
alter table public.organizaciones add column registro_publico boolean not null default false;
