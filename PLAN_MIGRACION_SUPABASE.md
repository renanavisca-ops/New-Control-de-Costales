# Plan: Control de Costales v2 (Supabase + Vercel)

> Versión 2 del plan, 22/11/2026. Incluye las respuestas del dueño, las capturas de la app actual y la foto de la etiqueta.

---

## 0. Estado actual

| Elemento | Estado |
|---|---|
| Supabase `control-de-costales` | ✅ **Creado** en us-east-2 (ref `zqewhthgmkifspvnlith`). Está vacío |
| Supabase "Agente de Responsabilidades" | ✅ Borrado por el dueño |
| Plan de Supabase | ⚠️ La organización está en el plan **Pro**. Cada proyecto activo consume capacidad de cómputo (unos $10 al mes cada uno; el plan incluye $10 de crédito). Ver la sección 13 |
| Vercel `new-control-de-costales` | Se reutiliza, con la misma URL |
| App actual | Funcionó **solo en modo simulado**: los datos de las capturas viven únicamente en el navegador donde se probó. No hay datos reales que migrar |

---

## 1. Cómo funciona el negocio (lo que la app tiene que controlar)

```
┌───────────────────────┐   DESPACHO (lista de costales)   ┌──────────────────────┐
│  BODEGA CENTRAL        │ ───────────────────────────────► │  BODEGA DE LA TIENDA  │
│  (centro de           │                                   │                      │
│   clasificación)      │ ◄─────────────────────────────── │  RECIBIR (escanear)   │
│                       │   RETORNO DE SALDO (sin código)   │  ABRIR + contar piezas │
└───────────────────────┘                                   │  INVENTARIOS          │
                                                            └──────────────────────┘
```

**Vida de un costal (con código de barras único):**

```
EN_BODEGA ──despacho──► EN_TRÁNSITO ──escaneo en tienda──► EN_TIENDA ──apertura──► ABIERTO
                                  │                              │
                                  └─ si nunca llega: FALTANTE    └─ traslado a otra tienda
```

**Lo que la app tiene que responder en todo momento:**
1. ¿Qué costales mandó la bodega y cuáles llegaron? (faltantes y sobrantes por despacho)
2. ¿Cuántos costales sin abrir tiene cada tienda? Sirve para saber el stock que queda cuando llega un despacho nuevo.
3. ¿Quién abrió cada costal, cuándo, y cuántas piezas traía de verdad contra lo que decía la etiqueta?
4. ¿Coinciden las libras?
5. ¿Cuánto saldo devolvió cada tienda y lo recibió la bodega completo?

**Volumen:** unos 150 costales al mes por tienda. Es poco para Postgres.

---

## 2. La etiqueta del costal: ¿se pueden leer piezas y libras al escanear?

Esto dice la etiqueta de la foto:
```
Piezas 80 | Libras 38.30 | Conf … | ROPA B | Código BA | 21/09/2026 | EMP02216904 | 02
```

**El código de barras solo trae el número `EMP02216904`.** Las piezas, las libras y la categoría están impresas como texto, pero no van dentro del código. Hay 3 maneras de obtenerlas:

| Opción | Cómo funciona | Dificultad | Precisión |
|---|---|---|---|
| **A. Despacho digital desde bodega** ⭐ | La bodega carga en la app el despacho (Excel exportado de su sistema o escaneando en bodega) con código, categoría, piezas y libras. Al escanear en la tienda, **la app ya conoce los datos** y los muestra al instante, también sin internet | Baja | 100% |
| **B. Lector de etiqueta con la cámara (OCR)** | Al escanear, la app toma una foto de la etiqueta y lee "Piezas 80" y "Libras 38.30". El usuario confirma | Media | ~85–95%; falla con etiquetas arrugadas o manchadas como la de la foto |
| **C. Cambiar la etiqueta a código QR** | La impresora de bodega imprime un QR con `EMP02216904|ROPA B|80|38.30`. Un solo escaneo trae todo | Baja si controlan la impresora | 100% |

**Decisión: opción A.** La etiqueta no se puede cambiar, pero la bodega puede generar el Excel del traslado.

### Formato real del Excel de traslado (ejemplo: `traslado_de_ropa_17_11_2026_tienda_5.xls`)
```
PACA TU AMIGO, S.A.
TIPO DOCUMENTO: T0111 TRASLADO CENTRO DIST-TIENDA 5 EMPQ
NUMERO:        359
REFERENCIA:  APERT 27 NOV MR 164
FECHA 17/11/2026
BODEGA DE ENTRADA: B105 SALIDA: B090
COSTAL #     | PIEZAS | PRECIO | PESO
CLACIFICACION B
EMP02220372  | 15     | 45     | 11.7
…            (subtotal por clasificación)
CLACIFICACION C
EMP02218814  | 20     | 100    | 23.4
TOTAL 210 piezas | 750 | 199.2 lb  —  Total Costales: 13
```

La app va a **leer este reporte tal como sale del sistema, sin que nadie lo modifique**:
- De la cabecera toma: **número de traslado**, referencia, fecha y **bodega de entrada** (B105). Esta última se asocia a la tienda: cada tienda tendrá su código de bodega.
- De cada fila `EMP02…` toma: código, **piezas, precio y peso**, y la **categoría** según la sección donde aparece. El dueño va a cambiar el reporte para que cada sección diga la categoría completa (por ejemplo "ROPA B") en lugar de solo "CLACIFICACION B". El lector va a aceptar los dos formatos.
- Si el Excel trae una **categoría nueva**, la app la crea en el centro y queda disponible para todas las tiendas.
- Valida contra los totales del reporte (13 costales y 210 piezas) para asegurarse de que se leyó completo.

**Flujo:**
1. La bodega sube el Excel y el traslado queda **EN TRÁNSITO**, con sus 13 costales.
2. En la tienda se escanea cada costal y se marca ✔ como llegado. Las piezas y el peso ya vienen del Excel.
3. Al cerrar la recepción, la app muestra los **costales que no llegaron** (posible pérdida en el camino) y los **que llegaron sin estar en el traslado**.
4. Al abrir el costal se cuentan las piezas, y la **diferencia contra el Excel** queda registrada.
5. Como el Excel trae **precio**, los faltantes se pueden mostrar también **en quetzales**.

---

## 3. El retorno de saldo (sin código)

Hoy el saldo vuelve a bodega sin identificación. Propuesta: **que la app le asigne un código al saldo**.

1. En la tienda, el operador crea un **"Retorno de saldo"**: categoría o categorías, piezas, libras y una foto opcional.
2. La app genera un código, por ejemplo **`SAL-T03-0042`**, que se puede:
   - **escribir a mano en grande** sobre el saco (no hace falta impresora), o
   - **imprimir como QR** si en algún momento hay una impresora de etiquetas.
3. El retorno queda **EN_TRÁNSITO** hacia la bodega.
4. En la bodega se escanea o se busca el código, se pesa y se cuenta, y se confirma. Si hay diferencia de libras o piezas, queda registrada.

Así el saldo tiene el mismo control que un costal: quién lo mandó, cuánto y si llegó completo.

**Respuesta del dueño:** el saldo va **mezclado**; un saco puede llevar A, B, C, etc. Por eso cada retorno tiene **varias líneas** (clasificación + piezas). Como las tiendas no tienen balanza, **lo principal son las piezas**; el peso lo registra la bodega al recibirlo.

---

## 4. Roles y permisos

| Acción | OPERADOR | SUPERVISOR | BODEGA | ADMIN |
|---|:-:|:-:|:-:|:-:|
| Recibir despacho (escanear) | ✅ | ✅ | – | ✅ |
| Abrir costal y contar piezas | ✅ | ✅ | – | ✅ |
| Crear retorno de saldo | ✅ | ✅ | – | ✅ |
| Ver stock de su tienda | ✅ | ✅ | – | ✅ |
| **Inventario completo de tienda** | – | ✅ | – | ✅ |
| **Inventario selectivo** (por categoría o costales al azar) | – | ✅ | – | ✅ |
| Aprobar ajustes (faltantes y sobrantes) | – | ✅ | – | ✅ |
| Trasladar entre tiendas | – | ✅ | – | ✅ |
| Reportes | Solo su tienda, básicos | Sus tiendas asignadas | Despachos y retornos | Todo |
| Crear despachos y recibir retornos | – | – | ✅ | ✅ |
| Tiendas, usuarios, categorías | – | – | – | ✅ |

- **SUPERVISOR** puede tener **varias tiendas asignadas**.
- Se agrega el rol **BODEGA** para el centro de clasificación.
- *Propuesta para revisar: ajusta las ✅ que no te cuadren.*

---

## 5. Inventario inicial por tienda

Cuando una tienda empieza a usar el sistema, ya tiene costales que nunca pasaron por un despacho digital. Para eso existe el **"Inventario inicial"**:
- Se abre una sola vez por tienda (o las veces que el admin lo reactive).
- Se escanean todos los costales que hay. Para cada uno se elige la categoría y, de forma opcional, piezas y libras (si no se escriben, se toman las de la categoría).
- Al cerrarlo, esos costales quedan **EN_TIENDA** con origen "INVENTARIO_INICIAL".

---

## 6. Sin internet: lectura offline con sincronización automática

Es un requisito, porque en la bodega de la tienda no llega bien la señal.

**Cómo funcionará:**
1. **Al entrar con conexión**, el celular descarga y guarda localmente (IndexedDB): el stock de su tienda, los despachos pendientes de recibir, las categorías y su usuario.
2. **Sin conexión**, la app sigue funcionando: escanea, valida contra los datos locales (si el costal está en el despacho, si ya fue abierto) y guarda cada acción en una **cola local**.
3. **Apenas vuelve la señal**, la cola se envía sola, en orden. También se reintenta al abrir la app y cada pocos segundos.
4. Cada acción lleva un **ID único generado en el celular**, para que reenviarla nunca la duplique.
5. **Conflictos**, por ejemplo cuando dos celulares abren el mismo costal sin internet: el servidor acepta el primero y marca el segundo como conflicto para que lo revise el supervisor. Nunca se pierde información.
6. Siempre se ve en pantalla un indicador del estado: 🟢 sincronizado / 🟠 3 pendientes / 🔴 sin conexión.

Tecnología: PWA con Service Worker (Serwist) e IndexedDB (Dexie).

---

## 7. Escáner: los 3 métodos

Lo pediste así para poder comercializar la app más adelante.

| Método | Cómo |
|---|---|
| **Cámara del celular** | Por defecto, con lectura continua y vibración al leer |
| **Lector USB** | Se comporta como un teclado: la app tiene un campo siempre listo que recibe el código y lo procesa solo con el Enter del lector |
| **Lector Bluetooth** | Igual que el USB, en modo teclado (HID) |

Siempre se valida el formato (`EMP02` seguido de dígitos para costales y `SAL-` para saldos) y se corrigen errores típicos de lectura.

---

## 8. Centro de distribución y empresas (multiempresa)

Hay dos tipos de organización:

```
                 ┌──────────────────────────────┐
                 │ CENTRO DE DISTRIBUCIÓN        │  (bodega central)
                 │  · crea las bodegas           │
                 │  · define las categorías      │
                 │  · sube los traslados (Excel) │
                 └──────────┬───────────────────┘
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
   EMPRESA A           EMPRESA B           EMPRESA C        (clientes del centro)
   ├ Bodega B105 (Tienda 5)
   ├ Bodega B106 (Tienda 6)
   └ …
```

- **El centro de distribución crea las bodegas** (código como B105, nombre y empresa a la que pertenece). El código coincide con la "BODEGA DE ENTRADA" del Excel, así que al subir un traslado la app sabe sola a qué tienda y a qué empresa va.
- **Un centro puede abastecer a varias empresas.** Cada empresa ve solo sus tiendas, su stock y sus reportes. El centro ve el estado de todo lo que despachó, a todas las empresas.
- **Las categorías son del centro.** Si se agrega una categoría nueva en el centro (o aparece en un Excel), queda disponible al instante en todas las tiendas de todas las empresas que abastece.
- Todo está protegido por RLS en la base de datos. Hoy existirán un centro ("Paca Tu Amigo") y una empresa, pero el sistema queda listo para comercializarse sin rehacer nada.

---

## 9. Modelo de datos

```
centros             (id, nombre)                          -- centro de distribución
empresas            (id, nombre, activa)
centro_empresas     (centro_id, empresa_id)               -- un centro abastece a varias empresas
bodegas             (id, centro_id, empresa_id, codigo 'B105', nombre 'Tienda 5', direccion,
                     tipo [CENTRAL|TIENDA], activa)       -- las crea el centro
perfiles            (id=auth.users, centro_id?, empresa_id?, nombre, email, rol, activo)
perfil_bodegas      (perfil_id, bodega_id)                -- un supervisor puede tener varias
categorias          (id, centro_id, nombre, activa)       -- del centro, compartidas con sus empresas

despachos           (id, empresa_id, numero, bodega_id, tienda_destino_id, estado
                     [BORRADOR|ENVIADO|RECIBIDO_PARCIAL|RECIBIDO], creado_por, enviado_at)
costales            (id, empresa_id, codigo UNIQUE, categoria_id, piezas_etiqueta, libras_etiqueta,
                     fecha_etiqueta, despacho_id?, tienda_id, estado
                     [EN_BODEGA|EN_TRANSITO|EN_TIENDA|ABIERTO|FALTANTE|ANULADO],
                     origen [DESPACHO|INVENTARIO_INICIAL|SOBRANTE], recibido_por, recibido_at,
                     libras_recibidas?)
aperturas           (id, costal_id UNIQUE, tienda_id, piezas_esperadas, piezas_contadas,
                     diferencia, abierto_por, abierto_at, client_op_id UNIQUE)
traslados           (id, costal_id, tienda_origen, tienda_destino, usuario, fecha)
retornos_saldo      (id, empresa_id, codigo 'SAL-T03-0042', tienda_id, estado
                     [EN_TRANSITO|RECIBIDO|CON_DIFERENCIA], piezas_enviadas, libras_enviadas,
                     piezas_recibidas, libras_recibidas, foto_url, creado_por, recibido_por)
retorno_items       (retorno_id, categoria_id, piezas, libras)
inventarios         (id, tienda_id, tipo [INICIAL|COMPLETO|SELECTIVO], filtro, estado, iniciado_por,
                     cerrado_at)
inventario_items    (inventario_id, codigo, escaneado_por, escaneado_at)
ajustes             (id, tipo [FALTANTE|SOBRANTE|CONFLICTO], costal_id, motivo, aprobado_por)
eventos             (bitácora automática: quién, qué, cuándo, desde qué dispositivo)
```

---

## 10. Pantallas

**Tienda (operador y supervisor):**
1. **Inicio**: estado de sincronización, despachos por recibir y stock por categoría.
2. **Recibir despacho**: elegir el despacho y escanear. Cada costal se marca ✔ y muestra categoría, piezas y libras. Al final aparecen los faltantes y sobrantes.
3. **Abrir costal**: escanear, ver las piezas esperadas, ingresar las contadas y ver la diferencia (y las libras si se pesan).
4. **Retorno de saldo**: crear y ver el código para marcar el saco.
5. **Stock**: costales sin abrir, por categoría.
6. **Inventario** (supervisor): completo, selectivo o inicial.

**Bodega:**
7. **Despachos**: crear (Excel o escaneo), enviar y ver el estado de recepción.
8. **Retornos**: recibir el saldo, pesar o contar y confirmar.

**Admin:**
9. **Dashboard**: por tienda, recibidos, abiertos, stock, diferencias de piezas por operador y por categoría, saldos.
10. **Configuración**: tiendas, usuarios (invitación por correo), categorías (crear y editar piezas).
11. **Reportes**: con exportación a Excel.

---

## 11. Fases

| Fase | Contenido |
|---|---|
| **0. Preparación** | ✅ Proyecto Supabase creado. ✅ "Agente de Responsabilidades" borrado |
| **1. Base** | ✅ Next.js en este repo, esquema SQL con RLS (centro → empresas → bodegas), login, cambio de contraseña temporal, roles, empresas, bodegas, usuarios y categorías. Falta crear el primer administrador |
| **2. Tienda (núcleo)** | Escáner con los 3 métodos, inventario inicial, recibir, abrir y stock |
| **3. Offline** | Caché local, cola de sincronización automática y manejo de conflictos |
| **4. Bodega** | Despachos (Excel y escaneo), faltantes y sobrantes, traslados |
| **5. Retornos de saldo** | Código SAL, envío y recepción en bodega |
| **6. Inventarios y reportes** | Completo, selectivo y ajustes. Dashboard y exportación a Excel |
| **7. PWA y piloto** | Instalación en celulares, prueba en 1 tienda y luego despliegue al resto |

> El orden se puede cambiar. Por ejemplo, el offline podría ir junto con la fase 2 si quieren probar en tienda cuanto antes.

---

## 12. Decisiones tomadas
- Despachos: **Excel del sistema de bodega**, subido tal cual. La tienda escanea para confirmar la llegada.
- Etiqueta: no se cambia. El escaneo solo lee el código; piezas y peso salen del Excel.
- Saldo: mezclado; un retorno tiene varias líneas por clasificación.
- Tiendas **sin balanza**: las piezas mandan; el peso es solo informativo (viene del Excel).
- Un supervisor cubre **varias tiendas**.
- **Empaque contra producción:** "empaque" son las piezas que la bodega puso en el costal (según el Excel) y "producción" son las piezas que la tienda cuenta al abrirlo. La diferencia es el indicador principal de la app.
  - **Alerta desde 5 piezas** de diferencia por costal.
  - **Todas** las diferencias, aunque sean de 1 pieza, se ven en el reporte "Empaque vs. Producción", agrupado por categoría, traslado, tienda, operador y fecha, en piezas y en quetzales.
- Supabase: **proyecto separado** `control-de-costales`.
- El **centro de distribución crea las bodegas** y puede abastecer a **varias empresas**.
- Permisos: se implementan los de la sección 4 como punto de partida, y el admin podrá ajustarlos más adelante.

## 13. Costo de Supabase
La organización está en el plan **Pro** ($25 al mes), que incluye $10 de crédito de cómputo, o sea, alrededor de 1 proyecto pequeño. Cada proyecto activo adicional cuesta unos **$10 al mes**. Un proyecto pausado no consumía cómputo, así que borrar "Agente de Responsabilidades" no redujo el costo, y crear `control-de-costales` lo sube unos $10 al mes.

**Decisión del dueño:** se mantiene como **proyecto separado**.

## 14. Preguntas pendientes
1. Cuando esté listo, enviar un **Excel de ejemplo con el reporte nuevo** (con las categorías completas) para ajustar el lector.
2. ✅ Resuelto: **solo los administradores** (ADMIN_CENTRO y ADMIN_EMPRESA) ven las diferencias de empaque contra producción.
