'use client';
import { supabaseNavegador } from '@/lib/supabase/client';
import { esSuperadmin, type AsignacionRol, type Organizacion } from '@/lib/tipos';

/** Organizaciones donde el usuario tiene algún rol (todas si es superadmin). */
export async function cargarOrgsPropias(roles: AsignacionRol[]): Promise<Organizacion[]> {
  const { data } = await supabaseNavegador().from('organizaciones').select('*').order('nombre');
  const todas = (data as Organizacion[]) || [];
  if (esSuperadmin(roles)) return todas;
  const ids = new Set(roles.map((r) => r.organizacion_id));
  return todas.filter((o) => ids.has(o.id));
}

/** Llama a una RPC y devuelve un mensaje de error legible. */
export async function rpc<T = unknown>(nombre: string, args: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { data, error } = await supabaseNavegador().rpc(nombre, args);
  if (error) return { error: traducirError(error.message) };
  return { data: data as T };
}

export function traducirError(m: string) {
  if (!m) return 'Error desconocido';
  if (m.includes('duplicate key') && m.includes('tiendas_codigo')) return 'Ya existe una tienda con ese código.';
  if (m.includes('duplicate key') && m.includes('categorias_nombre')) return 'Ya existe un producto con ese nombre.';
  if (m.includes('duplicate key') && m.includes('prefijo')) return 'Ese prefijo ya lo usa otra organización.';
  if (m.includes('prefijo_empleado_check')) return 'El prefijo debe tener de 2 a 6 letras o números, en mayúsculas.';
  if (m.includes('row-level security') || m.includes('Sin permiso')) return 'No tienes permiso para esta acción.';
  return m;
}
