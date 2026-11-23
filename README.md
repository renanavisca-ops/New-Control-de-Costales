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
| `src/app/login`, `src/app/cambiar-password` | Inicio de sesión de administradores y cambio de contraseña temporal |
| `src/app/(app)/admin/*` | Organizaciones, tiendas, productos (con carga desde Excel), empleados, celulares y usuarios |
| `src/app/dispositivo/activar` | Activación del celular de una tienda con código de 8 caracteres |
| `src/app/tienda` | Pantalla del celular de tienda: Producción con código + PIN del empleado |
| `supabase/migrations` | Esquema SQL y políticas RLS aplicadas |
| `supabase/functions/gestionar-usuarios` | Crear/editar administradores y sus roles |
| `supabase/functions/activar-dispositivo` | Activar celulares de tienda |

## Modelo

- **Superadmin** → crea **organizaciones**.
- Cada organización tiene **tiendas**; una o más pueden ser **centro de distribución**, que puede abastecer a otras organizaciones.
- **Productos (categorías)** por organización, cargables desde Excel; los ven sus tiendas y las organizaciones que abastece.
- **Administradores** (correo + contraseña) con roles por organización o tienda.
- **Empleados** de tienda sin correo: código automático (prefijo-0001) + PIN, usados en el celular de la tienda.
- **Celulares** fijados a una tienda mediante código de activación.

## Roles

| Rol | Alcance |
|---|---|
| SUPERADMIN | Toda la plataforma: organizaciones y abastecimiento entre organizaciones |
| ADMIN_ORG | Su organización: tiendas, productos, empleados, celulares, usuarios y diferencias |
| SUPERVISOR | Tiendas asignadas: inventarios completos y selectivos |
| BODEGA | Centro de distribución o bodega asignada: traslados y retornos |
| AUDITOR | Solo lectura de una organización |
