import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { COOKIE_SESION, ESQUEMA_API, SUPABASE_KEY, SUPABASE_URL } from '@/lib/config';

/** Cliente con la sesión del usuario (cookies). Respeta RLS y la validación de pertenencia. */
export async function supabaseServidor() {
  const almacen = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: ESQUEMA_API },
    cookieOptions: { name: COOKIE_SESION },
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => almacen.set(name, value, options));
        } catch {
          /* en Server Components no se pueden escribir cookies; el middleware las renueva */
        }
      },
    },
  });
}
