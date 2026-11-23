import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/config';

const RUTAS_PUBLICAS = ['/login', '/dispositivo/activar', '/recuperar', '/auth/confirmar', '/registro'];

export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esPublica = RUTAS_PUBLICAS.some((r) => ruta.startsWith(r));

  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    // El celular de tienda (app) sin activar va directo a la activación
    url.pathname = ruta.startsWith('/tienda') ? '/dispositivo/activar' : '/login';
    return NextResponse.redirect(url);
  }
  if (user && ruta === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }
  return respuesta;
}
