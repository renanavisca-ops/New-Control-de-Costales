-- =========================================================
-- Fase 9: área del centro de distribución (plataforma propia del CC)
-- =========================================================

-- El usuario de bodega asignado a un centro también lo supervisa (inventario del centro, existencias)
create or replace function app.puede_supervisar_tienda(p_tienda uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_rol_org(app.org_de_tienda(p_tienda), array['ADMIN_ORG']::public.rol_admin[])
      or exists (select 1 from public.asignaciones_rol r join public.administradores a on a.id = r.administrador_id
                  where r.administrador_id = auth.uid() and a.activo and r.tienda_id = p_tienda
                    and (r.rol = 'SUPERVISOR'
                         or (r.rol = 'BODEGA' and exists (select 1 from public.tiendas t where t.id = p_tienda and t.es_central))))
$$;

-- ¿Opera este centro? (admin de su organización o bodega asignada). Para ver, también el soporte vigente.
create or replace function app.puede_operar_centro(p_centro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tiendas t where t.id = p_centro and t.es_central)
     and app.puede_supervisar_tienda(p_centro)
$$;
create or replace function app.puede_ver_centro(p_centro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.puede_operar_centro(p_centro) or app.soporte_activo(app.org_de_tienda(p_centro))
$$;
revoke all on function app.puede_operar_centro(uuid), app.puede_ver_centro(uuid) from public, anon;
grant execute on function app.puede_operar_centro(uuid), app.puede_ver_centro(uuid) to authenticated;

-- Sucursales que abastece un centro: las de su organización y las de las organizaciones clientes
create or replace function app.tiendas_abastecidas(p_centro uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.tiendas t
   where not t.es_central and t.activa
     and (t.organizacion_id = app.org_de_tienda(p_centro)
          or t.organizacion_id in (select ab.organizacion_id from public.abastecimientos ab where ab.centro_id = p_centro))
$$;
revoke all on function app.tiendas_abastecidas(uuid) from public, anon, authenticated;

-- Resumen del centro
create or replace function public.centro_resumen(p_centro uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not app.puede_ver_centro(p_centro) then null else jsonb_build_object(
    'existencia', coalesce((
      select jsonb_agg(x order by x->>'producto') from (
        select jsonb_build_object('producto', coalesce(c.nombre, 'SIN PRODUCTO'), 'costales', count(*), 'piezas', coalesce(sum(k.piezas_empaque), 0)) x
          from public.costales k left join public.categorias c on c.id = k.categoria_id
         where k.tienda_id = p_centro and k.estado = 'EN_TIENDA'
         group by c.nombre) s), '[]'::jsonb),
    'contenedores', (select count(distinct k.contenedor) from public.costales k
                      where k.tienda_id = p_centro and k.estado = 'EN_TIENDA' and k.contenedor is not null),
    'enviados_30d', (select jsonb_build_object('traslados', count(*), 'costales', coalesce(sum(tr.total_costales), 0), 'piezas', coalesce(sum(tr.total_piezas), 0))
                       from public.traslados tr where tr.centro_id = p_centro and tr.created_at > now() - interval '30 days'),
    'tiendas', (select count(*) from app.tiendas_abastecidas(p_centro)),
    'organizaciones', (select count(distinct t.organizacion_id) from public.tiendas t where t.id in (select app.tiendas_abastecidas(p_centro))),
    'retornos_en_camino', (select count(*) from public.retornos r where r.destino_id = p_centro and r.estado = 'EN_TRANSITO'),
    'por_revisar', (select count(*) from public.traslados tr where tr.centro_id = p_centro and cardinality(tr.sin_existencia) > 0 and tr.revisado_at is null),
    'inventario_abierto', (select i.id from public.inventarios i where i.tienda_id = p_centro and i.estado = 'ABIERTO' limit 1)
  ) end
$$;

-- Traslados enviados por el centro, a todas las organizaciones (sin faltantes)
create or replace function public.centro_traslados(p_centro uuid) returns table (
  id uuid, numero text, fecha date, referencia text, created_at timestamptz,
  tienda text, tienda_org text, total_costales integer, total_piezas integer,
  recibidos integer, sin_existencia text[], revisado_at timestamptz, nota_revision text)
language sql stable security definer set search_path = '' as $$
  select tr.id, tr.numero, tr.fecha, tr.referencia, tr.created_at,
         t.codigo || coalesce(' (' || t.bodega || ')', '') || ' · ' || t.nombre, o.nombre,
         tr.total_costales, tr.total_piezas,
         (select count(*) from public.costales k where k.traslado_id = tr.id and k.estado <> 'EN_TRANSITO')::integer,
         tr.sin_existencia, tr.revisado_at, tr.nota_revision
    from public.traslados tr
    join public.tiendas t on t.id = tr.tienda_id
    join public.organizaciones o on o.id = tr.organizacion_id
   where tr.centro_id = p_centro and app.puede_ver_centro(p_centro)
   order by tr.created_at desc
   limit 500
$$;

-- Producción por contenedor de un centro
create or replace function public.centro_contenedores(p_centro uuid) returns table (
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
    left join public.producciones p on p.costal_id = k.id
   where k.empacado_en = p_centro and app.puede_ver_centro(p_centro)
   group by coalesce(k.contenedor, 'SIN CONTENEDOR')
   order by max(k.fecha_empaque) desc nulls last, 1
$$;

-- Qué tiene cada tienda abastecida de cada producto (costales sin abrir y en camino)
create or replace function public.centro_stock_tiendas(p_centro uuid) returns table (
  organizacion text, tienda_id uuid, tienda text, producto text,
  costales integer, piezas integer, en_camino integer)
language sql stable security definer set search_path = '' as $$
  select o.nombre, t.id, t.codigo || ' · ' || t.nombre, coalesce(c.nombre, 'SIN PRODUCTO'),
         count(*) filter (where k.estado = 'EN_TIENDA')::integer,
         coalesce(sum(k.piezas_empaque) filter (where k.estado = 'EN_TIENDA'), 0)::integer,
         count(*) filter (where k.estado = 'EN_TRANSITO')::integer
    from public.costales k
    join public.tiendas t on t.id = k.tienda_id
    join public.organizaciones o on o.id = t.organizacion_id
    left join public.categorias c on c.id = k.categoria_id
   where k.tienda_id in (select app.tiendas_abastecidas(p_centro))
     and k.estado in ('EN_TIENDA', 'EN_TRANSITO')
     and app.puede_ver_centro(p_centro)
   group by o.nombre, t.id, t.codigo, t.nombre, c.nombre
   order by o.nombre, t.codigo, 4
$$;

-- Lectura de un costal en el inventario del centro, desde la computadora (lector USB o teclado)
create or replace function public.leer_inventario_centro(p_inventario uuid, p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.inventarios; v_codigo text; v_esperado boolean; v_n integer;
begin
  select * into i from public.inventarios where id = p_inventario;
  if i.id is null or not app.puede_operar_centro(i.tienda_id) then raise exception 'Sin permiso'; end if;
  if i.estado <> 'ABIERTO' then return jsonb_build_object('ok', false, 'error', 'El inventario ya fue cerrado.'); end if;
  v_codigo := upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9-]', '', 'g'));
  if length(v_codigo) < 4 then return jsonb_build_object('ok', false, 'error', 'Código no válido.'); end if;
  insert into public.inventario_lecturas (inventario_id, codigo, empleado_id, leido_at)
  values (i.id, v_codigo, null, now()) on conflict do nothing;
  get diagnostics v_n = row_count;
  select exists (select 1 from public.inventario_esperados e where e.inventario_id = i.id and e.codigo = v_codigo) into v_esperado;
  return jsonb_build_object('ok', true, 'codigo', v_codigo, 'resultado',
    case when v_n = 0 then 'YA_LEIDO' when v_esperado then 'ENCONTRADO' else 'SOBRANTE' end,
    'leidos', (select count(*) from public.inventario_lecturas l where l.inventario_id = i.id),
    'esperados', (select count(*) from public.inventario_esperados e where e.inventario_id = i.id));
end $$;

revoke all on function public.centro_resumen(uuid), public.centro_traslados(uuid), public.centro_contenedores(uuid),
  public.centro_stock_tiendas(uuid), public.leer_inventario_centro(uuid, text) from public, anon;
grant execute on function public.centro_resumen(uuid), public.centro_traslados(uuid), public.centro_contenedores(uuid),
  public.centro_stock_tiendas(uuid), public.leer_inventario_centro(uuid, text) to authenticated;
