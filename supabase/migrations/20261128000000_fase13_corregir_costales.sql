-- =========================================================
-- Fase 13: corrección de costales mal registrados (código mal leído, producto equivocado).
--   Solo administradores de la organización o supervisores de la tienda. Todo queda en bitácora.
-- =========================================================
create table if not exists public.costal_correcciones (
  id uuid primary key default gen_random_uuid(),
  costal_id uuid,
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  accion text not null,
  antes jsonb not null,
  despues jsonb,
  motivo text,
  usuario_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.costal_correcciones enable row level security;
create policy costal_correcciones_ver on public.costal_correcciones for select to authenticated
  using (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG']::public.rol_admin[]) or app.es_superadmin());

create or replace function public.corregir_costal(p_costal uuid, p_codigo text, p_categoria uuid, p_piezas integer, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.costales; v_codigo text;
begin
  select * into c from public.costales where id = p_costal for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Costal no encontrado.'); end if;
  if not app.puede_supervisar_tienda(c.tienda_id) then return jsonb_build_object('ok', false, 'error', 'Sin permiso para corregir este costal.'); end if;
  v_codigo := upper(regexp_replace(coalesce(p_codigo, c.codigo), '[^A-Za-z0-9-]', '', 'g'));
  if length(v_codigo) < 4 then return jsonb_build_object('ok', false, 'error', 'Código no válido.'); end if;
  if v_codigo <> upper(c.codigo) and exists (select 1 from public.costales where upper(codigo) = v_codigo) then
    return jsonb_build_object('ok', false, 'error', 'Ya existe otro costal con el código ' || v_codigo || '.');
  end if;
  if p_categoria is not null and not exists (select 1 from public.categorias where id = p_categoria and activa
                   and organizacion_id in (c.organizacion_id, (select k.organizacion_id from public.categorias k where k.id = c.categoria_id))) then
    return jsonb_build_object('ok', false, 'error', 'Producto no válido.');
  end if;
  if v_codigo <> upper(c.codigo) and c.origen not in ('INVENTARIO_INICIAL', 'RECEPCION_MANUAL') then
    return jsonb_build_object('ok', false, 'error', 'Solo se puede cambiar el código de costales registrados en la tienda (inventario inicial o recepción manual).');
  end if;

  update public.costales
     set codigo = v_codigo, categoria_id = coalesce(p_categoria, categoria_id), piezas_empaque = nullif(p_piezas, 0)
   where id = c.id;
  update public.producciones set piezas_empaque = nullif(p_piezas, 0) where costal_id = c.id;

  insert into public.costal_correcciones (costal_id, organizacion_id, accion, antes, despues, motivo)
  values (c.id, c.organizacion_id, 'CORREGIR',
          jsonb_build_object('codigo', c.codigo, 'categoria_id', c.categoria_id, 'piezas', c.piezas_empaque),
          jsonb_build_object('codigo', v_codigo, 'categoria_id', coalesce(p_categoria, c.categoria_id), 'piezas', nullif(p_piezas, 0)),
          nullif(trim(p_motivo), ''));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.eliminar_costal(p_costal uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.costales;
begin
  select * into c from public.costales where id = p_costal for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Costal no encontrado.'); end if;
  if not app.puede_supervisar_tienda(c.tienda_id) then return jsonb_build_object('ok', false, 'error', 'Sin permiso para eliminar este costal.'); end if;
  if c.origen not in ('INVENTARIO_INICIAL', 'RECEPCION_MANUAL') then
    return jsonb_build_object('ok', false, 'error', 'Solo se eliminan costales registrados en la tienda. Los del centro se corrigen en su traslado.');
  end if;
  if c.estado <> 'EN_TIENDA' or exists (select 1 from public.producciones where costal_id = c.id) then
    return jsonb_build_object('ok', false, 'error', 'El costal ya se usó en producción; solo se puede corregir.');
  end if;
  insert into public.costal_correcciones (costal_id, organizacion_id, accion, antes, motivo)
  values (c.id, c.organizacion_id, 'ELIMINAR',
          jsonb_build_object('codigo', c.codigo, 'categoria_id', c.categoria_id, 'piezas', c.piezas_empaque, 'tienda_id', c.tienda_id, 'origen', c.origen),
          nullif(trim(p_motivo), ''));
  delete from public.costales where id = c.id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.corregir_costal(uuid, text, uuid, integer, text), public.eliminar_costal(uuid, text) from public, anon;
grant execute on function public.corregir_costal(uuid, text, uuid, integer, text), public.eliminar_costal(uuid, text) to authenticated;
