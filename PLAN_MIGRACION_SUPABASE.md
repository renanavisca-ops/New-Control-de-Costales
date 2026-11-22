# Plan: Control de Costales v2 (Supabase + Vercel)

> Borrador del 22/11/2026. Todavía no se ha ejecutado nada.

---

## 1. La idea de la app

Cada costal tiene un código de barras (`EMP02…`) y una categoría (ROPA A, ZAPATO B, etc.). Cada categoría define cuántas piezas trae el costal. La app sigue la **vida de cada costal** dentro de las tiendas:

```
 BODEGA ──envía──► TIENDA
                     │
          1. RECIBIR (escanear) ──► estado: EN_STOCK
                     │
          2. TRASLADAR (opcional) ──► otra tienda, sigue EN_STOCK
                     │
          3. ABRIR + CONTAR piezas ──► estado: ABIERTO
                     │                  (diferencia = contadas − esperadas)
          4. INVENTARIO FÍSICO (periódico): escanear todo lo que hay
                     └──► faltantes / sobrantes contra el stock del sistema
```

Para qué sirve:
1. Saber cuántos costales sin abrir tiene cada tienda en cada momento.
2. Detectar piezas faltantes al abrir un costal (por proveedor, categoría o empleado).
3. Detectar costales perdidos con el inventario físico.
4. Reportes para administración.

**Volumen estimado:** 13 tiendas × 150 costales al mes ≈ **2.000 costales al mes, unos 24.000 al año**. Para Postgres es muy poco: varios años de datos ocupan menos de 50 MB.

---

## 2. Decisiones de arquitectura

| Tema | Propuesta | Motivo |
|---|---|---|
| Frontend | **Next.js (App Router) + TypeScript + Tailwind** | Es el mismo stack de Asistencia biométrica, así que se reutilizan patrones y conocimiento |
| Base de datos y login | **Supabase** (Postgres + Auth + RLS) | Login real, permisos validados en el servidor, sin pérdida de datos cuando dos personas escriben a la vez |
| Hosting | **Vercel**, en el mismo proyecto `new-control-de-costales` | La conexión con GitHub ya funciona y se conserva la URL actual |
| Escáner | `html5-qrcode` o `@zxing/browser` con la cámara, **más un campo para lectores USB o Bluetooth** | Hoy solo funciona la cámara |
| Correos | Invitaciones y recuperación de contraseña **desde Supabase Auth** (opcional: Resend como SMTP) | Elimina el endpoint `/api/send-temp-password`, que hoy está abierto a cualquiera |
| Google Sheets | Se retira. Opcional: **exportar a Excel o Sheets** desde Reportes | La hoja actual está vacía, así que no hay nada que migrar |

### ¿Usar el proyecto "Agente de Responsabilidades"?
Ese proyecto está **pausado (INACTIVE)** desde marzo. Hoy no se puede ni consultar. Además, está en la región `us-west-2`, mientras que Vercel y Asistencia biométrica están en el este de EE. UU.

**Recomendación:** en vez de vaciarlo y cambiarle el nombre, **borrar ese proyecto y crear uno nuevo llamado `control-de-costales` en `us-east-2`**. Se libera el mismo cupo gratuito y queda más cerca de Vercel. Tampoco hay que cambiarle el nombre después.

> Antes de borrarlo hay que confirmar que no tenga nada que quieras conservar. Si lo necesitas, se puede reactivar desde el panel de Supabase para revisarlo o descargar un respaldo.

---

## 3. Modelo de datos (Postgres)

```
tiendas          (id, codigo 'T01', nombre, direccion, activa, created_at)
perfiles         (id = auth.users.id, nombre, email, rol, tienda_id, activo)
categorias       (id, nombre 'ROPA A', piezas_esperadas, activa)
costales         (id, codigo 'EMP02…' UNIQUE, categoria_id, piezas_esperadas,
                  tienda_id, estado [EN_STOCK|ABIERTO|ANULADO],
                  recibido_por, recibido_at, notas, origen [ESCANEO|EXCEL])
aperturas        (id, costal_id UNIQUE, tienda_id, categoria_id, piezas_esperadas,
                  piezas_contadas, diferencia (calculada), abierto_por, abierto_at)
traslados        (id, costal_id, tienda_origen, tienda_destino, usuario, fecha)
inventarios      (id, tienda_id, iniciado_por, iniciado_at, cerrado_at, estado [ABIERTO|CERRADO])
inventario_items (inventario_id, costal_codigo, escaneado_por, escaneado_at)
eventos          (bitácora automática por triggers: quién hizo qué y cuándo)
```

Puntos clave:
- **`codigo` UNIQUE**: la base de datos impide que un costal se registre dos veces, aunque dos celulares lo escaneen al mismo tiempo.
- **`costal_id` UNIQUE en aperturas**: un costal no se puede abrir dos veces.
- **Las categorías son una tabla editable** y ya no están fijas en el código. Así el admin puede cambiar las piezas esperadas sin tocar la app.
- **Los inventarios se guardan en el servidor**. Hoy quedan solo en el celular que escaneó; con esto los reportes de diferencias salen desde cualquier dispositivo.
- Las acciones importantes (abrir, trasladar, cerrar inventario) se hacen con **funciones SQL (RPC)** que validan todo en una sola operación.

### Permisos (RLS)
| Rol | Alcance |
|---|---|
| ADMIN | Todo, en todas las tiendas. Gestiona admins, tiendas y categorías, y puede resetear |
| ADMIN_2 | Todas las tiendas. Gestiona OPERADOR y SUPERVISOR |
| SUPERVISOR | Su tienda: recibir, abrir, inventario, traslados y reportes de su tienda |
| OPERADOR | Su tienda: recibir, abrir y escanear inventario |

*(Pendiente de definir: qué diferencia quieres entre SUPERVISOR y OPERADOR. Hoy no hay ninguna.)*

---

## 4. Pantallas

1. **Login**, con recuperación de contraseña por correo (Supabase).
2. **Recibir**: elegir categoría, escanear de forma continua, ver la lista de lo escaneado en la sesión y deshacer el último.
3. **Stock**: costales en la tienda, con filtro por categoría y búsqueda por código. Carga desde Excel en una sola operación masiva.
4. **Abrir**: escanear, confirmar la categoría, ingresar las piezas contadas y ver la diferencia. Pide confirmación si la diferencia es grande.
5. **Trasladar** *(nueva)*: escanear y elegir la tienda destino.
6. **Inventario**: iniciar la toma, escanear, ver el avance por categoría y cerrar. El cierre genera el reporte de faltantes y sobrantes.
7. **Reportes**: stock, recibidos, aperturas con diferencias, traslados e inventarios. Exporta a Excel.
8. **Admin**: dashboard por tienda, usuarios, tiendas, categorías y reseteo de tienda.

---

## 5. Sin internet (offline)
Con 150 costales al mes por tienda, el volumen es bajo. Si la tienda tiene WiFi o datos estables, alcanza con un aviso de "sin conexión" y un reintento automático.

Si se cae la conexión con frecuencia, hay que construir una cola local real (IndexedDB) que se sincronice al volver la red. Esto **agrega más o menos 1 fase de trabajo**. *(Decisión pendiente.)*

---

## 6. Fases

| Fase | Contenido |
|---|---|
| **0. Preparación** | Borrar "Agente de Responsabilidades" (con tu confirmación) y crear `control-de-costales` en Supabase. Configurar las variables en Vercel |
| **1. Base** | Nuevo proyecto Next.js en este repo, esquema SQL, RLS, categorías y las 13 tiendas iniciales, login, perfiles y roles |
| **2. Operación** | Recibir, Stock (con Excel), Abrir y Trasladar |
| **3. Inventario y reportes** | Tomas de inventario en el servidor, reportes y exportación a Excel |
| **4. Admin** | Usuarios (invitación por correo), tiendas, categorías y dashboard |
| **5. PWA y pulido** | Íconos, instalación en el celular, offline si se decide, pruebas en celular y despliegue a producción |

Lo que se **elimina** del código actual: `gasService.ts` (Apps Script y modo simulado), `api/send-temp-password.ts`, la contraseña fija del admin, los restos de AI Studio (`importmap`, Gemini) y el Service Worker actual.

---

## 7. Preguntas pendientes antes de empezar
1. ¿Te parece bien **borrar "Agente de Responsabilidades" y crear un proyecto nuevo**, en vez de reutilizarlo?
2. ¿Las tiendas **pierden internet** seguido? Esto define si hace falta el modo offline.
3. ¿Usan **lectores de código USB o Bluetooth**, o solo la cámara del celular?
4. ¿Qué diferencia quieres entre **SUPERVISOR y OPERADOR**?
5. ¿Las **13 tiendas y las 22 categorías** (con sus piezas) siguen igual?
6. ¿Quién **carga el Excel de bodega**: cada tienda o solo el admin?
7. ¿Necesitas **registrar libras o peso** del costal? Tu AppSheet anterior tenía ese campo.
