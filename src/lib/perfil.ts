import { supabaseServidor } from '@/lib/supabase/server';
import type { Perfil } from '@/lib/tipos';

export async function obtenerSesion() {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, perfil: null as Perfil | null };
  const { data } = await supabase.from('perfiles').select('*').eq('id', user.id).maybeSingle();
  return { user, perfil: (data as Perfil | null) ?? null };
}
