import { supabaseServidor } from '@/lib/supabase/server';
import type { Contexto } from '@/lib/tipos';

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
