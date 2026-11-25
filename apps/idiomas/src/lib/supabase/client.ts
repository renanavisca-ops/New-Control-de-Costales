'use client';
import { createBrowserClient } from '@supabase/ssr';
import { COOKIE_SESION, ESQUEMA_API, SUPABASE_KEY, SUPABASE_URL } from '@/lib/config';

let cliente: ReturnType<typeof crear> | null = null;
function crear() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: ESQUEMA_API },
    cookieOptions: { name: COOKIE_SESION },
  });
}
export function supabaseNavegador() {
  if (!cliente) cliente = crear();
  return cliente;
}
