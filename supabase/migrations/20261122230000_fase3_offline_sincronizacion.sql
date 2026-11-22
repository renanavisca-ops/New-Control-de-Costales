-- =========================================================
-- Fase 3: modo sin internet
--   Cada acción del celular se envía como una "operación" con id único (idempotente),
--   la hora real en que ocurrió y el token de sesión del empleado.
-- =========================================================

create table public.operaciones_dispositivo (
  id uuid primary key,
  dispositivo_id uuid not null references public.dispositivos(id) on delete cascade,
  empleado_id uuid references public.empleados(id),
  tipo text not null,
  datos jsonb not null default '{}'::jsonb,
  ocurrido_at timestamptz not null,
  procesado_at timestamptz not null default now(),
  ok boolean not null,
  resultado jsonb not null
);
create index on public.operaciones_dispositivo (dispositivo_id, procesado_at);
create index on public.operaciones_dispositivo (empleado_id);
alter table public.operaciones_dispositivo enable row level security;
create policy ops_select on public.operaciones_dispositivo for select to authenticated
  using (dispositivo_id in (select d.id from public.dispositivos d
                             where app.tiene_rol_org(d.organizacion_id, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[])));
revoke insert, update, delete on public.operaciones_dispositivo from anon, authenticated;

-- Sesiones de empleado: 7 días (permite trabajar sin internet después de un ingreso en línea)
create or replace function public.verificar_empleado(p_codigo text, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tienda uuid; v_disp uuid; e public.empleados; v_token text; v_expira timestamptz;
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
  delete from public.empleado_sesiones where expira < now() - interval '1 day';
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_expira := now() + interval '7 days';
  insert into public.empleado_sesiones (token_hash, empleado_id, dispositivo_id, expira)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), e.id, v_disp, v_expira);
  return jsonb_build_object('ok', true, 'token', v_token, 'expira', v_expira, 'dispositivo_id', v_disp, 'empleado',
    jsonb_build_object('id', e.id, 'codigo', e.codigo, 'nombre', trim(e.nombre || ' ' || coalesce(e.apellidos,''))));
end $$;

-- Datos que el celular guarda para trabajar sin internet (sin PIN ni diferencias)
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
                             where p.estado = 'EN_PROCESO' and p.tienda_id = app.mi_dispositivo_tienda()), '[]'::jsonb)
  )
  where app.mi_dispositivo_tienda() is not null
$$;

-- Procesa una operación del celular. Idempotente: si el id ya fue procesado devuelve el mismo resultado.
create or replace function public.sincronizar_operacion(p_id uuid, p_tipo text, p_token text, p_datos jsonb, p_ocurrido_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_prev jsonb; v_disp uuid; v_tienda uuid; v_org uuid; v_emp uuid; v_at timestamptz;
  v_codigo text; c public.costales; p public.producciones; v_res jsonb; v_cat uuid; v_piezas integer;
begin
  select resultado into v_prev from public.operaciones_dispositivo where id = p_id;
  if v_prev is not null then return v_prev; end if;

  select id, tienda_id, organizacion_id into v_disp, v_tienda, v_org
    from public.dispositivos where usuario_id = auth.uid() and estado = 'ACTIVO';
  if v_disp is null then return jsonb_build_object('ok', false, 'reintentar', true, 'error', 'Dispositivo no activo.'); end if;

  -- Hora real de la acción (no futura ni de hace más de 30 días)
  v_at := least(now(), greatest(coalesce(p_ocurrido_at, now()), now() - interval '30 days'));

  -- La sesión debía estar vigente cuando ocurrió la acción
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
    elsif c.estado <> 'EN_TIENDA' then v_res := jsonb_build_object('ok', false, 'error', 'El costal ya fue producido.');
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

  else
    v_res := jsonb_build_object('ok', false, 'error', 'Operación desconocida.');
  end if;

  insert into public.operaciones_dispositivo (id, dispositivo_id, empleado_id, tipo, datos, ocurrido_at, ok, resultado)
  values (p_id, v_disp, v_emp, p_tipo, coalesce(p_datos, '{}'::jsonb), v_at, coalesce((v_res->>'ok')::boolean, false), v_res);
  update public.dispositivos set ultimo_contacto = now() where id = v_disp;
  return v_res;
end $$;

revoke all on function public.datos_offline(), public.sincronizar_operacion(uuid, text, text, jsonb, timestamptz) from public, anon;
grant execute on function public.datos_offline(), public.sincronizar_operacion(uuid, text, text, jsonb, timestamptz) to authenticated;
