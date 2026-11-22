# Plan: Control de Costales v2 (Supabase + Vercel)

> Versión 2 del plan, 22/11/2026. Incluye las respuestas del dueño, las capturas de la app actual y la foto de la etiqueta.

---

## 0. Estado actual

| Elemento | Estado |
|---|---|
| Supabase `control-de-costales` | ✅ **Creado** en us-east-2 (ref `zqewhthgmkifspvnlith`). Está vacío |
| Supabase "Agente de Responsabilidades" | ⏳ **Hay que borrarlo a mano** desde el panel de Supabase (Project Settings → General → Delete project). La herramienta que tengo no puede borrar proyectos |
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

**Recomendación:** empezar con **A**. Es lo que además permite saber qué costales faltaron en cada despacho. Si en el futuro pueden cambiar la etiqueta, sumar **C**. **B** sería un respaldo opcional para costales que lleguen sin despacho cargado.

> **Pregunta:** ¿la bodega tiene un sistema del que se pueda exportar el despacho a Excel? Tu AppSheet anterior tenía columnas de un ERP (CODREF, NUMREF, BODEGA, PIEZAS…). ¿Quién imprime las etiquetas y se puede cambiar el formato?

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

> **Pregunta:** ¿el saldo de varias categorías va mezclado en un mismo saco, o un saco por categoría?

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

## 8. Pensado para comercializar (multiempresa)

Como existe la posibilidad de venderla, **todas las tablas llevan `empresa_id` desde el inicio**. Cada empresa ve solo sus datos, protegido por RLS en la base de datos. Hoy habrá una sola empresa, pero no habrá que rehacer nada si después se suman clientes.

---

## 9. Modelo de datos

```
empresas            (id, nombre, activa)
tiendas             (id, empresa_id, codigo, nombre, direccion, es_bodega_central, activa)
perfiles            (id=auth.users, empresa_id, nombre, email, rol, activo)
perfil_tiendas      (perfil_id, tienda_id)              -- un supervisor puede tener varias
categorias          (id, empresa_id, nombre, piezas_esperadas, libras_esperadas?, activa)

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
| **0. Preparación** | ✅ Proyecto Supabase creado. ⏳ Borrar "Agente de Responsabilidades". Configurar variables en Vercel |
| **1. Base** | Next.js en este repo, esquema SQL con RLS multiempresa, login, roles, tiendas, usuarios y categorías |
| **2. Tienda (núcleo)** | Escáner con los 3 métodos, inventario inicial, recibir, abrir y stock |
| **3. Offline** | Caché local, cola de sincronización automática y manejo de conflictos |
| **4. Bodega** | Despachos (Excel y escaneo), faltantes y sobrantes, traslados |
| **5. Retornos de saldo** | Código SAL, envío y recepción en bodega |
| **6. Inventarios y reportes** | Completo, selectivo y ajustes. Dashboard y exportación a Excel |
| **7. PWA y piloto** | Instalación en celulares, prueba en 1 tienda y luego despliegue al resto |

> El orden se puede cambiar. Por ejemplo, el offline podría ir junto con la fase 2 si quieren probar en tienda cuanto antes.

---

## 12. Preguntas pendientes
1. ¿La bodega puede **exportar el despacho a Excel** desde su sistema? ¿Quién imprime las etiquetas y se puede cambiar el formato (para un QR)?
2. El saldo de retorno, ¿va **mezclado o separado por categoría**?
3. ¿Las tiendas tienen **balanza** para comparar libras al recibir, o las libras se comparan solo en la bodega?
4. ¿Te parece bien la **tabla de permisos** de la sección 4, y agregar el rol BODEGA?
5. ¿Un supervisor cubre **varias tiendas**?
6. Tolerancia de diferencia: ¿desde cuántas piezas o libras de diferencia se marca **alerta**?
