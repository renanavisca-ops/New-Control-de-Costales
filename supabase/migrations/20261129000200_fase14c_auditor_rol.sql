-- Fase 14c: el rol AUDITOR también genera códigos de auditoría y ve los reportes.
create or replace function app.puede_auditar(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_rol_org(p_org, array['ADMIN_ORG','AUDITOR']::public.rol_admin[]) or app.es_superadmin()
$$;
grant execute on function app.puede_auditar(uuid) to authenticated;

create or replace function app.puede_ver_auditorias(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.puede_auditar(p_org) or app.soporte_activo(p_org)
$$;

create or replace function public.crear_codigo_auditoria(p_tienda uuid, p_auditor text, p_horas integer default 24)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.tiendas; v_codigo text; v_alf text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i integer; v_b bytea;
begin
  select * into t from public.tiendas where id = p_tienda and activa;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'Sucursal no válida.'); end if;
  if not (app.puede_auditar(t.organizacion_id)) then
    return jsonb_build_object('ok', false, 'error', 'Solo administradores pueden generar códigos de auditoría.');
  end if;
  if coalesce(trim(p_auditor), '') = '' then return jsonb_build_object('ok', false, 'error', 'Escribe quién hará la auditoría.'); end if;
  v_b := extensions.gen_random_bytes(10);
  v_codigo := '';
  for i in 0..9 loop v_codigo := v_codigo || substr(v_alf, (get_byte(v_b, i) % 32) + 1, 1); end loop;
  insert into public.auditoria_codigos (organizacion_id, tienda_id, codigo_hash, pista, auditor, expira)
  values (t.organizacion_id, t.id, encode(extensions.digest(v_codigo, 'sha256'), 'hex'), right(v_codigo, 3), trim(p_auditor),
          now() + make_interval(hours => least(greatest(coalesce(p_horas, 24), 1), 72)));
  return jsonb_build_object('ok', true, 'codigo', substr(v_codigo, 1, 5) || '-' || substr(v_codigo, 6, 5),
                            'expira', now() + make_interval(hours => least(greatest(coalesce(p_horas, 24), 1), 72)));
end $$;

create or replace function public.revocar_codigo_auditoria(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare k public.auditoria_codigos;
begin
  select * into k from public.auditoria_codigos where id = p_id;
  if k.id is null or not (app.puede_auditar(k.organizacion_id)) then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso.');
  end if;
  update public.auditoria_codigos set revocado_at = now() where id = p_id and revocado_at is null;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.auditoria_cerrar(p_auditoria uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organizacion_id into v_org from public.auditorias where id = p_auditoria;
  if v_org is null or not (app.puede_auditar(v_org)) then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso.');
  end if;
  update public.auditorias set estado = 'FINALIZADA', finalizado_at = now() where id = p_auditoria and estado = 'ABIERTA';
  return jsonb_build_object('ok', true);
end $$;
