import { cookies } from 'next/headers';
import { supabaseServidor } from '@/lib/supabase/server';
import { AREA_PLATAFORMA, COOKIE_AREA } from '@/lib/area';
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
  const { data } = await sb.from('organizaciones').select('id, nombre').order('nombre');
  const orgs = (data as { id: string; nombre: string }[]) || [];
  const soportes = contexto.soportes ?? [];

  const opciones: OpcionArea[] = [];
  if (superadmin) opciones.push({ id: AREA_PLATAFORMA, nombre: 'Mi plataforma', modo: 'PLATAFORMA', roles: [], soporteHasta: null });
  orgs.forEach((o) => {
    const rolesOrg = [...new Set(roles.filter((r) => r.organizacion_id === o.id).map((r) => r.rol))] as Rol[];
    const hasta = soportes.filter((s) => s.organizacion_id === o.id).map((s) => s.expira_at).sort().pop() ?? null;
    if (rolesOrg.length) opciones.push({ id: o.id, nombre: o.nombre, modo: 'MIEMBRO', roles: rolesOrg, soporteHasta: null });
    else if (superadmin) opciones.push({ id: o.id, nombre: o.nombre, modo: hasta ? 'SOPORTE' : 'SIN_ACCESO', roles: [], soporteHasta: hasta });
  });
  // Primero la plataforma, luego las organizaciones propias, luego las de soporte
  const orden = { PLATAFORMA: 0, MIEMBRO: 1, SOPORTE: 2, SIN_ACCESO: 3 } as const;
  opciones.sort((a, b) => orden[a.modo] - orden[b.modo] || a.nombre.localeCompare(b.nombre));

  const guardada = (await cookies()).get(COOKIE_AREA)?.value;
  const activa =
    opciones.find((o) => o.id === guardada) ?? opciones.find((o) => o.modo === 'MIEMBRO') ?? opciones[0] ?? null;
  return { contexto, opciones, activa };
}

/** ¿Puede ver una pantalla de la organización activa? (por rol en esa organización o por soporte) */
export function puedeVerEnArea(activa: OpcionArea | null, permitidos: Rol[]) {
  if (!activa || activa.modo === 'PLATAFORMA') return false;
  if (activa.modo === 'SOPORTE') return true;
  return activa.roles.some((r) => permitidos.includes(r));
}
