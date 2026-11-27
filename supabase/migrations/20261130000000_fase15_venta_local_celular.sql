-- =========================================================
-- Fase 15: celular de la bodega de ventas locales (B037): vender y anular venta con código y PIN del empleado.
-- =========================================================
alter table public.costales add column if not exists vendido_empleado uuid references public.empleados(id) on delete set null;

create or replace function public.sincronizar_operacion(p_id uuid, p_tipo text, p_token text, p_datos jsonb, p_ocurrido_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_prev jsonb; v_disp uuid; v_tienda uuid; v_org uuid; v_emp uuid; v_at timestamptz;
  v_codigo text; c public.costales; p public.producciones; v_res jsonb; v_cat uuid; v_piezas integer;
  v_dest uuid; v_ret uuid; v_inv public.inventarios; v_total integer;
begin
  select resultado into v_prev from public.operaciones_dispositivo where id = p_id;
  if v_prev is not null then return v_prev; end if;

  select id, tienda_id, organizacion_id into v_disp, v_tienda, v_org
    from public.dispositivos where usuario_id = auth.uid() and estado = 'ACTIVO';
  if v_disp is null then return jsonb_build_object('ok', false, 'reintentar', true, 'error', 'Dispositivo no activo.'); end if;

  v_at := least(now(), greatest(coalesce(p_ocurrido_at, now()), now() - interval '30 days'));

  select s.empleado_id into v_emp from public.empleado_sesiones s
   where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')
     and s.dispositivo_id = v_disp and s.expira > v_at and s.created_at <= v_at + interval '5 minutes';

  v_codigo := upper(regexp_replace(coalesce(p_datos->>'codigo',''), '[^A-Za-z0-9-]', '', 'g'));

  if v_emp is null then
    v_res := jsonb_build_object('ok', false, 'error', 'Sesión del empleado no válida o vencida.');
  elsif length(v_codigo) < 4 then
    v_res := jsonb_build_object('ok', false, 'error', 'Código no válido.');

  elsif p_tipo = 'RECIBIR' then
    select * into c from public.costales where upper(codigo) = v_codigo for update;
    if c.id is not null then
      if c.tienda_id = v_tienda and c.estado = 'EN_TRANSITO' then
        update public.costales set estado = 'EN_TIENDA', recibido_at = v_at, recibido_por = v_emp where id = c.id;
        v_res := jsonb_build_object('ok', true, 'resultado', 'RECIBIDO');
      elsif c.tienda_id = v_tienda and c.estado = 'EN_TIENDA' then
        v_res := jsonb_build_object('ok', true, 'resultado', 'YA_RECIBIDO');
      elsif c.tienda_id = v_tienda then
        v_res := jsonb_build_object('ok', false, 'error', 'El costal ya está en producción o fue producido.');
      else
        v_res := jsonb_build_object('ok', false, 'error', 'El costal está registrado en otra tienda.');
      end if;
    else
      v_cat := nullif(p_datos->>'categoria_id','')::uuid;
      v_piezas := nullif(p_datos->>'piezas','')::integer;
      if coalesce((p_datos->>'inicial')::boolean, false)
         and exists (select 1 from public.tiendas ti where ti.id = v_tienda and ti.inicial_cerrado_at is not null) then
        v_res := jsonb_build_object('ok', false, 'error', 'El inventario inicial de esta tienda ya está cerrado.');
      elsif v_cat is null or not exists (select 1 from public.categorias where id = v_cat and organizacion_id in (select app.orgs_proveedoras())) then
        v_res := jsonb_build_object('ok', false, 'error', 'Costal no registrado y sin producto válido.');
      else
        insert into public.costales (organizacion_id, codigo, categoria_id, piezas_empaque, tienda_id, estado, origen, recibido_at, recibido_por)
        values (v_org, v_codigo, v_cat, nullif(v_piezas, 0), v_tienda, 'EN_TIENDA',
                case when coalesce((p_datos->>'inicial')::boolean, false) then 'INVENTARIO_INICIAL'::public.origen_costal
                     else 'RECEPCION_MANUAL'::public.origen_costal end,
                v_at, v_emp);
        v_res := jsonb_build_object('ok', true, 'resultado', 'REGISTRADO');
      end if;
    end if;

  elsif p_tipo = 'INICIAR' then
    select * into c from public.costales where upper(codigo) = v_codigo for update;
    if c.id is null then v_res := jsonb_build_object('ok', false, 'error', 'Costal no registrado. Recíbelo primero.');
    elsif c.tienda_id <> v_tienda then v_res := jsonb_build_object('ok', false, 'error', 'El costal pertenece a otra tienda.');
    elsif c.estado = 'EN_TRANSITO' then v_res := jsonb_build_object('ok', false, 'error', 'El costal aún no ha sido recibido.');
    elsif c.estado = 'EN_PRODUCCION' then v_res := jsonb_build_object('ok', false, 'error', 'El costal ya estaba en producción (otra persona lo inició).');
    elsif c.estado <> 'EN_TIENDA' then v_res := jsonb_build_object('ok', false, 'error', 'El costal ya fue producido o dado de baja.');
    elsif exists (select 1 from public.producciones pr where pr.empleado_id = v_emp and pr.estado = 'EN_PROCESO') then
      v_res := jsonb_build_object('ok', false, 'error', 'Esta persona ya tiene un costal en proceso ('
        || (select k.codigo from public.producciones pr join public.costales k on k.id = pr.costal_id
             where pr.empleado_id = v_emp and pr.estado = 'EN_PROCESO' limit 1) || '). Debe finalizarlo antes de iniciar otro.');
    else
      update public.costales set estado = 'EN_PRODUCCION' where id = c.id;
      insert into public.producciones (costal_id, organizacion_id, tienda_id, empleado_id, dispositivo_id, piezas_empaque, iniciado_at)
      values (c.id, c.organizacion_id, v_tienda, v_emp, v_disp, c.piezas_empaque, v_at);
      v_res := jsonb_build_object('ok', true);
    end if;

  elsif p_tipo = 'FINALIZAR' then
    v_piezas := nullif(p_datos->>'piezas','')::integer;
    select pr.* into p from public.producciones pr join public.costales k on k.id = pr.costal_id
     where upper(k.codigo) = v_codigo and pr.estado = 'EN_PROCESO' and pr.tienda_id = v_tienda for update of pr;
    if v_piezas is null or v_piezas < 0 then v_res := jsonb_build_object('ok', false, 'error', 'Piezas no válidas.');
    elsif p.id is null then v_res := jsonb_build_object('ok', false, 'error', 'No hay una producción en proceso para este costal.');
    else
      update public.producciones
         set estado = 'FINALIZADO', piezas_producidas = v_piezas, finalizado_por = v_emp,
             finalizado_at = greatest(v_at, p.iniciado_at)
       where id = p.id;
      update public.costales set estado = 'PRODUCIDO' where id = p.costal_id;
      v_res := jsonb_build_object('ok', true);
    end if;

  elsif p_tipo = 'RETORNO' then
    v_dest := app.centro_destino(v_tienda);
    if v_dest is null then
      v_res := jsonb_build_object('ok', false, 'error', 'La tienda no tiene un centro de distribución asignado para el saldo.');
    elsif jsonb_typeof(p_datos->'lineas') is distinct from 'array' or jsonb_array_length(p_datos->'lineas') = 0 then
      v_res := jsonb_build_object('ok', false, 'error', 'El retorno no tiene productos.');
    elsif exists (select 1 from public.retornos where upper(codigo) = v_codigo) then
      v_res := jsonb_build_object('ok', false, 'error', 'Ese código de retorno ya existe.');
    elsif exists (select 1 from jsonb_array_elements(p_datos->'lineas') x
                   where coalesce((x->>'piezas')::integer, 0) <= 0
                      or not exists (select 1 from public.categorias cat where cat.id = (x->>'categoria_id')::uuid
                                                                          and cat.organizacion_id in (select app.orgs_proveedoras()))) then
      v_res := jsonb_build_object('ok', false, 'error', 'Producto o piezas no válidos en el retorno.');
    else
      select sum((x->>'piezas')::integer) into v_total from jsonb_array_elements(p_datos->'lineas') x;
      insert into public.retornos (codigo, organizacion_id, tienda_id, destino_id, empleado_id, enviado_at, piezas_enviadas)
      values (v_codigo, v_org, v_tienda, v_dest, v_emp, v_at, v_total) returning id into v_ret;
      insert into public.retorno_lineas (retorno_id, categoria_id, piezas_enviadas)
      select v_ret, (x->>'categoria_id')::uuid, (x->>'piezas')::integer from jsonb_array_elements(p_datos->'lineas') x;
      v_res := jsonb_build_object('ok', true, 'resultado', 'RETORNO_CREADO');
    end if;

  elsif p_tipo = 'INVENTARIO' then
    select * into v_inv from public.inventarios where id = nullif(p_datos->>'inventario_id','')::uuid;
    if v_inv.id is null or v_inv.tienda_id <> v_tienda then
      v_res := jsonb_build_object('ok', false, 'error', 'Inventario no encontrado.');
    elsif v_inv.estado <> 'ABIERTO' then
      v_res := jsonb_build_object('ok', false, 'error', 'El inventario ya fue cerrado.');
    else
      insert into public.inventario_lecturas (inventario_id, codigo, empleado_id, leido_at)
      values (v_inv.id, v_codigo, v_emp, v_at) on conflict do nothing;
      v_res := jsonb_build_object('ok', true, 'resultado', case when found then 'LEIDO' else 'YA_LEIDO' end);
    end if;

  elsif p_tipo in ('VENDER', 'ANULAR_VENTA') then
    if not exists (select 1 from public.tiendas ti where ti.id = v_tienda and ti.es_venta_local) then
      v_res := jsonb_build_object('ok', false, 'error', 'Este celular no es de una bodega de ventas locales.');
    else
      select * into c from public.costales where upper(codigo) = v_codigo for update;
      if c.id is null then
        v_res := jsonb_build_object('ok', false, 'error', 'Costal no registrado en el sistema.');
      elsif c.tienda_id <> v_tienda then
        v_res := jsonb_build_object('ok', false, 'error', 'Ese costal no está en esta bodega (está en '
          || coalesce((select ti.codigo from public.tiendas ti where ti.id = c.tienda_id), '?') || ').');
      elsif p_tipo = 'VENDER' and c.estado = 'VENDIDO' then
        v_res := jsonb_build_object('ok', false, 'error', 'Ya estaba vendido ('
          || to_char(c.vendido_at at time zone 'America/Guatemala', 'DD/MM HH24:MI') || ').');
      elsif p_tipo = 'VENDER' and c.estado <> 'EN_TIENDA' then
        v_res := jsonb_build_object('ok', false, 'error', 'El costal no está disponible para vender.');
      elsif p_tipo = 'VENDER' then
        update public.costales set estado = 'VENDIDO', vendido_at = v_at, vendido_por = null, vendido_empleado = v_emp where id = c.id;
        v_res := jsonb_build_object('ok', true, 'resultado', 'VENDIDO');
      elsif c.estado <> 'VENDIDO' then
        v_res := jsonb_build_object('ok', false, 'error', 'Ese costal no está vendido.');
      else
        update public.costales set estado = 'EN_TIENDA', vendido_at = null, vendido_por = null, vendido_empleado = null where id = c.id;
        v_res := jsonb_build_object('ok', true, 'resultado', 'VENTA_ANULADA');
      end if;
    end if;

  else
    v_res := jsonb_build_object('ok', false, 'error', 'Operación desconocida.');
  end if;

  insert into public.operaciones_dispositivo (id, dispositivo_id, empleado_id, tipo, datos, ocurrido_at, ok, resultado)
  values (p_id, v_disp, v_emp, p_tipo, coalesce(p_datos, '{}'::jsonb), v_at, coalesce((v_res->>'ok')::boolean, false), v_res);
  update public.dispositivos set ultimo_contacto = now() where id = v_disp;
  return v_res;
end $$;

create or replace function public.datos_offline() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'generado_at', now(),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre) order by c.nombre)
                              from public.categorias c
                             where c.activa and c.organizacion_id in (select app.orgs_proveedoras())), '[]'::jsonb),
    'costales', coalesce((select jsonb_agg(jsonb_build_object('codigo', upper(k.codigo), 'estado', k.estado, 'producto', cat.nombre))
                            from public.costales k left join public.categorias cat on cat.id = k.categoria_id
                           where k.tienda_id = app.mi_dispositivo_tienda()
                             and k.estado in ('EN_TRANSITO','EN_TIENDA','EN_PRODUCCION')), '[]'::jsonb),
    'en_proceso', coalesce((select jsonb_agg(jsonb_build_object('codigo', upper(k.codigo), 'producto', cat.nombre,
                                                                'empleado_id', e.id, 'empleado', trim(e.nombre || ' ' || coalesce(e.apellidos,'')),
                                                                'iniciado_at', p.iniciado_at) order by p.iniciado_at)
                              from public.producciones p
                              join public.costales k on k.id = p.costal_id
                              left join public.categorias cat on cat.id = k.categoria_id
                              join public.empleados e on e.id = p.empleado_id
                             where p.estado = 'EN_PROCESO' and p.tienda_id = app.mi_dispositivo_tienda()), '[]'::jsonb),
    'inventario', (select jsonb_build_object('id', i.id, 'tipo', i.tipo,
                            'productos', coalesce((select jsonb_agg(cat.nombre order by cat.nombre) from public.categorias cat where cat.id = any(i.categorias)), '[]'::jsonb),
                            'esperados', (select count(*) from public.inventario_esperados x where x.inventario_id = i.id),
                            'leidos', coalesce((select jsonb_agg(l.codigo) from public.inventario_lecturas l where l.inventario_id = i.id), '[]'::jsonb))
                     from public.inventarios i where i.tienda_id = app.mi_dispositivo_tienda() and i.estado = 'ABIERTO'),
    'venta_local', (select t.es_venta_local from public.tiendas t where t.id = app.mi_dispositivo_tienda()),
    'vendidos_hoy', coalesce((select jsonb_agg(jsonb_build_object('codigo', upper(k.codigo), 'producto', cat.nombre, 'vendido_at', k.vendido_at,
                                                                   'empleado', trim(e.nombre || ' ' || coalesce(e.apellidos, ''))) order by k.vendido_at desc)
                                from public.costales k left join public.categorias cat on cat.id = k.categoria_id
                                left join public.empleados e on e.id = k.vendido_empleado
                               where k.tienda_id = app.mi_dispositivo_tienda() and k.estado = 'VENDIDO'
                                 and k.vendido_at > now() - interval '24 hours'), '[]'::jsonb),
    'inicial_cerrado', (select t.inicial_cerrado_at is not null from public.tiendas t where t.id = app.mi_dispositivo_tienda()),
    'destino_saldo', (select jsonb_build_object('id', t.id, 'nombre', t.codigo || ' · ' || t.nombre)
                        from public.tiendas t where t.id = app.centro_destino(app.mi_dispositivo_tienda()))
  )
  where app.mi_dispositivo_tienda() is not null
$$;

create or replace function public.ventas_locales(p_tienda uuid, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not app.puede_vender(p_tienda) then null else jsonb_build_object(
    'stock', coalesce((select jsonb_agg(x order by x->>'producto') from (
        select jsonb_build_object('producto', coalesce(c.nombre, 'SIN PRODUCTO'), 'costales', count(*), 'piezas', coalesce(sum(k.piezas_empaque), 0)) x
          from public.costales k left join public.categorias c on c.id = k.categoria_id
         where k.tienda_id = p_tienda and k.estado = 'EN_TIENDA' group by c.nombre) s), '[]'::jsonb),
    'ventas', coalesce((select jsonb_agg(x order by x->>'vendido_at' desc) from (
        select jsonb_build_object('codigo', k.codigo, 'producto', c.nombre, 'piezas', k.piezas_empaque, 'contenedor', k.contenedor,
                                  'vendido_at', k.vendido_at, 'vendido_por', coalesce(trim(e.nombre || ' ' || coalesce(e.apellidos, '')) || ' (' || e.codigo || ')', a.nombre)) x
          from public.costales k left join public.categorias c on c.id = k.categoria_id
          left join public.administradores a on a.id = k.vendido_por
          left join public.empleados e on e.id = k.vendido_empleado
         where k.tienda_id = p_tienda and k.estado = 'VENDIDO'
           and (k.vendido_at at time zone 'America/Guatemala')::date between p_desde and p_hasta
         limit 2000) s), '[]'::jsonb)
  ) end
$$;

create or replace function public.anular_venta(p_tienda uuid, p_codigo text)
returns void language plpgsql security definer set search_path = '' as $$
declare k public.costales;
begin
  if not app.puede_vender(p_tienda) then raise exception 'Sin permiso'; end if;
  select * into k from public.costales where upper(codigo) = upper(trim(p_codigo)) and tienda_id = p_tienda for update;
  if k.id is null or k.estado <> 'VENDIDO' then raise exception 'Ese costal no está vendido en esta bodega'; end if;
  update public.costales set estado = 'EN_TIENDA', vendido_at = null, vendido_por = null, vendido_empleado = null where id = k.id;
end $$;
