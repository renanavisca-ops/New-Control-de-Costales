import { B, Figura, Lista, Nota, Par, Pasos, Seccion, Sub, Tabla } from './piezas';

export const SECCIONES_TIENDA = [
  ['celular', 'El celular de la tienda'],
  ['activar', 'Activar el celular (una sola vez)'],
  ['entrar', 'Entrar con tu código y PIN'],
  ['recibir', 'Recibir costales'],
  ['produccion', 'Producción: abrir y terminar un costal'],
  ['inicial', 'Inventario inicial desde el celular'],
  ['inventario', 'Inventario (cuando el supervisor lo abre)'],
  ['auditoria', 'Auditoría con código temporal'],
  ['venta-local', 'Bodega de ventas locales (B037)'],
  ['retorno', 'Retorno de saldo'],
  ['stock', 'Stock de la tienda'],
  ['sin-internet', 'Sin internet'],
  ['problemas', 'Si algo no funciona'],
] as const;

export function ManualTienda() {
  return (
    <>
      <Seccion id="celular" titulo="1. El celular de la tienda">
        <p>
          Cada tienda tiene un celular Android fijo con la app <B>Costales Tienda</B>. En él se recibe cada costal que llega del centro de
          distribución, se registra quién abre cada costal y cuántas piezas salieron, y se hacen los inventarios.
        </p>
        <p>
          Varias personas pueden usar el mismo celular a la vez: cada una entra con <B>su código y su PIN</B>, así el sistema sabe quién hizo
          cada cosa. El celular se cierra solo tras 3 minutos sin uso.
        </p>
        <Figura img="t-inicio" pie="Pantalla principal del celular de la tienda" movil />
        <Tabla
          cols={['Botón', 'Para qué sirve']}
          filas={[
            ['Producción', 'Abrir un costal (iniciar) y, al terminar, anotar las piezas que salieron (finalizar).'],
            ['Recibir', 'Escanear cada costal que llega del centro de distribución.'],
            ['Inventario inicial', 'Registrar costales que ya estaban en la tienda antes de usar el sistema.'],
            ['Stock', 'Ver cuántos costales sin abrir hay de cada producto.'],
            ['Retorno de saldo', 'Generar el código del saco de saldo que vuelve al centro.'],
            ['Inventario', 'Aparece solo cuando el supervisor abre un inventario.'],
          ]}
        />
      </Seccion>

      <Seccion id="activar" titulo="2. Activar el celular (una sola vez)">
        <p>Esto lo hace el encargado la primera vez que se instala la app, o si el celular se cambia.</p>
        <Pasos>
          <li>Instala la app <B>Costales Tienda</B> (archivo APK que entrega el administrador) y ábrela.</li>
          <li>Pide al administrador el <B>código de activación de 8 caracteres</B>. Él lo genera en la sección Celulares; vence en 24 horas.</li>
          <li>Escribe el código y pulsa <B>Activar</B>. El celular queda fijado a esa tienda.</li>
        </Pasos>
        <Figura img="t-activar" pie="Activación del celular con el código del administrador" movil />
      </Seccion>

      <Seccion id="entrar" titulo="3. Entrar con tu código y PIN">
        <p>
          Al tocar cualquier botón, la app pide tu <B>código de empleado</B> (por ejemplo DEM-0001) y tu <B>PIN</B> de 4 a 6 dígitos. Te los da
          el administrador o el supervisor.
        </p>
        <Figura img="t-pin" pie="Ingreso con código y PIN" movil />
        <Lista>
          <li>Tu nombre aparece arriba mientras trabajas. Al terminar, pulsa <B>TERMINAR</B> para que nadie trabaje con tu nombre.</li>
          <li>Si escribes mal el PIN 5 veces, tu código se bloquea 10 minutos.</li>
          <li>Nunca compartas tu PIN: todo lo que se registre con él queda a tu nombre.</li>
        </Lista>
      </Seccion>

      <Seccion id="recibir" titulo="4. Recibir costales">
        <p>Cuando llega el camión del centro de distribución, escanea <B>cada costal</B> que se baja.</p>
        <Pasos>
          <li>Toca <B>Recibir</B> y entra con tu código y PIN.</li>
          <li>Escanea el código de barras del costal con el lector, o toca <B>Usar cámara</B>. También puedes escribir el código y pulsar OK.</li>
          <li>Si el costal venía en el traslado, aparece <B>&quot;Costal … recibido&quot;</B>. Sigue con el siguiente.</li>
        </Pasos>
        <Par>
          <Figura img="t-recibir" pie="Pantalla para recibir" movil />
          <Figura img="t-recibir-leido" pie="Costales recibidos y tu actividad" movil />
        </Par>
        <p>
          Debajo aparece la lista <B>Faltan por escanear</B> con los costales que el centro envió y todavía no se han escaneado. Cuando ya no
          falta ninguno, dice que recibiste todo.
        </p>
        <Nota tipo="aviso">
          Los costales que no se escaneen quedan como <B>faltantes</B> del traslado y el administrador los ve con su valor en quetzales. Escanea
          todos, aunque sean muchos.
        </Nota>
        <p>
          Si escaneas un costal que <B>no venía en ningún traslado</B>, la app te pide elegir el producto (y opcionalmente las piezas) para
          registrarlo.
        </p>
      </Seccion>

      <Seccion id="produccion" titulo="5. Producción: varias personas a la vez">
        <p>
          Cuando se prepara ciclo, varias personas producen al mismo tiempo en el mismo celular. Cada persona trabaja <B>un costal a la
          vez</B>: no puede iniciar otro hasta finalizar el que tiene abierto.
        </p>
        <Sub>Iniciar (al abrir el costal)</Sub>
        <Pasos>
          <li>Toca <B>Producción</B>. No pide PIN para entrar.</li>
          <li>La primera vez, pulsa <B>Ingresar con mi código</B> y escribe tu código y PIN. Si sigues tú, ya no lo vuelve a pedir.</li>
          <li>Escanea el costal que vas a abrir (o escribe el código y pulsa OK).</li>
          <li>Si le toca a otra persona, pulsa <B>Soy otra persona</B> y que ponga su código y PIN.</li>
        </Pasos>
        <Sub>Finalizar (al terminar de sacar las piezas)</Sub>
        <Pasos>
          <li>En <B>En producción</B> aparecen todos los costales abiertos con el nombre de quien lo abrió.</li>
          <li>Toca <B>Finalizar</B> en tu costal, escribe las <B>piezas preparadas</B> y pulsa <B>Guardar y finalizar</B>. No pide código.</li>
        </Pasos>
        <Par>
          <Figura img="t-produccion-iniciado" pie="Costal iniciado y en proceso" movil />
          <Figura img="t-produccion-finalizar" pie="Anotar las piezas al finalizar" movil />
        </Par>
        <Nota>Cuenta con cuidado: la cantidad se compara con lo que se empacó en el centro de distribución.</Nota>
      </Seccion>

      <Seccion id="inicial" titulo="6. Inventario inicial desde el celular">
        <p>
          Sirve para registrar los costales que la tienda ya tenía antes de empezar a usar el sistema. Normalmente el administrador lo carga
          desde un Excel; usa esta opción para costales sueltos que falten.
        </p>
        <Pasos>
          <li>Toca <B>Inventario inicial</B> y entra con tu código y PIN.</li>
          <li>Escanea el costal. Aparece el <B>código leído en grande</B>: compáralo con la etiqueta. Si no coincide, pulsa <B>No coincide, corregir código</B>.</li>
          <li>Elige el <B>producto</B> y escribe las <B>piezas</B> que dice la etiqueta (queda elegido el último producto: revísalo cada vez) y pulsa <B>Registrar</B>.</li>
        </Pasos>
        <Figura img="t-inicial" pie="Inventario inicial costal por costal" movil />
        <Nota tipo="aviso">
          Cuando el administrador <B>cierra el inventario inicial</B> de la tienda, el botón desaparece y ya no se pueden agregar más costales
          de inventario inicial.
        </Nota>
      </Seccion>

      <Seccion id="inventario" titulo="7. Inventario (cuando el supervisor lo abre)">
        <p>
          Cuando el supervisor abre un inventario, aparece el botón <B>Inventario</B> en la pantalla principal. Puede ser de toda la tienda o
          solo de algunos productos (por ejemplo, toda la clase A).
        </p>
        <Pasos>
          <li>Toca <B>Inventario</B> y entra con tu código y PIN. Arriba dice qué productos se cuentan.</li>
          <li>Escanea <B>cada costal que encuentres</B> físicamente en la tienda. El contador sube con cada uno.</li>
          <li>Cuando terminen, avisa al supervisor; él cierra el inventario desde la computadora.</li>
        </Pasos>
        <Figura img="t-inventario" pie="Inventario selectivo: solo productos de la clase A" movil />
      </Seccion>

      <Seccion id="auditoria" titulo="8. Auditoría con código temporal">
        <p>
          Para que un auditor o administrador revise el inventario de la tienda. No usa código ni PIN de empleado: usa un <B>código de
          auditoría</B> que se genera en el panel y vence en pocas horas.
        </p>
        <Pasos>
          <li>En el celular de la tienda toca <B>🛡️ Auditoría</B>. En cualquier otro celular abre <B>new-control-de-costales.vercel.app/auditoria</B>.</li>
          <li>Escribe el código (por ejemplo C4WY6-PL3N4) y pulsa <B>Entrar</B>.</li>
          <li>Escanea cada costal. En verde: estaba reportado. En rojo: <B>no está reportado</B> en esta tienda.</li>
          <li><B>Ver comparación</B> muestra por producto los reportados, encontrados y la diferencia, y la lista de faltantes.</li>
          <li>Al terminar pulsa <B>Finalizar</B>. El reporte queda en el panel (Auditorías) para imprimirlo.</li>
        </Pasos>
        <Nota>Nada de la auditoría queda guardado en el celular y necesita internet.</Nota>
      </Seccion>

      <Seccion id="venta-local" titulo="8b. Bodega de ventas locales (B037)">
        <p>
          El celular de la bodega de ventas locales muestra otras opciones: <B>Vender</B>, <B>Stock</B>, <B>Anular venta</B>, Inventario (cuando
          el supervisor lo abre) y Auditoría. Los costales llegan solos con el traslado del centro a la bodega B037; no hay que recibirlos.
        </p>
        <Pasos>
          <li>Toca <B>Vender</B> y entra con tu código y PIN.</li>
          <li>Escanea cada costal que se vende. Queda vendido a tu nombre y sale del stock.</li>
          <li>Si te equivocaste, toca <B>Anular venta</B>, escanea el costal y confirma: vuelve al stock.</li>
        </Pasos>
        <Nota>Si escaneas un costal que no está en la bodega o que ya se vendió, la app lo marca en rojo con el motivo.</Nota>
      </Seccion>

      <Seccion id="retorno" titulo="9. Retorno de saldo">
        <p>El saldo (piezas que no se venden) se junta en un saco y se devuelve al centro de distribución. El saco no tiene código de barras: lo genera la app.</p>
        <Pasos>
          <li>Toca <B>Retorno de saldo</B> y entra con tu código y PIN.</li>
          <li>Anota cada producto y sus piezas. Usa <B>+ Otro producto</B> si el saco va mezclado.</li>
          <li>Pulsa <B>Generar código del saco</B>.</li>
          <li>Escribe el código (por ejemplo SAL-T01-EYKP) <B>grande y con marcador</B> en el saco. El centro lo usa para recibirlo y contar.</li>
        </Pasos>
        <Par>
          <Figura img="t-retorno" pie="Piezas del saco por producto" movil />
          <Figura img="t-retorno-codigo" pie="Código que se escribe en el saco" movil />
        </Par>
      </Seccion>

      <Seccion id="stock" titulo="10. Stock de la tienda">
        <p>El botón <B>Stock</B> muestra cuántos costales sin abrir hay de cada producto. No pide PIN.</p>
        <Figura img="t-stock" pie="Costales sin abrir por producto" movil />
      </Seccion>

      <Seccion id="sin-internet" titulo="11. Sin internet">
        <Lista>
          <li>Puedes seguir trabajando sin señal si entraste al menos una vez con internet en los últimos 7 días.</li>
          <li>Todo lo que hagas se guarda en el celular y se envía solo cuando vuelve la conexión, con la hora real en que lo hiciste.</li>
          <li>Arriba verás <B>Todo sincronizado</B> o cuántas acciones faltan por enviar.</li>
          <li>Si alguna acción se rechaza (por ejemplo, otra persona ya había iniciado ese costal), aparece en rojo para que la revises.</li>
        </Lista>
      </Seccion>

      <Seccion id="problemas" titulo="12. Si algo no funciona">
        <Tabla
          cols={['Problema', 'Qué hacer']}
          filas={[
            ['El celular pide un código de activación', 'El celular se desactivó. Pide al administrador un código nuevo (Celulares).'],
            ['Olvidé mi PIN o mi código', 'Pide al administrador o supervisor que te asigne un PIN nuevo.'],
            ['“Demasiados intentos”', 'Espera 10 minutos y vuelve a intentar con el PIN correcto.'],
            ['La cámara no lee el código', 'La cámara debe leer el mismo código 2 veces para aceptarlo: mantén quieto el celular a 15–25 cm, usa la luz 🔦 o el zoom. Si no, escribe el código a mano.'],
            ['Se registró un código o producto equivocado', 'Avisa al supervisor: lo corrige o elimina en Costales → Corregir.'],
            ['“El costal ya está en producción”', 'Otra persona ya lo inició. Revisa en Mis costales en proceso o pregunta al compañero.'],
            ['“Costal registrado en otra tienda”', 'Ese costal no es de tu tienda. Sepáralo y avisa al supervisor.'],
          ]}
        />
      </Seccion>
    </>
  );
}
