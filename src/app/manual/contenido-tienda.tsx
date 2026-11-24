import { B, Figura, Lista, Nota, Par, Pasos, Seccion, Sub, Tabla } from './piezas';

export const SECCIONES_TIENDA = [
  ['celular', 'El celular de la tienda'],
  ['activar', 'Activar el celular (una sola vez)'],
  ['entrar', 'Entrar con tu código y PIN'],
  ['recibir', 'Recibir costales'],
  ['produccion', 'Producción: abrir y terminar un costal'],
  ['inicial', 'Inventario inicial desde el celular'],
  ['inventario', 'Inventario (cuando el supervisor lo abre)'],
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
        <Nota tipo="aviso">
          Los costales que no se escaneen quedan como <B>faltantes</B> del traslado y el administrador los ve con su valor en quetzales. Escanea
          todos, aunque sean muchos.
        </Nota>
        <p>
          Si escaneas un costal que <B>no venía en ningún traslado</B>, la app te pide elegir el producto (y opcionalmente las piezas) para
          registrarlo.
        </p>
      </Seccion>

      <Seccion id="produccion" titulo="5. Producción: abrir y terminar un costal">
        <p>Cada vez que alguien abre un costal para sacar la ropa, debe registrarlo. Varias personas pueden tener costales abiertos a la vez.</p>
        <Sub>Iniciar (al abrir el costal)</Sub>
        <Pasos>
          <li>Toca <B>Producción</B> y entra con tu código y PIN.</li>
          <li>Escanea el costal que vas a abrir. Aparece <B>&quot;Costal … iniciado&quot;</B> y queda en <B>Mis costales en proceso</B>.</li>
        </Pasos>
        <Sub>Finalizar (al terminar de sacar las piezas)</Sub>
        <Pasos>
          <li>En <B>Mis costales en proceso</B>, toca <B>Finalizar</B> en el costal.</li>
          <li>Escribe cuántas <B>piezas preparadas</B> salieron y pulsa <B>Guardar y finalizar</B>.</li>
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
          <li>Elige el <B>producto</B> (y las piezas si las sabes) y escanea el costal.</li>
          <li>Repite con cada costal. Si son de otro producto, cambia el producto antes de escanear.</li>
        </Pasos>
        <Figura img="t-inicial" pie="Inventario inicial costal por costal" movil />
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

      <Seccion id="retorno" titulo="8. Retorno de saldo">
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

      <Seccion id="stock" titulo="9. Stock de la tienda">
        <p>El botón <B>Stock</B> muestra cuántos costales sin abrir hay de cada producto. No pide PIN.</p>
        <Figura img="t-stock" pie="Costales sin abrir por producto" movil />
      </Seccion>

      <Seccion id="sin-internet" titulo="10. Sin internet">
        <Lista>
          <li>Puedes seguir trabajando sin señal si entraste al menos una vez con internet en los últimos 7 días.</li>
          <li>Todo lo que hagas se guarda en el celular y se envía solo cuando vuelve la conexión, con la hora real en que lo hiciste.</li>
          <li>Arriba verás <B>Todo sincronizado</B> o cuántas acciones faltan por enviar.</li>
          <li>Si alguna acción se rechaza (por ejemplo, otra persona ya había iniciado ese costal), aparece en rojo para que la revises.</li>
        </Lista>
      </Seccion>

      <Seccion id="problemas" titulo="11. Si algo no funciona">
        <Tabla
          cols={['Problema', 'Qué hacer']}
          filas={[
            ['El celular pide un código de activación', 'El celular se desactivó. Pide al administrador un código nuevo (Celulares).'],
            ['Olvidé mi PIN o mi código', 'Pide al administrador o supervisor que te asigne un PIN nuevo.'],
            ['“Demasiados intentos”', 'Espera 10 minutos y vuelve a intentar con el PIN correcto.'],
            ['La cámara no lee el código', 'Limpia la etiqueta, acerca o aleja el celular, o escribe el código a mano.'],
            ['“El costal ya está en producción”', 'Otra persona ya lo inició. Revisa en Mis costales en proceso o pregunta al compañero.'],
            ['“Costal registrado en otra tienda”', 'Ese costal no es de tu tienda. Sepáralo y avisa al supervisor.'],
          ]}
        />
      </Seccion>
    </>
  );
}
