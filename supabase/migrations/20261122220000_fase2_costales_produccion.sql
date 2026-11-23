-- =========================================================
-- Fase 2: costales, recepción en tienda, inventario inicial y producción
-- =========================================================

create type public.estado_costal as enum ('EN_TRANSITO','EN_TIENDA','EN_PRODUCCION','PRODUCIDO','ANULADO');
create type public.origen_costal as enum ('TRASLADO','INVENTARIO_INICIAL','RECEPCION_MANUAL');
create type public.estado_produccion as enum ('EN_PROCESO','FINALIZADO','CANCELADO');

create table public.costales (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  codigo text not null,
  categoria_id uuid references public.categorias(id) on delete restrict,
  piezas_empaque integer check (piezas_empaque is null or piezas_empaque >= 0),
  peso_empaque numeric(10,2),
  precio numeric(12,2),
  tienda_id uuid not null references public.tiendas(id) on delete restrict,
  estado public.estado_costal not null default 'EN_TIENDA',
  origen public.origen_costal not null,
  recibido_at timestamptz,
  recibido_por uuid references public.empleados(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index costales_codigo_unico on public.costales (upper(codigo));
create index on public.costales (tienda_id, estado);
create index on public.costales (organizacion_id);

create table public.producciones (
  id uuid primary key default gen_random_uuid(),
  costal_id uuid not null unique references public.costales(id) on delete restrict,
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  tienda_id uuid not null references public.tiendas(id) on delete restrict,
  empleado_id uuid not null references public.empleados(id),
  finalizado_por uuid references public.empleados(id),
  dispositivo_id uuid references public.dispositivos(id),
  estado public.estado_produccion not null default 'EN_PROCESO',
  piezas_empaque integer,
  piezas_producidas integer check (piezas_producidas is null or piezas_producidas >= 0),
  diferencia integer generated always as (piezas_producidas - piezas_empaque) stored,
  iniciado_at timestamptz not null default now(),
  finalizado_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.producciones (tienda_id, estado);
create index on public.producciones (organizacion_id, finalizado_at);
create index on public.producciones (empleado_id);

-- Sesiones cortas de empleado en un celular (permite varias personas a la vez)
create table public.empleado_sesiones (
  token_hash text primary key,
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  dispositivo_id uuid not null references public.dispositivos(id) on delete cascade,
  expira timestamptz not null,
  created_at timestamptz not null default now()
);
create index on public.empleado_sesiones (expira);

create trigger t_costales_upd before update on public.costales for each row execute function app.tocar_updated_at();

alter table public.costales enable row level security;
alter table public.producciones enable row level security;
alter table public.empleado_sesiones enable row level security;

-- Costales: los ven los administradores de la organización y el celular de su tienda
create policy costales_select on public.costales for select to authenticated
  using (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','SUPERVISOR','BODEGA','AUDITOR']::public.rol_admin[])
         or tienda_id = app.mi_dispositivo_tienda());
-- Producciones (incluye diferencias): solo administradores y auditores
create policy producciones_select on public.producciones for select to authenticated
  using (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','AUDITOR']::public.rol_admin[]));
revoke insert, update, delete on public.costales, public.producciones from anon, authenticated;
revoke all on public.empleado_sesiones from anon, authenticated;

-- ---------------------------------------------------------
-- Sesión de empleado
-- ---------------------------------------------------------
create or replace function app.empleado_de_token(p_token text) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.empleado_id from public.empleado_sesiones s
    join public.dispositivos d on d.id = s.dispositivo_id
   where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')
     and s.expira > now() and d.usuario_id = auth.uid() and d.estado = 'ACTIVO'
$$;

-- verificar_empleado ahora también devuelve un token de sesión (12 horas)
create or replace function public.verificar_empleado(p_codigo text, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tienda uuid; v_disp uuid; e public.empleados; v_token text;
begin
  select id, tienda_id into v_disp, v_tienda from public.dispositivos where usuario_id = auth.uid() and estado = 'ACTIVO';
  if v_tienda is null then return jsonb_build_object('ok', false, 'error', 'Este dispositivo no está activo.'); end if;
  select * into e from public.empleados where upper(codigo) = upper(trim(p_codigo));
  if e.id is null or not e.activo
     or not exists (select 1 from public.empleado_tiendas where empleado_id = e.id and tienda_id = v_tienda) then
    return jsonb_build_object('ok', false, 'error', 'Código no válido para esta tienda.');
  end if;
  if e.bloqueado_hasta is not null and e.bloqueado_hasta > now() then
    return jsonb_build_object('ok', false, 'error', 'Demasiados intentos. Intenta de nuevo en unos minutos.');
  end if;
  if e.pin_hash is null or e.pin_hash <> extensions.crypt(p_pin, e.pin_hash) then
    update public.empleados
       set pin_intentos = pin_intentos + 1,
           bloqueado_hasta = case when pin_intentos + 1 >= 5 then now() + interval '10 minutes' else null end
     where id = e.id;
    return jsonb_build_object('ok', false, 'error', 'PIN incorrecto.');
  end if;
  update public.empleados set pin_intentos = 0, bloqueado_hasta = null where id = e.id;
  update public.dispositivos set ultimo_contacto = now() where id = v_disp;
  delete from public.empleado_sesiones where expira < now();
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.empleado_sesiones (token_hash, empleado_id, dispositivo_id, expira)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), e.id, v_disp, now() + interval '12 hours');
  return jsonb_build_object('ok', true, 'token', v_token, 'empleado',
    jsonb_build_object('id', e.id, 'codigo', e.codigo, 'nombre', trim(e.nombre || ' ' || coalesce(e.apellidos,''))));
end $$;

-- ---------------------------------------------------------
-- Recepción / inventario inicial (desde el celular)
-- ---------------------------------------------------------
create or replace function public.recibir_costal(p_token text, p_codigo text, p_categoria uuid, p_piezas integer, p_inicial boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; v_tienda uuid; v_org uuid; c public.costales; v_codigo text;
begin
  v_emp := app.empleado_de_token(p_token);
  if v_emp is null then return jsonb_build_object('ok', false, 'error', 'Sesión vencida. Vuelve a ingresar tu código y PIN.'); end if;
  select tienda_id, organizacion_id into v_tienda, v_org from public.dispositivos where usuario_id = auth.uid();
  v_codigo := upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9-]', '', 'g'));
  if length(v_codigo) < 4 then return jsonb_build_object('ok', false, 'error', 'Código no válido.'); end if;

  select * into c from public.costales where upper(codigo) = v_codigo;
  if c.id is not null then
    if c.tienda_id = v_tienda and c.estado = 'EN_TRANSITO' then
      update public.costales set estado = 'EN_TIENDA', recibido_at = now(), recibido_por = v_emp where id = c.id;
      return jsonb_build_object('ok', true, 'resultado', 'RECIBIDO', 'codigo', v_codigo);
    elsif c.tienda_id = v_tienda and c.estado = 'EN_TIENDA' then
      return jsonb_build_object('ok', true, 'resultado', 'YA_RECIBIDO', 'codigo', v_codigo);
    elsif c.tienda_id = v_tienda then
      return jsonb_build_object('ok', false, 'error', 'Este costal ya está en producción o fue producido.');
    else
      return jsonb_build_object('ok', false, 'error', 'Este costal está registrado en otra tienda.');
    end if;
  end if;

  if p_categoria is null then
    return jsonb_build_object('ok', false, 'requiere_categoria', true, 'error', 'Costal no registrado: elige el producto.');
  end if;
  if not exists (select 1 from public.categorias where id = p_categoria and organizacion_id in (select app.orgs_proveedoras())) then
    return jsonb_build_object('ok', false, 'error', 'Producto no válido.');
  end if;
  insert into public.costales (organizacion_id, codigo, categoria_id, piezas_empaque, tienda_id, estado, origen, recibido_at, recibido_por)
  values (v_org, v_codigo, p_categoria, nullif(p_piezas, 0), v_tienda, 'EN_TIENDA',
          case when p_inicial then 'INVENTARIO_INICIAL'::public.origen_costal else 'RECEPCION_MANUAL'::public.origen_costal end,
          now(), v_emp);
  return jsonb_build_object('ok', true, 'resultado', 'REGISTRADO', 'codigo', v_codigo);
end $$;

-- ---------------------------------------------------------
-- Producción
-- ---------------------------------------------------------
create or replace function public.iniciar_produccion(p_token text, p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; v_disp uuid; v_tienda uuid; c public.costales; v_codigo text;
begin
  v_emp := app.empleado_de_token(p_token);
  if v_emp is null then return jsonb_build_object('ok', false, 'error', 'Sesión vencida. Vuelve a ingresar tu código y PIN.'); end if;
  select id, tienda_id into v_disp, v_tienda from public.dispositivos where usuario_id = auth.uid();
  v_codigo := upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9-]', '', 'g'));
  select * into c from public.costales where upper(codigo) = v_codigo for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Costal no registrado en el sistema. Recíbelo primero.'); end if;
  if c.tienda_id <> v_tienda then return jsonb_build_object('ok', false, 'error', 'Este costal pertenece a otra tienda.'); end if;
  if c.estado = 'EN_TRANSITO' then return jsonb_build_object('ok', false, 'error', 'El costal aún no ha sido recibido.'); end if;
  if c.estado = 'EN_PRODUCCION' then return jsonb_build_object('ok', false, 'error', 'Este costal ya está en producción.'); end if;
  if c.estado <> 'EN_TIENDA' then return jsonb_build_object('ok', false, 'error', 'Este costal ya fue producido.'); end if;
  update public.costales set estado = 'EN_PRODUCCION' where id = c.id;
  insert into public.producciones (costal_id, organizacion_id, tienda_id, empleado_id, dispositivo_id, piezas_empaque)
  values (c.id, c.organizacion_id, v_tienda, v_emp, v_disp, c.piezas_empaque);
  return jsonb_build_object('ok', true, 'codigo', v_codigo);
end $$;

create or replace function public.finalizar_produccion(p_token text, p_produccion uuid, p_piezas integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; v_tienda uuid; p public.producciones;
begin
  v_emp := app.empleado_de_token(p_token);
  if v_emp is null then return jsonb_build_object('ok', false, 'error', 'Sesión vencida. Vuelve a ingresar tu código y PIN.'); end if;
  if p_piezas is null or p_piezas < 0 then return jsonb_build_object('ok', false, 'error', 'Ingresa las piezas preparadas.'); end if;
  select tienda_id into v_tienda from public.dispositivos where usuario_id = auth.uid();
  select * into p from public.producciones where id = p_produccion for update;
  if p.id is null or p.tienda_id <> v_tienda then return jsonb_build_object('ok', false, 'error', 'Producción no encontrada.'); end if;
  if p.estado <> 'EN_PROCESO' then return jsonb_build_object('ok', false, 'error', 'Esta producción ya fue finalizada.'); end if;
  update public.producciones
     set estado = 'FINALIZADO', piezas_producidas = p_piezas, finalizado_por = v_emp, finalizado_at = now()
   where id = p.id;
  update public.costales set estado = 'PRODUCIDO' where id = p.costal_id;
  return jsonb_build_object('ok', true);
end $$;

-- Lista de costales en proceso de la tienda (sin diferencias)
create or replace function public.producciones_en_proceso()
returns table (id uuid, codigo text, producto text, empleado_id uuid, empleado text, iniciado_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, c.codigo, cat.nombre, e.id, trim(e.nombre || ' ' || coalesce(e.apellidos,'')), p.iniciado_at
    from public.producciones p
    join public.costales c on c.id = p.costal_id
    left join public.categorias cat on cat.id = c.categoria_id
    join public.empleados e on e.id = p.empleado_id
   where p.estado = 'EN_PROCESO' and p.tienda_id = app.mi_dispositivo_tienda()
   order by p.iniciado_at
$$;

-- Stock de la tienda por producto (para el celular)
create or replace function public.stock_tienda()
returns table (producto text, costales bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(cat.nombre, 'SIN PRODUCTO'), count(*)
    from public.costales c left join public.categorias cat on cat.id = c.categoria_id
   where c.tienda_id = app.mi_dispositivo_tienda() and c.estado = 'EN_TIENDA'
   group by 1 order by 1
$$;

revoke all on function public.recibir_costal(text, text, uuid, integer, boolean), public.iniciar_produccion(text, text),
  public.finalizar_produccion(text, uuid, integer), public.producciones_en_proceso(), public.stock_tienda() from public, anon;
grant execute on function public.recibir_costal(text, text, uuid, integer, boolean), public.iniciar_produccion(text, text),
  public.finalizar_produccion(text, uuid, integer), public.producciones_en_proceso(), public.stock_tienda() to authenticated;
revoke all on function app.empleado_de_token(text) from public, anon;
grant execute on function app.empleado_de_token(text) to authenticated;
