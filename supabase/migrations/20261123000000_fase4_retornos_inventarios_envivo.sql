-- =========================================================
-- Fase 4: producción en vivo, retornos de saldo e inventarios del supervisor
-- =========================================================

create type public.estado_retorno as enum ('EN_TRANSITO','RECIBIDO','CON_DIFERENCIA');
create type public.tipo_inventario as enum ('COMPLETO','SELECTIVO');
create type public.estado_inventario as enum ('ABIERTO','CERRADO');

-- ---------------------------------------------------------
-- Retornos de saldo (sacos sin código de barras, contenido mezclado)
-- ---------------------------------------------------------
create table public.retornos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  tienda_id uuid not null references public.tiendas(id) on delete restrict,
  destino_id uuid not null references public.tiendas(id) on delete restrict,
  estado public.estado_retorno not null default 'EN_TRANSITO',
  empleado_id uuid references public.empleados(id),
  enviado_at timestamptz not null default now(),
  piezas_enviadas integer not null default 0,
  piezas_recibidas integer,
  peso_recibido numeric(10,2),
  recibido_por uuid references auth.users(id),
  recibido_at timestamptz,
  notas text,
  created_at timestamptz not null default now()
);
create unique index retornos_codigo_unico on public.retornos (upper(codigo));
create index on public.retornos (tienda_id, estado);
create index on public.retornos (destino_id, estado);

create table public.retorno_lineas (
  id uuid primary key default gen_random_uuid(),
  retorno_id uuid not null references public.retornos(id) on delete cascade,
  categoria_id uuid not null references public.categorias(id) on delete restrict,
  piezas_enviadas integer not null check (piezas_enviadas > 0),
  piezas_recibidas integer check (piezas_recibidas is null or piezas_recibidas >= 0)
);
create index on public.retorno_lineas (retorno_id);

-- ---------------------------------------------------------
-- Inventarios (completos o selectivos por producto)
-- ---------------------------------------------------------
create table public.inventarios (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  tienda_id uuid not null references public.tiendas(id) on delete restrict,
  tipo public.tipo_inventario not null,
  categorias uuid[] not null default '{}',
  estado public.estado_inventario not null default 'ABIERTO',
  creado_por uuid references auth.users(id),
  creado_at timestamptz not null default now(),
  cerrado_por uuid references auth.users(id),
  cerrado_at timestamptz,
  resumen jsonb,
  bajas_aplicadas boolean not null default false
);
create unique index inventarios_uno_abierto on public.inventarios (tienda_id) where estado = 'ABIERTO';
create index on public.inventarios (organizacion_id, creado_at);

create table public.inventario_esperados (
  inventario_id uuid not null references public.inventarios(id) on delete cascade,
  costal_id uuid not null references public.costales(id) on delete cascade,
  codigo text not null,
  primary key (inventario_id, costal_id)
);

create table public.inventario_lecturas (
  inventario_id uuid not null references public.inventarios(id) on delete cascade,
  codigo text not null,
  empleado_id uuid references public.empleados(id),
  leido_at timestamptz not null default now(),
  primary key (inventario_id, codigo)
);

-- ---------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------
create or replace function app.org_de_tienda(p_tienda uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select organizacion_id from public.tiendas where id = p_tienda
$$;

-- Superadmin, admin de la organización o supervisor asignado a esa tienda
create or replace function app.puede_supervisar_tienda(p_tienda uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_rol_org(app.org_de_tienda(p_tienda), array['ADMIN_ORG']::public.rol_admin[])
      or exists (select 1 from public.asignaciones_rol r join public.administradores a on a.id = r.administrador_id
                  where r.administrador_id = auth.uid() and a.activo and r.rol = 'SUPERVISOR' and r.tienda_id = p_tienda)
$$;

-- Centro de distribución al que una tienda devuelve su saldo
create or replace function app.centro_destino(p_tienda uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select t.id from public.tiendas t
      where t.es_central and t.activa and t.id <> p_tienda and t.organizacion_id = app.org_de_tienda(p_tienda)
      order by t.created_at limit 1),
    (select ab.centro_id from public.abastecimientos ab
      where ab.organizacion_id = app.org_de_tienda(p_tienda) order by ab.created_at limit 1))
$$;

revoke all on function app.org_de_tienda(uuid), app.puede_supervisar_tienda(uuid), app.centro_destino(uuid) from public, anon;
grant execute on function app.org_de_tienda(uuid), app.puede_supervisar_tienda(uuid), app.centro_destino(uuid) to authenticated;

alter table public.retornos enable row level security;
alter table public.retorno_lineas enable row level security;
alter table public.inventarios enable row level security;
alter table public.inventario_esperados enable row level security;
alter table public.inventario_lecturas enable row level security;

create policy retornos_select on public.retornos for select to authenticated
  using (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[])
         or app.tiene_rol_org(app.org_de_tienda(destino_id), array['ADMIN_ORG','BODEGA','AUDITOR']::public.rol_admin[])
         or tienda_id = app.mi_dispositivo_tienda());
create policy retorno_lineas_select on public.retorno_lineas for select to authenticated
  using (retorno_id in (select id from public.retornos));
create policy inventarios_select on public.inventarios for select to authenticated
  using (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','AUDITOR']::public.rol_admin[]) or app.puede_supervisar_tienda(tienda_id));
create policy inv_esperados_select on public.inventario_esperados for select to authenticated
  using (inventario_id in (select id from public.inventarios));
create policy inv_lecturas_select on public.inventario_lecturas for select to authenticated
  using (inventario_id in (select id from public.inventarios));
revoke insert, update, delete on public.retornos, public.retorno_lineas, public.inventarios,
  public.inventario_esperados, public.inventario_lecturas from anon, authenticated;

-- ---------------------------------------------------------
-- Producción en vivo (sin diferencias): admin, supervisor y auditor
-- ---------------------------------------------------------
create or replace function public.produccion_en_vivo(p_org uuid)
returns table (tienda_id uuid, tienda text, codigo text, producto text, empleado text, iniciado_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.codigo || ' · ' || t.nombre, k.codigo, cat.nombre, trim(e.nombre || ' ' || coalesce(e.apellidos,'')), p.iniciado_at
    from public.producciones p
    join public.tiendas t on t.id = p.tienda_id
    join public.costales k on k.id = p.costal_id
    left join public.categorias cat on cat.id = k.categoria_id
    join public.empleados e on e.id = p.empleado_id
   where p.estado = 'EN_PROCESO' and p.organizacion_id = p_org
     and app.tiene_rol_org(p_org, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[])
   order by t.codigo, p.iniciado_at
$$;

create or replace function public.produccion_hoy(p_org uuid)
returns table (tienda_id uuid, tienda text, finalizados bigint, en_proceso bigint)
language sql stable security definer set search_path = '' as $$
  select t.id, t.codigo || ' · ' || t.nombre,
         count(*) filter (where p.estado = 'FINALIZADO' and p.finalizado_at >= date_trunc('day', now() at time zone 'America/Guatemala') at time zone 'America/Guatemala'),
         count(*) filter (where p.estado = 'EN_PROCESO')
    from public.tiendas t
    left join public.producciones p on p.tienda_id = t.id
   where t.organizacion_id = p_org
     and app.tiene_rol_org(p_org, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[])
   group by t.id, t.codigo, t.nombre
   order by t.codigo
$$;

-- ---------------------------------------------------------
-- Retornos: recepción en el centro de distribución (web)
-- ---------------------------------------------------------
create or replace function public.recibir_retorno(p_id uuid, p_lineas jsonb, p_peso numeric, p_notas text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.retornos; v_total integer; v_dif boolean;
begin
  select * into r from public.retornos where id = p_id for update;
  if r.id is null then raise exception 'Retorno no encontrado'; end if;
  if not app.tiene_rol_org(app.org_de_tienda(r.destino_id), array['ADMIN_ORG','BODEGA']::public.rol_admin[]) then
    raise exception 'Sin permiso';
  end if;
  if r.estado <> 'EN_TRANSITO' then raise exception 'Este retorno ya fue recibido'; end if;
  update public.retorno_lineas l
     set piezas_recibidas = greatest(0, coalesce((x->>'piezas')::integer, 0))
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) x
   where l.retorno_id = p_id and l.id = (x->>'id')::uuid;
  update public.retorno_lineas set piezas_recibidas = 0 where retorno_id = p_id and piezas_recibidas is null;
  select sum(piezas_recibidas), bool_or(piezas_recibidas <> piezas_enviadas) into v_total, v_dif
    from public.retorno_lineas where retorno_id = p_id;
  update public.retornos
     set estado = case when v_dif then 'CON_DIFERENCIA'::public.estado_retorno else 'RECIBIDO'::public.estado_retorno end,
         piezas_recibidas = v_total, peso_recibido = p_peso, notas = nullif(trim(p_notas), ''),
         recibido_por = auth.uid(), recibido_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'piezas_recibidas', v_total, 'con_diferencia', v_dif);
end $$;

-- ---------------------------------------------------------
-- Inventarios
-- ---------------------------------------------------------
create or replace function public.crear_inventario(p_tienda uuid, p_tipo public.tipo_inventario, p_categorias uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid;
begin
  if not app.puede_supervisar_tienda(p_tienda) then raise exception 'Sin permiso'; end if;
  if p_tipo = 'SELECTIVO' and coalesce(array_length(p_categorias, 1), 0) = 0 then
    raise exception 'Elige al menos un producto para el inventario selectivo';
  end if;
  if exists (select 1 from public.inventarios where tienda_id = p_tienda and estado = 'ABIERTO') then
    raise exception 'Ya hay un inventario abierto en esta tienda';
  end if;
  v_org := app.org_de_tienda(p_tienda);
  insert into public.inventarios (organizacion_id, tienda_id, tipo, categorias, creado_por)
  values (v_org, p_tienda, p_tipo, case when p_tipo = 'SELECTIVO' then p_categorias else '{}' end, auth.uid())
  returning id into v_id;
  -- Foto del stock esperado al momento de abrir
  insert into public.inventario_esperados (inventario_id, costal_id, codigo)
  select v_id, c.id, upper(c.codigo) from public.costales c
   where c.tienda_id = p_tienda and c.estado = 'EN_TIENDA'
     and (p_tipo = 'COMPLETO' or c.categoria_id = any(p_categorias));
  return v_id;
end $$;

-- Detalle del inventario: cada costal esperado o leído con su resultado
create or replace function public.detalle_inventario(p_id uuid)
returns table (codigo text, producto text, resultado text, leido_at timestamptz, empleado text)
language plpgsql stable security definer set search_path = '' as $$
declare i public.inventarios;
begin
  select * into i from public.inventarios where id = p_id;
  if i.id is null or not (app.puede_supervisar_tienda(i.tienda_id)
     or app.tiene_rol_org(i.organizacion_id, array['ADMIN_ORG','AUDITOR']::public.rol_admin[])) then
    raise exception 'Sin permiso';
  end if;
  return query
  select coalesce(e.codigo, l.codigo),
         cat.nombre,
         case
           when e.codigo is not null and l.codigo is not null then 'ENCONTRADO'
           when e.codigo is not null and c.estado in ('EN_PRODUCCION','PRODUCIDO') then 'PRODUCIDO_DURANTE_CONTEO'
           when e.codigo is not null and c.estado = 'ANULADO' then 'DADO_DE_BAJA'
           when e.codigo is not null then 'FALTANTE'
           when c2.id is null then 'SOBRANTE_NO_REGISTRADO'
           else 'SOBRANTE'
         end,
         l.leido_at,
         trim(emp.nombre || ' ' || coalesce(emp.apellidos,''))
    from public.inventario_esperados e
    full join public.inventario_lecturas l on l.inventario_id = e.inventario_id and l.codigo = e.codigo
    left join public.costales c on c.id = e.costal_id
    left join public.costales c2 on upper(c2.codigo) = l.codigo and e.codigo is null
    left join public.categorias cat on cat.id = coalesce(c.categoria_id, c2.categoria_id)
    left join public.empleados emp on emp.id = l.empleado_id
   where coalesce(e.inventario_id, l.inventario_id) = p_id
   order by 3, 1;
end $$;

create or replace function public.cerrar_inventario(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.inventarios; v_res jsonb;
begin
  select * into i from public.inventarios where id = p_id for update;
  if i.id is null or not app.puede_supervisar_tienda(i.tienda_id) then raise exception 'Sin permiso'; end if;
  if i.estado <> 'ABIERTO' then raise exception 'El inventario ya está cerrado'; end if;
  select jsonb_object_agg(resultado, n) into v_res
    from (select resultado, count(*) n from public.detalle_inventario(p_id) group by resultado) x;
  v_res := coalesce(v_res, '{}'::jsonb) || jsonb_build_object('esperados', (select count(*) from public.inventario_esperados where inventario_id = p_id),
                                                              'leidos', (select count(*) from public.inventario_lecturas where inventario_id = p_id));
  update public.inventarios set estado = 'CERRADO', cerrado_por = auth.uid(), cerrado_at = now(), resumen = v_res where id = p_id;
  return v_res;
end $$;

-- Marca como dados de baja (ANULADO) los costales faltantes de un inventario cerrado
create or replace function public.dar_baja_faltantes(p_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare i public.inventarios; v_n integer;
begin
  select * into i from public.inventarios where id = p_id for update;
  if i.id is null or not app.tiene_rol_org(i.organizacion_id, array['ADMIN_ORG']::public.rol_admin[]) then raise exception 'Sin permiso'; end if;
  if i.estado <> 'CERRADO' then raise exception 'Primero cierra el inventario'; end if;
  if i.bajas_aplicadas then raise exception 'Las bajas ya se aplicaron'; end if;
  update public.costales c set estado = 'ANULADO'
    from public.inventario_esperados e
   where e.inventario_id = p_id and e.costal_id = c.id and c.estado = 'EN_TIENDA'
     and not exists (select 1 from public.inventario_lecturas l where l.inventario_id = p_id and l.codigo = e.codigo);
  get diagnostics v_n = row_count;
  update public.inventarios set bajas_aplicadas = true where id = p_id;
  return v_n;
end $$;

-- ---------------------------------------------------------
-- Datos sin internet: se agrega el inventario abierto y el destino del saldo
-- ---------------------------------------------------------
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
    'destino_saldo', (select jsonb_build_object('id', t.id, 'nombre', t.codigo || ' · ' || t.nombre)
                        from public.tiendas t where t.id = app.centro_destino(app.mi_dispositivo_tienda()))
  )
  where app.mi_dispositivo_tienda() is not null
$$;

-- ---------------------------------------------------------
-- Sincronización: se agregan RETORNO e INVENTARIO
-- ---------------------------------------------------------
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
      if v_cat is null or not exists (select 1 from public.categorias where id = v_cat and organizacion_id in (select app.orgs_proveedoras())) then
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

  else
    v_res := jsonb_build_object('ok', false, 'error', 'Operación desconocida.');
  end if;

  insert into public.operaciones_dispositivo (id, dispositivo_id, empleado_id, tipo, datos, ocurrido_at, ok, resultado)
  values (p_id, v_disp, v_emp, p_tipo, coalesce(p_datos, '{}'::jsonb), v_at, coalesce((v_res->>'ok')::boolean, false), v_res);
  update public.dispositivos set ultimo_contacto = now() where id = v_disp;
  return v_res;
end $$;

revoke all on function public.produccion_en_vivo(uuid), public.produccion_hoy(uuid), public.recibir_retorno(uuid, jsonb, numeric, text),
  public.crear_inventario(uuid, public.tipo_inventario, uuid[]), public.detalle_inventario(uuid), public.cerrar_inventario(uuid),
  public.dar_baja_faltantes(uuid) from public, anon;
grant execute on function public.produccion_en_vivo(uuid), public.produccion_hoy(uuid), public.recibir_retorno(uuid, jsonb, numeric, text),
  public.crear_inventario(uuid, public.tipo_inventario, uuid[]), public.detalle_inventario(uuid), public.cerrar_inventario(uuid),
  public.dar_baja_faltantes(uuid) to authenticated;
