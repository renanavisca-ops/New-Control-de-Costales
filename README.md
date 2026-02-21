
# CostalControl Setup Instructions

Para habilitar el backend de esta aplicación, sigue estos pasos:

### 1. Preparar Google Sheets
1. Crea una nueva hoja de cálculo llamada `CostalControlDB`.
2. Crea las siguientes hojas con sus encabezados:
   - **Costales**: `codigo_barras`, `categoria`, `tienda`, `fecha_recepcion`, `usuario_recibe`, `saldo_num_costal`, `saldo_piezas`, `piezas_asignadas`, `estado`, `notas`
   - **Aperturas**: `id_apertura`, `codigo_barras`, `categoria`, `tienda`, `usuario_apertura`, `fecha_apertura`, `piezas_asignadas`, `piezas_contadas`, `diferencia`
   - **Usuarios**: `email`, `nombre`, `tienda`, `rol`
   - **Tiendas**: `id_tienda`, `nombre`
   - **LogEventos**: `id_evento`, `fecha_hora`, `tipo_evento`, `codigo_barras`, `usuario`, `tienda_origen`, `tienda_destino`, `payload_json`

### 2. Apps Script (Backend)
1. Ve a **Extensiones > Apps Script**.
2. Copia el contenido de un archivo backend de Apps Script que maneje las acciones:
   - `authUsuario`: Busca el email en la hoja **Usuarios**.
   - `registrarUsuario`: Agrega una nueva fila a la hoja **Usuarios**.
   - `listTiendas`: Retorna todas las filas de la hoja **Tiendas**.
   - `addTienda`: Agrega una nueva fila a la hoja **Tiendas**.
   - `addCostal`, `abrirCostal`, `trasladarCostal`: CRUD de costales.
3. Haz clic en **Implementar > Nueva implementación**.
4. Selecciona **Aplicación web**.
5. Configura:
   - **Ejecutar como**: Yo
   - **Quién tiene acceso**: Cualquier persona
6. Copia la URL de la aplicación web y pégala en `services/gasService.ts`.

### 3. PWA
1. Ejecuta la aplicación React.
2. En tu celular (iOS/Android), usa "Añadir a pantalla de inicio" desde el navegador para instalarla como PWA nativa.
