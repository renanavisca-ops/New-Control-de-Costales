# Control de Costales v2

Control de costales desde el centro de distribución hasta la tienda: traslados, recepción, apertura con conteo de piezas (empaque vs. producción), inventarios y retornos de saldo.

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind 4, desplegado en Vercel.
- **Backend:** Supabase (`control-de-costales`): Postgres con RLS, Auth y Edge Functions.
- Plan completo: [`PLAN_MIGRACION_SUPABASE.md`](./PLAN_MIGRACION_SUPABASE.md).

## Desarrollo

```bash
npm install
npm run dev
```

La URL y la clave pública de Supabase ya vienen por defecto en `src/lib/config.ts`; se pueden sobrescribir con las variables de `.env.example`.

## Estructura

| Ruta | Contenido |
|---|---|
| `src/app/login`, `src/app/cambiar-password` | Inicio de sesión y cambio de contraseña temporal |
| `src/app/(app)` | Pantallas protegidas (requieren perfil activo) |
| `src/app/(app)/admin/*` | Empresas, bodegas, categorías y usuarios |
| `supabase/migrations` | Esquema SQL y políticas RLS aplicadas |
| `supabase/functions/gestionar-usuarios` | Edge Function para crear y administrar usuarios |

## Roles

| Rol | Alcance |
|---|---|
| ADMIN_CENTRO | Centro de distribución: empresas, bodegas, categorías, usuarios y reportes de diferencias |
| BODEGA | Centro de distribución: traslados y retornos (fases siguientes) |
| ADMIN_EMPRESA | Su empresa: usuarios y reportes de diferencias |
| SUPERVISOR | Sus tiendas asignadas: inventarios completos y selectivos |
| OPERADOR | Su tienda: recibir y abrir costales |
