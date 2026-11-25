# Puente · App de idiomas (piloto)

Puente es una app original para aprender idiomas.

- **Piloto:** inglés desde español, con una unidad A1 completa («De compras: ropa y tallas», 51 ejercicios).
- **Muestra adicional:** un mini curso de francés desde español (6 ejercicios), que demuestra que el mismo motor sirve para otros pares de idiomas.
- **Proyecto Supabase propio:** Puente se despliega en un proyecto **dedicado y exclusivo**. No usa tablas, funciones, roles, credenciales ni configuración de ninguna otra app. La prueba `5b` lo verifica.
- **Sin servicios de pago adicionales:** no usa IA de pago (la conversación con IA está preparada y desactivada) ni contrata otros servicios. La adaptación al alumno corre en Postgres y el audio usa la voz del propio dispositivo.

## Estructura

| Ruta | Contenido |
|---|---|
| `supabase/migrations/` | 7 migraciones, que se aplican en orden de nombre |
| `supabase/seed/` | Currículo original: `01_curso_es_en_a1.sql` y `02_curso_es_fr_mini.sql` |
| `supabase/local/` | **Solo para uso local**: simulación de la plataforma y códigos de prueba (no se aplica en producción) |
| `src/` | Web en Next.js: bienvenida, registro, catálogo, ruta, lección, práctica, resumen, perfil y consola editorial |
| `src/lib/ia/conversacion.ts` | Interfaz de conversación con IA, desactivada |
| `scripts/db-local.sh` | Base local vacía con la simulación de la plataforma; aplica migraciones y contenido como `postgres` sin superusuario |
| `scripts/supabase-local.mjs` | API local (Auth + RPC) **solo para desarrollo** |
| `scripts/generar-codigos.mjs` | Genera los códigos de invitación y muestra el SQL; no los guarda en disco |
| `tests/*.test.mjs` | 18 pruebas de base de datos |
| `tests/ui/recorrido.mjs` | Prueba completa en el navegador con Playwright |

### Migraciones

| Archivo | Contenido |
|---|---|
| `…0100_idiomas_base` | Rol `idiomas_propietario`, esquemas, configuración, pertenencia, currículo, claves privadas y bucket privado |
| `…0200_idiomas_estado_alumno` | Inscripciones, sesiones, intentos, evidencia, dominio, XP y racha, con RLS |
| `…0300_idiomas_motor` | Evaluación determinista |
| `…0400_idiomas_aprendizaje` | Dominio, repaso espaciado y armado de la práctica |
| `…0500_idiomas_api` | Operaciones de `idiomas_api` |
| `…0600_idiomas_contenido_y_servicio` | Métricas, cola editorial, validación de altas y `eliminar_mi_cuenta` |
| `…0700_puente_publicacion_minima` | Retira `pg_graphql` y cierra `public` |

## Seguridad (resumen)

- **Lo que puede llamar el cliente:** solo funciones de `idiomas_api`. Cada una exige una sesión válida y pertenencia activa en `idiomas.miembros`. Tener una cuenta de Auth no da acceso: hace falta un código de invitación.
- **Dueño de los objetos:** el rol `idiomas_propietario` (NOLOGIN) es dueño de las tablas y funciones, y no tiene privilegios sobre `public`, `auth` ni `storage`. Las funciones internas no son ejecutables por `PUBLIC`.
- **Claves de respuesta:** son privadas. La solución solo se muestra después de responder. Excepción: los dictados con voz del dispositivo, por eso la prueba de unidad no incluye dictados.
- **Archivos:** el bucket `idiomas-medios` es privado, con máximo 1 MB por archivo y solo audio o imagen. Lo leen los miembros y solo lo escriben los editores.
- **Clave de servicio:** solo la usa el servidor, en `/api/registro`, para crear la cuenta de un alumno invitado.
  - El borrado de la cuenta (`eliminar_mi_cuenta`) no la necesita: usa la sesión del propio usuario.
  - La conversación con IA y la evaluación con IA están desactivadas en `idiomas.config`.

## Instalación desde cero

### 1. Probar en local

Hace falta tener Postgres 16 o superior y Node 22.

```bash
cd apps/idiomas
npm install
npm test
```

`npm test` crea una base vacía, aplica 7 migraciones y el contenido, y ejecuta las 18 pruebas.

También se puede probar con la imagen oficial de Postgres de Supabase. Esa imagen no trae el esquema `storage`: sus tablas las crea el servicio de Storage. Para la prueba hay que crear `storage.buckets` y `storage.objects` a mano.

```bash
docker run -d --name puente-sb -e POSTGRES_PASSWORD=<local> -p 54330:5432 supabase/postgres:17.6.1.063
```

Después, aplica en orden `supabase/migrations/*.sql`, `supabase/seed/*.sql` y `supabase/local/10_*.sql`, conectado como `postgres`. Luego ejecuta las pruebas:

```bash
PGHOST=127.0.0.1 PGPORT=54330 PGPASSWORD=<local> node --test --test-concurrency=1 "tests/*.test.mjs"
```

Para probar la interfaz:

```bash
node scripts/supabase-local.mjs
```

```bash
cp .env.example .env.local
```

En `.env.local` pon:

- `NEXT_PUBLIC_IDIOMAS_SUPABASE_URL=http://localhost:54321`
- `IDIOMAS_SUPABASE_SECRET_KEY=sb_secret_local_solo_desarrollo`

Después:

```bash
npx next build && npx next start -p 3100
```

```bash
node tests/ui/recorrido.mjs
```

### 2. Crear el proyecto Supabase «Puente»

Crear un proyecto nuevo en la organización Pro tiene un **cargo recurrente de cómputo (Micro, ~USD 10 al mes)**. Hace falta la aprobación de gasto del titular. La alternativa sin cargo es una organización en plan Free (ver «Costo»).

1. Crea el proyecto con nombre `Puente` y región `us-east-2`.
2. En el **SQL Editor** (rol `postgres`), aplica en orden:
   - los 7 archivos de `supabase/migrations/`;
   - los 2 archivos de `supabase/seed/`.
3. No apliques nada de `supabase/local/`.
4. Ejecuta `node scripts/generar-codigos.mjs 2 1 alumno` y pega en el SQL Editor la salida que muestra. Guarda los códigos fuera del repositorio.

### 3. Configuración en el panel de Supabase

Ninguna herramienta de este repositorio puede cambiar estos ajustes; se hacen en el panel.

| Ajuste | Valor |
|---|---|
| Settings → Data API → Exposed schemas | **solo `idiomas_api`**; quitar `public` y `graphql_public` |
| Authentication → URL Configuration → Site URL | la URL de Vercel de Puente |
| Authentication → URL Configuration → Redirect URLs | `https://<dominio-puente>/**` |
| Authentication → Sign In / Providers → Email → Allow new users to sign up | **desactivado** (las altas solo entran por `/api/registro`, con invitación) |
| Authentication → Providers → Anonymous sign-ins | desactivado |
| Authentication → Attack protection → Leaked password protection | activado |
| Authentication → Emails | Remitente y textos con la identidad de Puente. Para enviar correos a cualquier dirección hace falta un SMTP propio; el piloto no depende de correos, porque las cuentas se crean confirmadas desde el servidor |
| Advisors → Security | revisar y corregir lo que corresponda |

### 4. Desplegar en Vercel

1. Crea un proyecto **nuevo** importando el repositorio, con *Root Directory* `apps/idiomas`, framework Next.js y la rama del piloto como *Production Branch*.
2. Carga las variables de entorno (sin valores en el repositorio):

| Variable | Ámbito | Origen |
|---|---|---|
| `NEXT_PUBLIC_IDIOMAS_SUPABASE_URL` | Production | URL del proyecto Puente |
| `NEXT_PUBLIC_IDIOMAS_SUPABASE_PUBLISHABLE_KEY` | Production | Clave *publishable* de Puente |
| `IDIOMAS_SUPABASE_SECRET_KEY` | Production, **Sensitive** | Una clave *secret* de Puente creada solo para esta app; nunca va con el prefijo `NEXT_PUBLIC` |

## Deshabilitar Puente si surge un problema

Ordenado de menor a mayor impacto. Ningún paso afecta a otros proyectos.

1. **Cerrar las altas nuevas:**
   ```sql
   update idiomas.config set valor = 'false' where clave = 'inscripciones_abiertas';
   ```
   Para desactivar además los códigos de invitación:
   ```sql
   update idiomas.codigos_invitacion set activo = false;
   ```
2. **Suspender a un alumno:**
   ```sql
   update idiomas.miembros set estado = 'suspendido' where user_id = '<id>';
   ```
   Pierde el acceso de inmediato y sus datos se conservan.
3. **Cortar el acceso de todos sin borrar datos:**
   ```sql
   update idiomas.miembros set estado = 'suspendido';
   ```
   O bien quitar `idiomas_api` de *Exposed schemas*.
4. **Retirar la web:** en Vercel, *Settings → Deployment Protection* (proteger) o *Pause/Delete project*.
5. **Detener el gasto:** pausar el proyecto Supabase (*Project settings → Pause*). Un proyecto pausado no genera cargos de cómputo.

## Estado del despliegue

Ver la sección final de la entrega más reciente: qué está probado en local, qué en el despliegue, y los pasos que siguen pendientes de aprobación.

## Costo

Fuente: documentación de Supabase, consultada el 25/11/2026.

- **Organización actual (Pro):** cada proyecto adicional cuesta Micro, USD 0,01344 por hora (**~USD 10 al mes**), cobrado por hora y aunque no se use. Los USD 10 de créditos de cómputo cubren un solo proyecto, y la organización ya tiene 3. Ese cargo de cómputo no lo limita el *Spend Cap*. El uso del piloto (≈135 MB de base de datos, ≈1 GB de transferencia y ≤50 usuarios activos al mes) cabe en las cuotas incluidas.
- **Sin cargo:** una organización **Free** aparte, que admite hasta 2 proyectos gratuitos por titular. Tiene dos límites: 500 MB de base de datos (suficiente para el piloto) y **pausa tras una semana sin actividad**. Esta organización solo la puede crear el titular en el panel.
- **Vercel:** el plan del equipo no está disponible en la API consultada. En Hobby, un proyecto más no tiene costo, pero Hobby es solo para uso no comercial.
