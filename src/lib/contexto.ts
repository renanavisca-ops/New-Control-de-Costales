import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { supabaseServidor } from '@/lib/supabase/server';
import { AREA_PLATAFORMA, COOKIE_AREA, PREFIJO_CENTRO } from '@/lib/area';
import { esSuperadmin, type AsignacionRol, type Contexto, type OpcionArea, type Rol } from '@/lib/tipos';

export async function obtenerContexto(): Promise<{ autenticado: boolean; contexto: Contexto }> {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { autenticado: false, contexto: { tipo: 'NINGUNO' } };
  const { data } = await supabase.rpc('mi_contexto');
  return { autenticado: true, contexto: (data as Contexto) ?? { tipo: 'NINGUNO' } };
}

/** Roles del administrador actual (para pasar a componentes cliente). */
export async function rolesActuales() {
  const { contexto } = await obtenerContexto();
  return contexto.tipo === 'ADMIN' ? contexto.roles : [];
}

/** Áreas disponibles (plataforma + organizaciones) y el área activa. */
export async function obtenerArea() {
  const { contexto } = await obtenerContexto();
  if (contexto.tipo !== 'ADMIN') return { contexto, opciones: [] as OpcionArea[], activa: null as OpcionArea | null };
  const roles: AsignacionRol[] = contexto.roles;
  const superadmin = esSuperadmin(roles);
  const sb = await supabaseServidor();
  const [{ data }, { data: dc }] = await Promise.all([
    sb.from('organizaciones').select('id, nombre').order('nombre'),
    sb.from('tiendas').select('id, codigo, nombre, organizacion_id').eq('es_central', true).eq('activa', true).order('codigo'),
  ]);
  const orgs = (data as { id: string; nombre: string }[]) || [];
  const centros = (dc as { id: string; codigo: string; nombre: string; organizacion_id: string }[]) || [];
  const soportes = contexto.soportes ?? [];

  const opciones: OpcionArea[] = [];
  if (superadmin) opciones.push({ id: AREA_PLATAFORMA, nombre: 'Mi plataforma', modo: 'PLATAFORMA', roles: [], soporteHasta: null });
  orgs.forEach((o) => {
    // El rol Bodega de un centro de distribución trabaja en el área del centro, no en la organización
    const idsCentros = new Set(centros.map((c) => c.id));
    const rolesOrg = [
      ...new Set(
        roles.filter((r) => r.organizacion_id === o.id && !(r.rol === 'BODEGA' && r.tienda_id && idsCentros.has(r.tienda_id))).map((r) => r.rol),
      ),
    ] as Rol[];
    const hasta = soportes.filter((s) => s.organizacion_id === o.id).map((s) => s.expira_at).sort().pop() ?? null;
    if (rolesOrg.length) opciones.push({ id: o.id, nombre: o.nombre, modo: 'MIEMBRO', roles: rolesOrg, soporteHasta: null });
    else if (superadmin) opciones.push({ id: o.id, nombre: o.nombre, modo: hasta ? 'SOPORTE' : 'SIN_ACCESO', roles: [], soporteHasta: hasta });
  });
  // Centros de distribución que opera: admin de su organización o bodega asignada al centro
  centros.forEach((c) => {
    const rolesCentro = [
      ...new Set(
        roles
          .filter((r) => (r.rol === 'ADMIN_ORG' && r.organizacion_id === c.organizacion_id) || (r.rol === 'BODEGA' && r.tienda_id === c.id))
          .map((r) => r.rol),
      ),
    ] as Rol[];
    if (rolesCentro.length)
      opciones.push({ id: PREFIJO_CENTRO + c.id, nombre: `Centro ${c.codigo} · ${c.nombre}`, modo: 'CENTRO', roles: rolesCentro, soporteHasta: null, centro: c });
  });
  // Primero la plataforma, luego las organizaciones propias, los centros y las de soporte
  const orden = { PLATAFORMA: 0, MIEMBRO: 1, CENTRO: 2, SOPORTE: 3, SIN_ACCESO: 4 } as const;
  opciones.sort((a, b) => orden[a.modo] - orden[b.modo] || a.nombre.localeCompare(b.nombre));

  const guardada = (await cookies()).get(COOKIE_AREA)?.value;
  const soloBodega = roles.length > 0 && roles.every((r) => r.rol === 'BODEGA');
  const activa =
    opciones.find((o) => o.id === guardada) ??
    (soloBodega ? opciones.find((o) => o.modo === 'CENTRO') : undefined) ??
    opciones.find((o) => o.modo === 'MIEMBRO') ??
    opciones[0] ??
    null;
  return { contexto, opciones, activa };
}

/** ¿Puede ver una pantalla de la organización activa? (por rol en esa organización o por soporte) */
export function puedeVerEnArea(activa: OpcionArea | null, permitidos: Rol[]) {
  if (!activa || activa.modo === 'PLATAFORMA' || activa.modo === 'CENTRO') return false;
  if (activa.modo === 'SOPORTE') return true;
  return activa.roles.some((r) => permitidos.includes(r));
}

/** Exige estar en el área de un centro de distribución; devuelve el centro. */
export async function exigirCentro() {
  const r = await obtenerArea();
  if (r.activa?.modo !== 'CENTRO' || !r.activa.centro) redirect('/');
  const roles = r.contexto.tipo === 'ADMIN' ? r.contexto.roles : [];
  return { ...r, centro: r.activa.centro, roles };
}
