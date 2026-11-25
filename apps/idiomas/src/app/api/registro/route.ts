// Alta de una cuenta NUEVA del piloto. Corre en servidor con la clave de servicio (privada).
// 1) valida código y cupo, 2) crea el usuario en Auth. La pertenencia a idiomas la crea luego el
// propio usuario con idiomas_api.unirme (que vuelve a validar todo).
import { NextResponse } from 'next/server';
import { supabaseServicio } from '@/lib/supabase/servicio';

const intentos = new Map<string, { n: number; desde: number }>();

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const ahora = Date.now();
  const r = intentos.get(ip);
  if (r && ahora - r.desde < 3600_000 && r.n >= 10) return NextResponse.json({ ok: false, error: 'Demasiados intentos. Prueba más tarde.' }, { status: 429 });
  intentos.set(ip, r && ahora - r.desde < 3600_000 ? { n: r.n + 1, desde: r.desde } : { n: 1, desde: ahora });

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Solicitud no válida' }, { status: 400 }); }
  if (body.sitio_web) return NextResponse.json({ ok: false, error: 'No se pudo registrar' }, { status: 400 });
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const nombre = String(body.nombre || '').trim().slice(0, 60);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, error: 'Correo no válido' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });

  const sb = supabaseServicio();
  const { data: alta, error: eAlta } = await sb.rpc('servicio_validar_alta', { p_codigo: body.codigo || '' });
  if (eAlta) return NextResponse.json({ ok: false, error: 'No se pudo validar la invitación' }, { status: 500 });
  if (!alta.abiertas) return NextResponse.json({ ok: false, error: 'Las inscripciones están cerradas por ahora.' }, { status: 403 });
  if (!alta.cupo) return NextResponse.json({ ok: false, error: 'El piloto ya alcanzó su cupo de participantes.' }, { status: 403 });
  if (!alta.codigo_valido) return NextResponse.json({ ok: false, error: 'El código de invitación no es válido o ya se usó.' }, { status: 403 });

  const { error } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { nombre },
  });
  if (error) {
    const existe = /already|registered|exists/i.test(error.message);
    return NextResponse.json({ ok: false, error: existe
      ? 'Ya existe una cuenta con ese correo. Entra con ella y únete con tu código.'
      : 'No se pudo crear la cuenta' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
