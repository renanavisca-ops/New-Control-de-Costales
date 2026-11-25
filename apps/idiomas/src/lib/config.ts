// Valores públicos del proyecto Supabase de la app de idiomas. No hay valores por defecto que
// apunten a producción: el proyecto autorizado se configura por variables de entorno.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_IDIOMAS_SUPABASE_URL || 'http://localhost:54321';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_IDIOMAS_SUPABASE_PUBLISHABLE_KEY || 'clave-publica-local';
/** Esquema expuesto con las únicas operaciones que puede llamar el cliente. */
export const ESQUEMA_API = 'idiomas_api';
/** Prefijo propio de cookies: la sesión de esta app no se mezcla con la de Control de Costales. */
export const COOKIE_SESION = 'sb-idiomas-auth';
