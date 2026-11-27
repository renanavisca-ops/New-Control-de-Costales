-- Fase 14b: auditorías con código temporal (celular de la tienda o cualquier navegador)
-- ---------- Auditorías con código temporal ----------
create table if not exists public.auditoria_codigos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  tienda_id uuid not null references public.tiendas(id) on delete cascade,
  codigo_hash text not null unique,
  pista text not null,
  auditor text not null,
  expira timestamptz not null,
  revocado_at timestamptz,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.auditorias (
  id uuid primary key default gen_random_uuid(),
  codigo_id uuid not null references public.auditoria_codigos(id) on delete cascade,
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  tienda_id uuid not null references public.tiendas(id) on delete cascade,
  auditor text not null,
  estado text not null default 'ABIERTA' check (estado in ('ABIERTA','FINALIZADA')),
  iniciado_at timestamptz not null default now(),
  finalizado_at timestamptz
);
create table if not exists public.auditoria_esperados (
  auditoria_id uuid not null references public.auditorias(id) on delete cascade,
  costal_id uuid,
  codigo text not null,
  producto text,
  piezas integer,
  primary key (auditoria_id, codigo)
);
create table if not exists public.auditoria_lecturas (
  auditoria_id uuid not null references public.auditorias(id) on delete cascade,
  codigo text not null,
  leido_at timestamptz not null default now(),
  nota text,
  primary key (auditoria_id, codigo)
);
create table if not exists public.auditoria_intentos (id bigserial primary key, created_at timestamptz not null default now());
create index if not exists auditoria_intentos_fecha on public.auditoria_intentos (created_at);

alter table public.auditoria_codigos enable row level security;
alter table public.auditorias enable row level security;
alter table public.auditoria_esperados enable row level security;
alter table public.auditoria_lecturas enable row level security;
alter table public.auditoria_intentos enable row level security;

create or replace function app.puede_ver_auditorias(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_rol_org(p_org, array['ADMIN_ORG']::public.rol_admin[]) or app.soporte_activo(p_org) or app.es_superadmin()
$$;
grant execute on function app.puede_ver_auditorias(uuid) to authenticated;

create policy auditoria_codigos_ver on public.auditoria_codigos for select to authenticated using (app.puede_ver_auditorias(organizacion_id));
create policy auditorias_ver on public.auditorias for select to authenticated using (app.puede_ver_auditorias(organizacion_id));

-- Código válido y vigente → fila del código (o null). Los fallos se cuentan para frenar intentos al azar.
create or replace function app.auditoria_codigo_vigente(p_codigo text) returns public.auditoria_codigos
language plpgsql security definer set search_path = '' as $$
declare k public.auditoria_codigos;
begin
  select * into k from public.auditoria_codigos
   where codigo_hash = encode(extensions.digest(upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex')
     and revocado_at is null and expira > now();
  if k.id is null then insert into public.auditoria_intentos default values; end if;
  return k;
end $$;

create or replace function app.auditoria_resultado(p_auditoria uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with a as (select * from public.auditorias where id = p_auditoria),
  l as (select * from public.auditoria_lecturas where auditoria_id = p_auditoria),
  e as (select * from public.auditoria_esperados where auditoria_id = p_auditoria),
  sob as (select l.codigo, l.leido_at, k.estado::text estado, ti.codigo tienda, cat.nombre producto
            from l left join e on e.codigo = l.codigo
            left join public.costales k on upper(k.codigo) = l.codigo
            left join public.tiendas ti on ti.id = k.tienda_id
            left join public.categorias cat on cat.id = k.categoria_id
           where e.codigo is null)
  select jsonb_build_object(
    'id', a.id, 'estado', a.estado, 'auditor', a.auditor, 'iniciado_at', a.iniciado_at, 'finalizado_at', a.finalizado_at,
    'tienda', (select t.codigo || ' · ' || t.nombre from public.tiendas t where t.id = a.tienda_id),
    'esperados', (select count(*) from e),
    'encontrados', (select count(*) from e join l on l.codigo = e.codigo),
    'leidos', (select count(*) from l),
    'por_producto', coalesce((select jsonb_agg(x order by x->>'producto') from (
        select jsonb_build_object('producto', coalesce(e.producto, 'SIN PRODUCTO'), 'esperados', count(*),
                                  'encontrados', count(l.codigo)) x
          from e left join l on l.codigo = e.codigo group by coalesce(e.producto, 'SIN PRODUCTO')) q), '[]'::jsonb),
    'faltantes', coalesce((select jsonb_agg(jsonb_build_object('codigo', e.codigo, 'producto', e.producto, 'piezas', e.piezas) order by e.producto, e.codigo)
                             from e where not exists (select 1 from l where l.codigo = e.codigo)), '[]'::jsonb),
    'sobrantes', coalesce((select jsonb_agg(jsonb_build_object('codigo', s.codigo, 'producto', s.producto, 'estado', s.estado, 'tienda', s.tienda) order by s.leido_at) from sob s), '[]'::jsonb)
  ) from a
$$;

-- Panel: generar y revocar códigos
create or replace function public.crear_codigo_auditoria(p_tienda uuid, p_auditor text, p_horas integer default 24)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.tiendas; v_codigo text; v_alf text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i integer; v_b bytea;
begin
  select * into t from public.tiendas where id = p_tienda and activa;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'Sucursal no válida.'); end if;
  if not (app.tiene_rol_org(t.organizacion_id, array['ADMIN_ORG']::public.rol_admin[]) or app.es_superadmin()) then
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
  if k.id is null or not (app.tiene_rol_org(k.organizacion_id, array['ADMIN_ORG']::public.rol_admin[]) or app.es_superadmin()) then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso.');
  end if;
  update public.auditoria_codigos set revocado_at = now() where id = p_id and revocado_at is null;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.auditoria_reporte(p_auditoria uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organizacion_id into v_org from public.auditorias where id = p_auditoria;
  if v_org is null or not app.puede_ver_auditorias(v_org) then return null; end if;
  return app.auditoria_resultado(p_auditoria);
end $$;

create or replace function public.auditoria_cerrar(p_auditoria uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organizacion_id into v_org from public.auditorias where id = p_auditoria;
  if v_org is null or not (app.tiene_rol_org(v_org, array['ADMIN_ORG']::public.rol_admin[]) or app.es_superadmin()) then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso.');
  end if;
  update public.auditorias set estado = 'FINALIZADA', finalizado_at = now() where id = p_auditoria and estado = 'ABIERTA';
  return jsonb_build_object('ok', true);
end $$;

-- Celular del auditor (con o sin la app): todo se valida con el código temporal
create or replace function public.auditoria_entrar(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.auditoria_codigos; a public.auditorias;
begin
  if (select count(*) from public.auditoria_intentos where created_at > now() - interval '10 minutes') >= 40 then
    return jsonb_build_object('ok', false, 'error', 'Demasiados intentos. Espera unos minutos.');
  end if;
  k := app.auditoria_codigo_vigente(p_codigo);
  if k.id is null then return jsonb_build_object('ok', false, 'error', 'Código no válido o vencido.'); end if;
  select * into a from public.auditorias where codigo_id = k.id and estado = 'ABIERTA' order by iniciado_at desc limit 1;
  if a.id is null then
    insert into public.auditorias (codigo_id, organizacion_id, tienda_id, auditor)
    values (k.id, k.organizacion_id, k.tienda_id, k.auditor) returning * into a;
    insert into public.auditoria_esperados (auditoria_id, costal_id, codigo, producto, piezas)
    select a.id, c.id, upper(c.codigo), cat.nombre, c.piezas_empaque
      from public.costales c left join public.categorias cat on cat.id = c.categoria_id
     where c.tienda_id = k.tienda_id and c.estado = 'EN_TIENDA'
    on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true, 'auditoria_id', a.id, 'expira', k.expira, 'resultado', app.auditoria_resultado(a.id));
end $$;

create or replace function public.auditoria_leer(p_codigo text, p_auditoria uuid, p_costal text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.auditoria_codigos; a public.auditorias; v_c text; v_tipo text; e public.auditoria_esperados; c public.costales; v_info text;
begin
  k := app.auditoria_codigo_vigente(p_codigo);
  if k.id is null then return jsonb_build_object('ok', false, 'error', 'El código de auditoría venció o fue revocado.'); end if;
  select * into a from public.auditorias where id = p_auditoria and codigo_id = k.id;
  if a.id is null or a.estado <> 'ABIERTA' then return jsonb_build_object('ok', false, 'error', 'La auditoría ya fue finalizada.'); end if;
  v_c := upper(regexp_replace(coalesce(p_costal,''), '[^A-Za-z0-9-]', '', 'g'));
  if length(v_c) < 4 then return jsonb_build_object('ok', false, 'error', 'Código de costal no válido.'); end if;
  if exists (select 1 from public.auditoria_lecturas where auditoria_id = a.id and codigo = v_c) then
    v_tipo := 'YA_LEIDO';
  else
    insert into public.auditoria_lecturas (auditoria_id, codigo) values (a.id, v_c);
    select * into e from public.auditoria_esperados where auditoria_id = a.id and codigo = v_c;
    if e.codigo is not null then
      v_tipo := 'ESPERADO'; v_info := e.producto;
    else
      v_tipo := 'NO_REPORTADO';
      select * into c from public.costales where upper(codigo) = v_c;
      v_info := case when c.id is null then 'No existe en el sistema'
                     when c.tienda_id <> a.tienda_id then 'Registrado en ' || coalesce((select codigo from public.tiendas where id = c.tienda_id), 'otra tienda')
                     else 'En el sistema está como ' || c.estado::text end;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'tipo', v_tipo, 'codigo', v_c, 'info', v_info,
    'esperados', (select count(*) from public.auditoria_esperados where auditoria_id = a.id),
    'encontrados', (select count(*) from public.auditoria_esperados x join public.auditoria_lecturas l on l.auditoria_id = x.auditoria_id and l.codigo = x.codigo where x.auditoria_id = a.id),
    'sobrantes', (select count(*) from public.auditoria_lecturas l where l.auditoria_id = a.id
                    and not exists (select 1 from public.auditoria_esperados x where x.auditoria_id = a.id and x.codigo = l.codigo)));
end $$;

create or replace function public.auditoria_estado(p_codigo text, p_auditoria uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.auditoria_codigos;
begin
  k := app.auditoria_codigo_vigente(p_codigo);
  if k.id is null or not exists (select 1 from public.auditorias where id = p_auditoria and codigo_id = k.id) then
    return jsonb_build_object('ok', false, 'error', 'El código de auditoría venció o fue revocado.');
  end if;
  return jsonb_build_object('ok', true, 'resultado', app.auditoria_resultado(p_auditoria));
end $$;

create or replace function public.auditoria_finalizar(p_codigo text, p_auditoria uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.auditoria_codigos;
begin
  k := app.auditoria_codigo_vigente(p_codigo);
  if k.id is null then return jsonb_build_object('ok', false, 'error', 'El código de auditoría venció o fue revocado.'); end if;
  update public.auditorias set estado = 'FINALIZADA', finalizado_at = now() where id = p_auditoria and codigo_id = k.id and estado = 'ABIERTA';
  if not found then return jsonb_build_object('ok', false, 'error', 'La auditoría ya estaba finalizada.'); end if;
  return jsonb_build_object('ok', true, 'resultado', app.auditoria_resultado(p_auditoria));
end $$;

revoke all on function app.auditoria_codigo_vigente(text), app.auditoria_resultado(uuid) from public, anon, authenticated;
revoke all on function public.crear_codigo_auditoria(uuid, text, integer), public.revocar_codigo_auditoria(uuid),
                       public.auditoria_reporte(uuid), public.auditoria_cerrar(uuid) from public, anon;
grant execute on function public.crear_codigo_auditoria(uuid, text, integer), public.revocar_codigo_auditoria(uuid),
                          public.auditoria_reporte(uuid), public.auditoria_cerrar(uuid) to authenticated;
revoke all on function public.auditoria_entrar(text), public.auditoria_leer(text, uuid, text),
                       public.auditoria_estado(text, uuid), public.auditoria_finalizar(text, uuid) from public;
grant execute on function public.auditoria_entrar(text), public.auditoria_leer(text, uuid, text),
                          public.auditoria_estado(text, uuid), public.auditoria_finalizar(text, uuid) to anon, authenticated;
