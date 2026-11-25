// Elimina el perfil de idiomas de quien llama. Primero borra SOLO los datos de idiomas con la
// sesión del propio usuario (idiomas_api.eliminar_mi_perfil). Después, con la clave de servicio,
// consulta si la cuenta pertenece a otra app del proyecto: si pertenece, el usuario de Auth se
// conserva; si no, se elimina.
import { NextResponse } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/server';
import { supabaseServicio } from '@/lib/supabase/servicio';

export async function POST(req: Request) {
  const { confirmacion } = await req.json().catch(() => ({ confirmacion: '' }));
  const sb = await supabaseServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 });

  const { error } = await sb.rpc('eliminar_mi_perfil', { p_confirmacion: confirmacion });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const servicio = supabaseServicio();
  const { data: estado, error: e2 } = await servicio.rpc('servicio_estado_usuario', { p_user: user.id });
  let cuentaEliminada = false;
  if (!e2 && estado?.puede_borrar_auth) {
    const { error: e3 } = await servicio.auth.admin.deleteUser(user.id);
    cuentaEliminada = !e3;
  }
  await sb.auth.signOut();
  return NextResponse.json({ ok: true, cuenta_eliminada: cuentaEliminada, cuenta_compartida_conservada: !!estado?.otra_app });
}
