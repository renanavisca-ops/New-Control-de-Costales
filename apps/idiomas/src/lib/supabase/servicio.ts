import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { ESQUEMA_API, SUPABASE_URL } from '@/lib/config';

/**
 * Cliente de SERVICIO. Solo en rutas de servidor. La clave nunca llega al navegador (no lleva
 * prefijo NEXT_PUBLIC). Únicos usos: crear la cuenta de Auth de un alumno nuevo del piloto y
 * borrar el usuario de Auth cuando ya no pertenece a ninguna app del proyecto.
 */
export function supabaseServicio() {
  const clave = process.env.IDIOMAS_SUPABASE_SECRET_KEY;
  if (!clave) throw new Error('Falta IDIOMAS_SUPABASE_SECRET_KEY en el servidor');
  return createClient(SUPABASE_URL, clave, {
    db: { schema: ESQUEMA_API },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
