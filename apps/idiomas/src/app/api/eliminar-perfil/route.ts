// Elimina la cuenta de quien llama en el proyecto dedicado de Puente: borra todos sus datos de
// Puente y su usuario de Auth mediante idiomas_api.eliminar_mi_cuenta, con la sesión del propio
// usuario. No necesita la clave de servicio.
import { NextResponse } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const { confirmacion } = await req.json().catch(() => ({ confirmacion: '' }));
  const sb = await supabaseServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 });
  const { error } = await sb.rpc('eliminar_mi_cuenta', { p_confirmacion: confirmacion });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  await sb.auth.signOut();
  return NextResponse.json({ ok: true, cuenta_eliminada: true });
}
