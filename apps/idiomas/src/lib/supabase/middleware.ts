import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESION, ESQUEMA_API, SUPABASE_KEY, SUPABASE_URL } from '@/lib/config';

const PUBLICAS = ['/entrar', '/registro', '/api/registro'];

export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: ESQUEMA_API },
    cookieOptions: { name: COOKIE_SESION },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const ruta = request.nextUrl.pathname;
  if (!user && ruta !== '/' && !PUBLICAS.some((r) => ruta.startsWith(r))) {
    const url = request.nextUrl.clone();
    url.pathname = '/entrar';
    return NextResponse.redirect(url);
  }
  return respuesta;
}
