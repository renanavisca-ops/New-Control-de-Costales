import { B, Figura, Lista, Nota, Pasos, Seccion, Sub, Tabla } from './piezas';

export const SECCIONES_ORGANIZACION = [
  ['inicio', 'Cómo funciona'],
  ['roles', 'Quién hace qué'],
  ['primeros-pasos', 'Primeros pasos'],
  ['sucursales', 'Sucursales'],
  ['productos', 'Productos'],
  ['empleados', 'Empleados de tienda'],
  ['celulares', 'Celulares de tienda'],
  ['usuarios', 'Usuarios administradores'],
  ['existencia-cc', 'Existencias y producción del centro'],
  ['contenedores', 'Producción por contenedor'],
  ['traslados', 'Traslados'],
  ['inventario-inicial', 'Inventario inicial de una tienda'],
  ['inventarios', 'Inventarios completos y selectivos'],
  ['en-vivo', 'Producción en vivo'],
  ['empaque', 'Empaque vs. producción'],
  ['costales', 'Costales'],
  ['retornos', 'Retornos de saldo'],
  ['soporte', 'Acceso de soporte'],
  ['preguntas', 'Preguntas frecuentes'],
] as const;

export function ManualOrganizacion() {
  return (
    <>
      <Seccion id="inicio" titulo="1. Cómo funciona">
        <p>
          Control de Costales sigue cada costal desde que se empaca en el centro de distribución hasta que se abre y se produce en la tienda.
          La administración se hace desde la computadora en <B>new-control-de-costales.vercel.app</B>; las tiendas trabajan con su celular.
        </p>
        <Pasos>
          <li>El centro de distribución carga sus <B>existencias</B> por contenedor (reporte de existencias) y luego cada <B>traslado</B> (reporte de traslado).</li>
          <li>Los costales quedan <B>en tránsito</B> hacia la sucursal. La tienda escanea cada costal al recibirlo.</li>
          <li>En la tienda, cada empleado <B>inicia</B> el costal al abrirlo y lo <B>finaliza</B> con las piezas que salieron.</li>
          <li>Administración ve faltantes, producción en vivo, diferencias de piezas e inventarios.</li>
        </Pasos>
        <Figura img="o-inicio" pie="Inicio: resumen de la organización y primeros pasos" />
        <p>
          Arriba del menú está el <B>selector de área</B> con tu organización. Si perteneces a más de una, elige ahí en cuál trabajas.
        </p>
      </Seccion>

      <Seccion id="roles" titulo="2. Quién hace qué">
        <Tabla
          cols={['Rol', 'Qué hace']}
          filas={[
            ['Administrador de la organización', 'Configura todo: sucursales, productos, empleados, celulares y usuarios. Ve todos los reportes, incluida la diferencia empaque vs. producción.'],
            ['Bodega (centro de distribución)', 'Carga la existencia del centro y los traslados; revisa faltantes y costales sin existencia.'],
            ['Supervisor', 'Abre y cierra inventarios de sus tiendas, carga el inventario inicial y ve producción en vivo.'],
            ['Auditor', 'Solo consulta: reportes, inventarios y diferencias. No puede cambiar nada.'],
            ['Empleado de tienda', 'No tiene correo. Trabaja en el celular de la tienda con su código y PIN.'],
          ]}
        />
      </Seccion>

      <Seccion id="primeros-pasos" titulo="3. Primeros pasos">
        <p>Una organización nueva queda lista en este orden. Todo se puede corregir después.</p>
        <Pasos>
          <li>
            <B>Crear la organización.</B> En la pantalla de inicio, <B>¿Empresa nueva? Regístrala aquí</B>. Escribe el nombre de la empresa, tu
            nombre, correo y contraseña; entras de inmediato como administrador.
          </li>
          <li><B>Sucursales:</B> el centro de distribución y cada tienda, con su bodega del sistema.</li>
          <li><B>Productos:</B> revisa la lista y las piezas por costal.</li>
          <li><B>Empleados</B> de cada tienda, con su PIN.</li>
          <li><B>Usuarios</B> con correo: supervisores, bodega y auditores.</li>
          <li><B>Celulares</B>: un celular por tienda, activado con su código.</li>
          <li><B>Existencia:</B> la del centro con el reporte de existencias y la de cada tienda con el formato de traslado.</li>
        </Pasos>
      </Seccion>

      <Seccion id="sucursales" titulo="4. Sucursales">
        <p>
          Menú <B>Sucursales</B> → <B>+ Sucursal</B>. Cada sucursal lleva un <B>código</B> (ej. T02), un nombre y su <B>Bodega en el sistema</B>:
          la que aparece como <B>BODEGA DE ENTRADA</B> en el Excel de traslado (ej. B102). Así cada traslado llega a la tienda correcta.
        </p>
        <Figura img="o-sucursales" pie="Sucursales con su bodega del sistema" />
        <Figura img="o-sucursal-editar" pie="Editar una sucursal: código, bodega, nombre y dirección" />
        <Nota>
          Marca como <B>Centro de distribución</B> la bodega que despacha (ej. B090). Una sucursal con la insignia roja &quot;Sin bodega&quot;
          no puede recibir traslados hasta que se le asigne.
        </Nota>
      </Seccion>

      <Seccion id="productos" titulo="5. Productos">
        <p>
          La lista de productos (ROPA A, ZAPATO B, CARTERA A…) la comparten todas las tiendas. Cada producto tiene sus <B>Piezas por costal</B>:
          lo que normalmente trae un costal de ese producto.
        </p>
        <Figura img="o-productos" pie="Productos con sus piezas por costal" />
        <Lista>
          <li><B>+ Producto</B> agrega uno; <B>Editar</B> cambia su nombre, piezas o lo desactiva.</li>
          <li><B>Cargar Excel</B> agrega o actualiza muchos a la vez: columna PRODUCTO y, opcional, columna PIEZAS.</li>
          <li>La última letra del nombre es la <B>clase</B> (A, B, C, AB). Los inventarios selectivos la usan para &quot;Toda la A&quot;.</li>
        </Lista>
      </Seccion>

      <Seccion id="empleados" titulo="6. Empleados de tienda">
        <p>
          Menú <B>Empleados</B> → <B>+ Empleado</B>. Escribe nombre y apellidos, marca las tiendas donde trabaja y asígnale un <B>PIN</B> de 4 a 6
          dígitos. El sistema le da un código como <B>DEM-0001</B>.
        </p>
        <Figura img="o-empleados" pie="Empleados con su código" />
        <Figura img="o-empleado-nuevo" pie="Nuevo empleado: tiendas y PIN" />
        <Lista>
          <li>Entrégale al empleado su código y su PIN; con ellos entra al celular de la tienda.</li>
          <li>Si olvida el PIN, pulsa <B>PIN</B> para asignarle uno nuevo. Si deja de trabajar, desactívalo en <B>Editar</B>.</li>
        </Lista>
      </Seccion>

      <Seccion id="celulares" titulo="7. Celulares de tienda">
        <Pasos>
          <li>Menú <B>Celulares</B> → <B>+ Celular</B>. Elige la tienda y ponle un nombre (ej. Celular caja 1).</li>
          <li>Pulsa <B>Generar código</B>. Aparece un <B>código de 8 caracteres</B> que vence en 24 horas.</li>
          <li>En el celular, abre la app Costales Tienda y escribe ese código. El celular queda fijado a esa tienda.</li>
        </Pasos>
        <Figura img="o-celular-codigo" pie="Código de activación de un celular nuevo" />
        <Figura img="o-celulares" pie="Celulares por tienda: activos, pendientes y último contacto" />
        <Lista>
          <li><B>Nuevo código</B> sirve si el código venció o si se cambia el celular.</li>
          <li><B>Bloquear</B> desactiva un celular perdido o robado al instante.</li>
        </Lista>
      </Seccion>

      <Seccion id="usuarios" titulo="8. Usuarios administradores">
        <p>
          Menú <B>Usuarios</B> → <B>+ Usuario</B>: nombre, correo y rol (administrador, supervisor, bodega o auditor). Supervisor y bodega
          llevan además su sucursal. El usuario recibe una <B>contraseña temporal</B> que cambia al entrar por primera vez.
        </p>
        <Figura img="o-usuarios" pie="Usuarios de la organización con sus roles" />
        <p><B>Contraseña</B> genera una nueva temporal si alguien la olvida. También pueden usar &quot;¿Olvidaste tu contraseña?&quot; en la pantalla de inicio.</p>
      </Seccion>

      <Seccion id="existencia-cc" titulo="9. Existencias y producción del centro de distribución">
        <p>
          El centro carga sus costales con el <B>Reporte de Existencias de Costales</B> del sistema (REPEXISCOS26), agrupado por contenedor
          (<B>EMBARQUE NO.</B>). Se usa para la existencia inicial del centro y, después, para cargar la <B>producción de cada contenedor</B>{' '}
          conforme se empaca. Si un archivo trae costales que ya estaban cargados, no se duplican.
        </p>
        <Pasos>
          <li>Menú <B>Traslados</B> → <B>Existencias / producción del centro</B> → elige el Excel.</li>
          <li>
            Revisa el resumen: fecha del reporte, contenedores, costales y piezas. En <B>Por contenedor</B> ves cuántos costales y piezas trae
            cada contenedor.
          </li>
          <li>
            Revisa cómo se asigna cada producto y clasificación al producto del sistema: &quot;ZAPATOS&quot; con clasificación B →{' '}
            <B>ZAPATO B</B>. Si no existe (ej. ROPA D, ROPA AB), elige un producto de la lista o deja &quot;Crear producto&quot;.
          </li>
          <li>Pulsa <B>Confirmar</B>. Cada costal guarda su contenedor y su fecha de empaque.</li>
        </Pasos>
        <Figura img="o-existencia-carga" pie="Existencias del centro: cada producto del Excel con su producto del sistema" />
        <Figura img="o-existencia-contenedores" pie="Resumen por contenedor del reporte" />
        <Nota>
          Los costales que en el reporte ya tienen <B>FEC.ENVIADO</B> no se cargan como existencia: ya salieron del centro. Plantilla: en
          Traslados, <B>⬇ Existencias / producción del centro</B>.
        </Nota>
      </Seccion>

      <Seccion id="contenedores" titulo="10. Producción por contenedor">
        <p>
          Menú <B>Producción por contenedor</B>. Muestra cada contenedor con sus costales y piezas empacadas y dónde está cada costal ahora:
          en el centro, en camino, en la tienda, produciéndose o producido. La barra indica el porcentaje ya producido y <B>Dif. piezas</B>{' '}
          compara las piezas producidas en tienda contra las empacadas.
        </p>
        <Figura img="o-contenedores" pie="Producción por contenedor" />
      </Seccion>

      <Seccion id="traslados" titulo="11. Traslados">
        <Sub>Cargar un traslado</Sub>
        <Pasos>
          <li>Menú <B>Traslados</B> → <B>Cargar traslado</B> → elige el reporte del traslado (COSTAL # · PIEZAS · PESO).</li>
          <li>Revisa número, fecha, bodega de entrada, costales y piezas. La app avisa si los subtotales no cuadran o si un producto trae piezas distintas a su estándar.</li>
          <li>Pulsa <B>Confirmar</B>. Los costales salen de la existencia del centro y quedan <B>en tránsito</B> hacia la sucursal.</li>
        </Pasos>
        <Figura img="o-traslado-carga" pie="Revisión del traslado antes de confirmar" />
        <Nota tipo="aviso">
          El traslado no se carga si ya se cargó ese número, si algún costal ya se envió antes, si ninguna sucursal tiene esa bodega de entrada o
          si el total de piezas no coincide con el reporte. Plantilla: en Traslados, <B>⬇ Traslado / existencia inicial de tienda</B>.
        </Nota>
        <Sub>Seguimiento y faltantes</Sub>
        <p>
          La lista muestra cada traslado con su recepción: <B>En tránsito</B>, <B>Completo</B> o <B>Faltan N</B> costales con sus piezas. Al
          abrirlo, marca <B>Ver solo los que no han llegado</B> para la lista de faltantes.
        </p>
        <Figura img="o-traslados" pie="Traslados con su avance de recepción" />
        <Figura img="o-traslado-detalle" pie="Costales y piezas que no han llegado" />
        <Sub>Costales que no estaban en la existencia del centro</Sub>
        <p>
          Se envían igual, para no rehacer el trabajo, pero aparece una alerta roja. Abre el traslado, revisa los códigos marcados, escribe una
          nota de lo que se encontró y pulsa <B>Marcar revisado</B>.
        </p>
        <Figura img="o-traslado-revisar" pie="Revisión de costales sin existencia en el centro" />
        <p>
          <B>Anular</B>: si un traslado se cargó por error y la tienda aún no recibió ningún costal, ábrelo y pulsa <B>Anular traslado</B>. Sus
          costales regresan a la existencia del centro.
        </p>
      </Seccion>

      <Seccion id="inventario-inicial" titulo="12. Inventario inicial de una tienda">
        <p>
          Carga de una sola vez los costales que una tienda ya tiene, con el <B>mismo formato del traslado</B> (reporte del sistema o la
          plantilla). Menú <B>Inventarios</B> → <B>Inventario inicial (Excel)</B>. Pueden hacerlo el administrador y el supervisor de la tienda.
        </p>
        <Pasos>
          <li>Elige el <B>número de tienda</B>. Si no tienes el reporte del sistema, pulsa <B>Descargar plantilla</B> y llénala.</li>
          <li>
            Pulsa <B>Subir Excel</B>. La <B>BODEGA DE ENTRADA</B> del archivo debe ser la de esa tienda; si no coincide, la app avisa y pide
            confirmar que el archivo sí es de esa tienda.
          </li>
          <li>Elige el producto del sistema para cada producto y clasificación del archivo.</li>
          <li>Pulsa <B>Confirmar</B>. Los costales quedan en el stock de la tienda.</li>
        </Pasos>
        <Figura img="o-inicial" pie="Elegir el número de tienda y descargar la plantilla" />
        <Figura img="o-inicial-subido" pie="Aviso de bodega distinta y productos antes de confirmar" />
        <Nota>Se puede cargar por partes: los costales que ya estaban cargados en esa misma tienda se omiten.</Nota>
      </Seccion>

      <Seccion id="inventarios" titulo="13. Inventarios completos y selectivos">
        <p>El supervisor abre el inventario en la computadora; los empleados escanean en el celular de la tienda; el sistema compara contra el stock que había al abrirlo.</p>
        <Pasos>
          <li>Menú <B>Inventarios</B> → <B>+ Inventario</B> → elige la tienda.</li>
          <li>
            Elige el tipo: <B>Completo</B> (todo el stock) o <B>Selectivo</B>. En selectivo, pulsa <B>Toda la A</B>, <B>Toda la B</B> o{' '}
            <B>Toda la C</B> para marcar todos los productos de esa clase, o marca productos sueltos.
          </li>
          <li>Pulsa <B>Abrir inventario</B>. En el celular aparece el botón Inventario.</li>
          <li>Pulsa <B>Ver</B> para seguir el avance por producto; se actualiza solo cada 15 segundos.</li>
          <li><B>Cerrar inventario</B> cuando terminen.</li>
        </Pasos>
        <Figura img="o-inventario-selectivo" pie="Inventario selectivo: Toda la A" />
        <Figura img="o-inventario-avance" pie="Avance por producto, encontrados y faltantes" />
        <Tabla
          cols={['Resultado', 'Significa']}
          filas={[
            ['Encontrados', 'Estaban en el stock y se escanearon.'],
            ['Faltantes', 'Estaban en el stock y no se escanearon.'],
            ['Sobrantes', 'Se escanearon pero están registrados en otro lugar, o no existen en el sistema.'],
            ['Producidos durante el conteo', 'Se abrieron mientras el inventario estaba abierto.'],
          ]}
        />
        <p>Si los faltantes se confirman, el administrador pulsa <B>Dar de baja los faltantes</B> y salen del stock. Solo puede haber un inventario abierto por tienda.</p>
      </Seccion>

      <Seccion id="en-vivo" titulo="14. Producción en vivo">
        <p>Muestra quién está produciendo qué costal en este momento, en cada tienda, y cuántos costales se terminaron hoy. Se actualiza sola.</p>
        <Figura img="o-envivo" pie="Producción en vivo por tienda" />
      </Seccion>

      <Seccion id="empaque" titulo="15. Empaque vs. producción">
        <p>
          Compara las piezas con que se empacó cada costal contra las piezas que la tienda anotó al finalizarlo. Lo ven <B>solo administradores
          y auditores</B>. Una diferencia de <B>5 piezas o más</B> se marca como alerta.
        </p>
        <Figura img="o-produccion" pie="Diferencias por empleado, por producto y por costal" />
        <p>Filtra por tienda y por fechas; marca <B>Solo alertas</B> para ver únicamente los costales con diferencia grande.</p>
      </Seccion>

      <Seccion id="costales" titulo="16. Costales">
        <p>Lista de todos los costales con filtro por tienda y estado (en stock, en producción, producido, en tránsito), con un resumen por producto y búsqueda por código.</p>
        <Figura img="o-costales" pie="Costales en stock con resumen por producto" />
      </Seccion>

      <Seccion id="retornos" titulo="17. Retornos de saldo">
        <p>
          Cuando una tienda envía un saco de saldo, aparece aquí con su código SAL-…. Al llegar al centro, ábrelo, anota las piezas recibidas
          por producto (y el peso si quieres) y confírmalo. Si las piezas no coinciden, queda marcado <B>Con diferencia</B>.
        </p>
        <Figura img="o-retornos" pie="Retornos de saldo en tránsito" />
      </Seccion>

      <Seccion id="soporte" titulo="18. Acceso de soporte">
        <p>
          Si necesitas que el equipo de la plataforma revise algo, dale acceso de <B>solo lectura</B> por un tiempo: menú{' '}
          <B>Acceso de soporte</B> → duración (2 h, 8 h, 1, 3 o 7 días) y motivo → <B>Dar acceso</B>. Puedes quitarlo cuando quieras y ver cada ingreso.
        </p>
        <Figura img="o-soporte" pie="Accesos otorgados e ingresos por soporte" />
      </Seccion>

      <Seccion id="preguntas" titulo="19. Preguntas frecuentes">
        <Tabla
          cols={['Pregunta', 'Respuesta']}
          filas={[
            ['No veo una opción del menú', 'El menú depende de tu rol. Revisa que estés en tu organización en el selector de área y recarga la página.'],
            ['“Ninguna sucursal tiene la bodega de entrada B102”', 'En Sucursales, edita la tienda y escribe B102 en Bodega en el sistema.'],
            ['“El traslado ya fue cargado”', 'Ese número ya está en Traslados. Si se cargó mal y nada se ha recibido, anúlalo y súbelo de nuevo.'],
            ['Un producto del Excel no existe (ROPA D, ROPA AB)', 'En el resumen elige el producto correcto o deja Crear producto; luego ajusta sus piezas en Productos.'],
            ['¿El inventario inicial se hace en el celular?', 'Lo normal es desde la computadora con el formato de traslado. El celular sirve para costales sueltos.'],
            ['Un empleado olvidó su PIN', 'En Empleados, pulsa PIN junto a su nombre y asígnale uno nuevo.'],
            ['Olvidé mi contraseña', 'En la pantalla de inicio, ¿Olvidaste tu contraseña? te envía un correo para crear una nueva.'],
          ]}
        />
      </Seccion>
    </>
  );
}
