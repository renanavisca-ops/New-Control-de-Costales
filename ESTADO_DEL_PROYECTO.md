# Estado del Proyecto: Control de Costales

> Revisión del 22/11/2026, hecha sobre la rama `main` (último commit `dd63cb7`).

---

## 1. Resumen

**Control de Costales** es una aplicación web móvil (PWA) para controlar el inventario de costales en varias tiendas. Con ella se registra cada costal recibido escaneando su código de barras, se controla el stock por tienda, se registra la apertura con el conteo real de piezas, se hacen tomas de inventario físico y se generan reportes. Además tiene administración de usuarios, roles y tiendas.

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite 6 |
| Estilos | Tailwind CSS (cargado por CDN) |
| Escáner | `html5-qrcode` (cámara del celular) |
| Excel | `xlsx` (SheetJS) para la carga masiva |
| Backend de datos | **Google Apps Script + Google Sheets** (por `VITE_GAS_URL`) |
| Correo | Función serverless en Vercel con **Resend** |
| Hosting | **Vercel** (despliegue automático desde GitHub) |
| Offline | Service Worker y cola local en `localStorage` |

El build de producción (`npm run build`) **compila sin errores**. El bundle pesa unos 970 KB (304 KB comprimido).

---

## 2. Conexiones y servicios

### 2.1 GitHub ✅ Conectado
- **Repositorio:** `renanavisca-ops/New-Control-de-Costales`
- **Ramas:** solo `main`. No hay pull requests, ni abiertos ni cerrados.
- **Historial:** 50 commits, entre el 07/03/2026 y el 26/08/2026. La mayoría se llaman "Update App.tsx" o "Update gasService.ts", es decir, se hicieron desde el editor web de GitHub.
- **Últimos movimientos:** se agregó un "dashboard launcher" y después se revirtió (`8755514` → `0abd206` → `de2d8b0` → `fac4634` → `dd63cb7`). El código quedó como estaba antes.

### 2.2 Vercel ✅ Conectado
- **Equipo:** "Efren's projects"
- **Proyecto:** `new-control-de-costales` (framework Vite, Node 24.x)
- **URL de producción:** https://new-control-de-costales.vercel.app (responde 200)
- **Otros dominios:** `new-control-de-costales-efrens-projects-f768c4c7.vercel.app` y `new-control-de-costales-git-main-…vercel.app`
- **Último despliegue:** `READY` en producción, desde el commit `dd63cb7` de `main`. Cada push a `main` despliega automáticamente.
- **Protección:** Vercel Authentication (SSO) está activa en las previews. El dominio de producción es público.
- **Errores en runtime (últimos 7 días):** ninguno.
- **Función serverless:** `api/send-temp-password.ts`, que envía las contraseñas temporales por correo con Resend.
- **Variables de entorno:** ⚠️ **No pude leerlas** porque la conexión de Vercel no tiene permiso para listarlas (error 403). Hay que revisar a mano en *Vercel → Settings → Environment Variables* que existan estas:
  - `VITE_GAS_URL`: URL del Apps Script. **Si falta, la app funciona en "modo simulado"** y guarda todo solo en el navegador de cada dispositivo.
  - `VITE_ROOT_ADMIN_EMAIL` y `VITE_ROOT_ADMIN_INITIAL_PASSWORD`
  - `RESEND_API_KEY` y `RESEND_FROM_EMAIL`: sin estas no se envían los correos.

### 2.3 Google Apps Script y Google Sheets ⚠️ Es el backend real, pero su código no está en el repo
- El frontend manda todas las operaciones por `POST` a `VITE_GAS_URL` con `{ action, ...datos }`.
- **El código del Apps Script no está en el repositorio.** No pude verificar qué acciones implementa ni cómo valida los permisos.
- Hojas que se esperan según el README: `Costales`, `Aperturas`, `Usuarios`, `Tiendas` y `LogEventos`. El frontend también usa conteos de inventario, que no aparecen en el README.
- Acciones que llama el frontend: `authUsuario`, `registrarUsuario`, `createManagedUser`, `forgotPassword`, `changePassword`, `updateUsuario`, `deleteUsuario`, `listUsuarios`, `resetStoreData`, `checkDuplicado`, `addCostal`, `abrirCostal`, `trasladarCostal`, `listExistencias`, `reportes`, `getDetailedReport`, `listTiendas`, `addTienda`, `updateTienda`, `deleteTienda`, `saveInventoryCount` y `listInventoryCounts`.

### 2.4 Resend (correo) ⚠️ Depende de las variables en Vercel
- Se usa para enviar la contraseña temporal cuando se crea un usuario o se recupera el acceso.

### 2.5 Supabase ❌ No se usa en este proyecto
- En el código **no hay ninguna referencia a Supabase**.
- La cuenta conectada tiene 3 proyectos y ninguno es de esta app: "Agente de Responsabilidades" (inactivo), "mobile-chat-mvp" y "Asistencia-biometrica".

### 2.6 Google Gemini ❌ Restos de plantilla
- `vite.config.ts` define `GEMINI_API_KEY`, pero no se usa en ninguna parte. También el `importmap` de `index.html` y `metadata.json` vienen de la plantilla de Google AI Studio.

---

## 3. Funciones de la app

### 3.1 Acceso y cuentas
| Función | Estado |
|---|---|
| Inicio de sesión con correo y contraseña | ✅ |
| "Olvidé mi contraseña": genera una contraseña temporal y la envía por correo | ✅ (requiere Resend) |
| Cambio obligatorio de contraseña en el primer ingreso o con contraseña temporal | ✅ |
| Sesión guardada en el dispositivo (sigue activa al reabrir la app) | ✅ |
| Registro libre | 🚫 Deshabilitado a propósito: solo el admin crea usuarios |

### 3.2 Roles
| Rol | Qué puede hacer |
|---|---|
| **ADMIN** (administrador principal, un solo correo fijo) | Todo. Crea ADMIN_2, borra tiendas y resetea tiendas |
| **ADMIN_2** | Panel Admin. Crea y edita OPERADOR y SUPERVISOR. No puede tocar administradores |
| **SUPERVISOR** | Recibir, Stock, Abrir, Inventario y Reportes de su tienda |
| **OPERADOR** | Lo mismo que el supervisor (hoy no hay diferencia entre los dos en la UI) |

### 3.3 Pantallas
1. **📥 Recibir (Recepción)**
   - Se elige la categoría (22 categorías con piezas esperadas, por ejemplo ROPA A = 100 y ZAPATO A = 15, más SALDO).
   - Se escanea con la cámara. Solo acepta códigos `EMP02` seguidos de dígitos y corrige errores típicos de lectura (O por 0, etc.).
   - Evita duplicados dentro de la sesión y contra el servidor.
   - Sin conexión, guarda la acción en una cola local.
2. **📦 Stock (Existencias)**
   - Lista los costales de la tienda del usuario que todavía no se abrieron.
   - **Carga masiva desde Excel o CSV** (columnas `codigo_barras`, `categoria`, `piezas_asignadas`, `tienda` y `notas`) con resumen de importados, duplicados, inválidos y fallidos.
3. **✂️ Abrir (Apertura y conteo)**
   - Se escanea el costal, se valida que esté en stock y se confirma la categoría.
   - Se ingresa el conteo real y se calcula la diferencia contra las piezas esperadas. Si la diferencia pasa de ±20, pide confirmación.
   - Funciona sin conexión (va a la cola).
4. **📷 Inventario (Toma física)**
   - Se escanea cada costal físico y se compara contra el stock de la tienda.
   - Muestra el avance por categoría ("contados / esperados").
   - La toma se puede reiniciar y la lista de stock se puede actualizar.
5. **⚙️ Admin (Métricas)**, solo para ADMIN y ADMIN_2
   - "Tu rendimiento": diferencia promedio de piezas en tus aperturas.
   - Resumen general y por tienda: recibidos, abiertos y en stock.
   - Usuarios: crear (con envío de correo), editar nombre, tienda y rol, y eliminar.
   - Tiendas: crear, editar nombre y dirección, y eliminar (solo ADMIN, nunca T01, y sin usuarios ni movimientos).
   - **Resetear tienda** (solo ADMIN): borra el stock, los recibidos y las aperturas de esa tienda.
6. **📋 Reportes**
   - Filtros por fechas y tienda (los admin ven todas las tiendas, los demás solo la suya).
   - Tipos: **STOCK**, **RECIBIDOS**, **ABIERTOS** y **DIFERENCIAS** (inventario físico contra stock).
   - Resultados agrupados por categoría, con totales de piezas y diferencias.

### 3.4 PWA y modo offline
- Se puede instalar en el celular con "Añadir a pantalla de inicio".
- Indicador de "En línea" / "Offline" en el encabezado.
- Cola de acciones offline guardada en `localStorage` (pero ver el problema #1 más abajo).

---

## 4. Problemas y pendientes encontrados

### 🔴 Críticos
1. **La cola offline nunca se sincroniza.** Las recepciones y aperturas hechas sin conexión se guardan en `cc_offline_queue`, pero no hay código que las envíe al servidor cuando vuelve la conexión. **Esos datos nunca llegan a Google Sheets.**
2. **Cualquiera puede usar `/api/send-temp-password`.** No pide autenticación, así que cualquier persona puede mandar correos con el remitente de la app a cualquier dirección (riesgo de spam o phishing con tu cuenta de Resend).
3. **Credenciales a la vista.** El correo del admin principal y su contraseña inicial están escritos en `src/services/gasService.ts` y en `.env.example`, que es público en el repo. Si esa contraseña nunca se cambió, cualquiera puede entrar como ADMIN.
4. **Los permisos se validan solo en el navegador.** El frontend envía `actorEmail` y la app confía en él. Si el Apps Script no vuelve a validar los permisos, cualquiera puede hacerse pasar por admin llamando directo a la URL del script. No lo pude verificar porque ese código no está en el repo.
5. **Riesgo de pantalla en blanco al actualizar la app.** El Service Worker guarda `index.html` con estrategia *cache-first* y nunca cambia de versión (`costalcontrol-v1`). Quien tenga la PWA instalada puede quedarse con una versión vieja que apunta a archivos que ya no existen después de un nuevo despliegue.

### 🟠 Importantes
6. **El reporte de DIFERENCIAS solo funciona en el mismo dispositivo.** La toma de inventario se guarda solo en el `localStorage` del celular que escaneó. Ya existen `saveInventoryCount` y `listInventoryCounts` en el servicio, pero **no se usan**.
7. **El traslado entre tiendas no tiene pantalla.** `trasladarCostal` existe en el servicio, pero no hay ningún botón para usarlo.
8. **Los lectores de código USB o Bluetooth no funcionan.** La entrada manual está desactivada en todas las pantallas (`allowManualEntry={false}`), así que no hay ningún campo donde "escriba" un lector físico. Solo funciona la cámara.
9. **La carga desde Excel no valida el formato `EMP02…`** y hace dos peticiones por fila, una tras otra, lo que es muy lento con archivos grandes.
10. **El ID de una tienda nueva puede repetirse.** Se calcula como `'T' + (cantidad de tiendas + 1)`, así que después de borrar una tienda el ID siguiente puede coincidir con uno existente.
11. **Las contraseñas se guardan en texto plano**, al menos en el modo simulado. Hay que revisar cómo las guarda el Apps Script.

### 🟡 Menores y limpieza
12. El código del backend (Apps Script) no está versionado en el repositorio.
13. El README está desactualizado: le faltan acciones y la hoja de conteos de inventario.
14. `manifest.json` no tiene íconos, por lo que la instalación como PWA queda incompleta.
15. Tailwind se carga desde un CDN (no se recomienda para producción) y quedan restos de AI Studio (`importmap`, `GEMINI_API_KEY`).
16. `App.tsx` tiene casi 1.800 líneas con todas las pantallas juntas. Conviene separarlo en componentes.
17. OPERADOR y SUPERVISOR tienen exactamente los mismos permisos en la interfaz.
18. El tipo `TRANSFER_COSTAL` / `SAVE_INVENTORY_COUNT` está declarado para la cola offline pero no se usa.

---

## 5. Próximos pasos sugeridos (por prioridad)
1. Implementar la **sincronización de la cola offline**.
2. Proteger `/api/send-temp-password`, cambiar la contraseña del admin principal y sacarla del repo.
3. Subir el código del Apps Script al repo (por ejemplo en `/backend`) y confirmar que valida los permisos en el servidor.
4. Arreglar el Service Worker (network-first para `index.html` y versionar el caché).
5. Guardar las tomas de inventario en el servidor con `saveInventoryCount`.
6. Agregar la pantalla de **traslado entre tiendas** y la opción de lector físico o entrada manual.
7. Verificar en Vercel las variables `VITE_GAS_URL` y `RESEND_*`.
