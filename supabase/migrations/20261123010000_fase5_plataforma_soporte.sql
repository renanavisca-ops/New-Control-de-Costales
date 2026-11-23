-- =========================================================
-- Fase 5: área de plataforma y acceso de soporte (igual que Asistencia biométrica)
--   · El superadmin administra la plataforma (organizaciones, abastecimientos, primeros administradores)
--     pero NO tiene permisos dentro de las organizaciones.
--   · Una organización puede dar acceso de soporte de SOLO LECTURA por tiempo limitado.
--   · Cada ingreso por soporte queda registrado.
-- =========================================================

create table public.soporte_accesos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  otorgado_por uuid references auth.users(id),
  motivo text,
  otorgado_at timestamptz not null default now(),
  expira_at timestamptz not null,
  revocado_at timestamptz,
  revocado_por uuid references auth.users(id)
);
create index on public.soporte_accesos (organizacion_id, expira_at);

create table public.soporte_vistas (
  id bigint generated always as identity primary key,
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  administrador_id uuid not null references public.administradores(id) on delete cascade,
  ruta text,
  visto_at timestamptz not null default now()
);
create index on public.soporte_vistas (organizacion_id, visto_at);

-- ---------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------
-- ¿El superadmin tiene acceso de soporte vigente a esta organización?
create or replace function app.soporte_activo(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.es_superadmin() and exists (
    select 1 from public.soporte_accesos s
     where s.organizacion_id = p_org and s.revocado_at is null and s.expira_at > now())
$$;

-- Roles reales dentro de la organización (el superadmin ya NO cuenta automáticamente)
create or replace function app.tiene_rol_org(p_org uuid, p_roles public.rol_admin[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.asignaciones_rol r join public.administradores a on a.id = r.administrador_id
     where r.administrador_id = auth.uid() and a.activo and r.organizacion_id = p_org and r.rol = any(p_roles))
$$;

-- Organizaciones de trabajo: donde tiene rol, la del celular, y (solo lectura) las de soporte vigente
create or replace function app.orgs_propias() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select r.organizacion_id from public.asignaciones_rol r join public.administradores a on a.id = r.administrador_id
   where r.administrador_id = auth.uid() and a.activo and r.organizacion_id is not null
  union
  select app.mi_dispositivo_org() where app.mi_dispositivo_org() is not null
  union
  select s.organizacion_id from public.soporte_accesos s
   where app.es_superadmin() and s.revocado_at is null and s.expira_at > now()
$$;

revoke all on function app.soporte_activo(uuid) from public, anon;
grant execute on function app.soporte_activo(uuid) to authenticated;

-- Plataforma: el superadmin ve todas las organizaciones, sus centros de distribución y los abastecimientos
alter policy org_select on public.organizaciones
  using (app.es_superadmin() or id in (select app.orgs_propias()) or id in (select app.orgs_clientes()) or id in (select app.orgs_proveedoras()));
alter policy org_update on public.organizaciones
  using (app.es_superadmin() or app.tiene_rol_org(id, array['ADMIN_ORG']::public.rol_admin[]))
  with check (app.es_superadmin() or app.tiene_rol_org(id, array['ADMIN_ORG']::public.rol_admin[]));
alter policy tiendas_select on public.tiendas
  using (organizacion_id in (select app.orgs_propias())
         or organizacion_id in (select app.orgs_clientes())
         or id in (select app.centros_proveedores())
         or (es_central and app.es_superadmin()));
alter policy abast_select on public.abastecimientos
  using (app.es_superadmin() or organizacion_id in (select app.orgs_propias()) or centro_id in (select app.tiendas_propias()));

-- Operación: lectura para roles de la organización y para soporte vigente
alter policy emp_select on public.empleados
  using (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[]) or app.soporte_activo(organizacion_id));
alter policy disp_select on public.dispositivos
  using (usuario_id = (select auth.uid())
         or app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[])
         or app.soporte_activo(organizacion_id));
alter policy costales_select on public.costales
  using (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','SUPERVISOR','BODEGA','AUDITOR']::public.rol_admin[])
         or tienda_id = app.mi_dispositivo_tienda() or app.soporte_activo(organizacion_id));
alter policy producciones_select on public.producciones
  using (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','AUDITOR']::public.rol_admin[]) or app.soporte_activo(organizacion_id));
alter policy ops_select on public.operaciones_dispositivo
  using (dispositivo_id in (select d.id from public.dispositivos d
                             where app.tiene_rol_org(d.organizacion_id, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[])
                                or app.soporte_activo(d.organizacion_id)));
alter policy retornos_select on public.retornos
  using (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[])
         or app.tiene_rol_org(app.org_de_tienda(destino_id), array['ADMIN_ORG','BODEGA','AUDITOR']::public.rol_admin[])
         or tienda_id = app.mi_dispositivo_tienda()
         or app.soporte_activo(organizacion_id));
alter policy inventarios_select on public.inventarios
  using (app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','AUDITOR']::public.rol_admin[])
         or app.puede_supervisar_tienda(tienda_id) or app.soporte_activo(organizacion_id));

alter table public.soporte_accesos enable row level security;
alter table public.soporte_vistas enable row level security;
create policy soporte_select on public.soporte_accesos for select to authenticated
  using (app.es_superadmin() or app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','AUDITOR']::public.rol_admin[]));
create policy soporte_vistas_select on public.soporte_vistas for select to authenticated
  using (app.es_superadmin() or app.tiene_rol_org(organizacion_id, array['ADMIN_ORG','AUDITOR']::public.rol_admin[]));
revoke insert, update, delete on public.soporte_accesos, public.soporte_vistas from anon, authenticated;

-- ---------------------------------------------------------
-- RPC
-- ---------------------------------------------------------
-- La organización otorga acceso de soporte (solo lectura) por un número de horas
create or replace function public.otorgar_soporte(p_org uuid, p_horas integer, p_motivo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.tiene_rol_org(p_org, array['ADMIN_ORG']::public.rol_admin[]) then raise exception 'Sin permiso'; end if;
  if p_horas is null or p_horas < 1 or p_horas > 720 then raise exception 'La duración debe ser de 1 a 720 horas (30 días)'; end if;
  insert into public.soporte_accesos (organizacion_id, otorgado_por, motivo, expira_at)
  values (p_org, auth.uid(), nullif(trim(p_motivo), ''), now() + make_interval(hours => p_horas))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.revocar_soporte(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organizacion_id into v_org from public.soporte_accesos where id = p_id;
  if v_org is null or not app.tiene_rol_org(v_org, array['ADMIN_ORG']::public.rol_admin[]) then raise exception 'Sin permiso'; end if;
  update public.soporte_accesos set revocado_at = now(), revocado_por = auth.uid() where id = p_id and revocado_at is null;
end $$;

-- Registra que el superadmin entró por soporte (máximo un registro cada 30 minutos por organización)
create or replace function public.registrar_vista_soporte(p_org uuid, p_ruta text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.soporte_activo(p_org) then return; end if;
  if exists (select 1 from public.soporte_vistas where organizacion_id = p_org and administrador_id = auth.uid()
              and visto_at > now() - interval '30 minutes') then return; end if;
  insert into public.soporte_vistas (organizacion_id, administrador_id, ruta) values (p_org, auth.uid(), left(p_ruta, 200));
end $$;

-- Resumen de la plataforma (solo superadmin): cifras por organización, sin datos operativos
create or replace function public.plataforma_resumen()
returns table (id uuid, nombre text, prefijo_empleado text, activa boolean, sucursales bigint, centros bigint,
               empleados bigint, celulares bigint, administradores bigint, soporte_hasta timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.nombre, o.prefijo_empleado, o.activa,
         (select count(*) from public.tiendas t where t.organizacion_id = o.id),
         (select count(*) from public.tiendas t where t.organizacion_id = o.id and t.es_central),
         (select count(*) from public.empleados e where e.organizacion_id = o.id and e.activo),
         (select count(*) from public.dispositivos d where d.organizacion_id = o.id and d.estado = 'ACTIVO'),
         (select count(distinct r.administrador_id) from public.asignaciones_rol r where r.organizacion_id = o.id),
         (select max(s.expira_at) from public.soporte_accesos s where s.organizacion_id = o.id and s.revocado_at is null and s.expira_at > now()),
         o.created_at
    from public.organizaciones o
   where app.es_superadmin()
   order by o.nombre
$$;

-- Producción en vivo: también para soporte (solo lectura)
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
     and (app.tiene_rol_org(p_org, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[]) or app.soporte_activo(p_org))
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
     and (app.tiene_rol_org(p_org, array['ADMIN_ORG','SUPERVISOR','AUDITOR']::public.rol_admin[]) or app.soporte_activo(p_org))
   group by t.id, t.codigo, t.nombre
   order by t.codigo
$$;

create or replace function public.detalle_inventario(p_id uuid)
returns table (codigo text, producto text, resultado text, leido_at timestamptz, empleado text)
language plpgsql stable security definer set search_path = '' as $$
declare i public.inventarios;
begin
  select * into i from public.inventarios where id = p_id;
  if i.id is null or not (app.puede_supervisar_tienda(i.tienda_id)
     or app.tiene_rol_org(i.organizacion_id, array['ADMIN_ORG','AUDITOR']::public.rol_admin[])
     or app.soporte_activo(i.organizacion_id)) then
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

-- Contexto de sesión: agrega los accesos de soporte vigentes del superadmin
create or replace function public.mi_contexto() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.administradores where id = auth.uid()) then
      jsonb_build_object(
        'tipo', 'ADMIN',
        'admin', (select to_jsonb(a) - 'created_at' - 'updated_at' from public.administradores a where a.id = auth.uid()),
        'roles', coalesce((select jsonb_agg(jsonb_build_object('rol', r.rol, 'organizacion_id', r.organizacion_id, 'tienda_id', r.tienda_id))
                             from public.asignaciones_rol r where r.administrador_id = auth.uid()), '[]'::jsonb),
        'soportes', coalesce((select jsonb_agg(jsonb_build_object('organizacion_id', s.organizacion_id, 'expira_at', s.expira_at))
                                from public.soporte_accesos s
                               where app.es_superadmin() and s.revocado_at is null and s.expira_at > now()), '[]'::jsonb))
    when exists (select 1 from public.dispositivos where usuario_id = auth.uid()) then
      (select jsonb_build_object(
         'tipo', 'DISPOSITIVO',
         'dispositivo', jsonb_build_object('id', d.id, 'nombre', d.nombre, 'estado', d.estado),
         'tienda', jsonb_build_object('id', t.id, 'codigo', t.codigo, 'nombre', t.nombre, 'es_central', t.es_central),
         'organizacion', jsonb_build_object('id', o.id, 'nombre', o.nombre))
       from public.dispositivos d join public.tiendas t on t.id = d.tienda_id join public.organizaciones o on o.id = d.organizacion_id
       where d.usuario_id = auth.uid())
    else jsonb_build_object('tipo', 'NINGUNO')
  end
$$;

revoke all on function public.otorgar_soporte(uuid, integer, text), public.revocar_soporte(uuid),
  public.registrar_vista_soporte(uuid, text), public.plataforma_resumen() from public, anon;
grant execute on function public.otorgar_soporte(uuid, integer, text), public.revocar_soporte(uuid),
  public.registrar_vista_soporte(uuid, text), public.plataforma_resumen() to authenticated;

-- El dueño de la plataforma también administra su propia organización (se asignó aparte, sin datos personales aquí).
