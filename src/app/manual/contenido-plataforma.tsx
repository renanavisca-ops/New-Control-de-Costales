import { B, Figura, Lista, Nota, Pasos, Seccion, Tabla } from './piezas';

export const SECCIONES_PLATAFORMA = [
  ['que-es', 'Qué es la plataforma'],
  ['area', 'El selector de área'],
  ['organizaciones', 'Organizaciones'],
  ['nueva', 'Dar de alta una organización'],
  ['gestionar', 'Gestionar una organización'],
  ['registro', 'Registro libre desde el enlace web'],
  ['administradores', 'Administradores'],
  ['soporte', 'Acceso de soporte'],
  ['auditoria', 'Auditoría de soporte'],
  ['manuales', 'Manuales para las organizaciones'],
] as const;

export function ManualPlataforma() {
  return (
    <>
      <Seccion id="que-es" titulo="1. Qué es la plataforma">
        <p>
          La plataforma es la administración global de Control de Costales. Desde aquí el superadministrador da de alta organizaciones, les
          crea su primer administrador, define qué centros de distribución abastecen a qué organizaciones y da soporte.
        </p>
        <Nota>
          El superadministrador <B>no tiene acceso a los datos internos</B> de una organización (costales, empleados, reportes). Solo entra si es
          miembro de ella o si la organización le da acceso de soporte de solo lectura por un tiempo.
        </Nota>
        <Figura img="p-login" pie="Pantalla de inicio: todos entran por la misma dirección web" />
      </Seccion>

      <Seccion id="area" titulo="2. El selector de área">
        <p>Arriba del menú está el selector de área. Cambia el menú y los datos que ves:</p>
        <Tabla
          cols={['Opción', 'Qué es']}
          filas={[
            ['★ Mi plataforma', 'La administración global (menú en color ámbar).'],
            ['🏢 Organización', 'Una organización de la que eres miembro; la operas con normalidad.'],
            ['🛟 Organización (soporte)', 'Te dio acceso de soporte: la ves en solo lectura hasta la fecha indicada.'],
            ['🔒 Organización', 'No te ha dado acceso; no puedes ver sus datos.'],
          ]}
        />
      </Seccion>

      <Seccion id="organizaciones" titulo="3. Organizaciones">
        <p>
          <B>Mi plataforma → Organizaciones</B> muestra cada organización con sus cifras: sucursales, centros de distribución, empleados,
          celulares activos, administradores y si tienes acceso de soporte vigente.
        </p>
        <Figura img="p-plataforma" pie="Organizaciones de la plataforma" />
      </Seccion>

      <Seccion id="nueva" titulo="4. Dar de alta una organización">
        <Pasos>
          <li>Pulsa <B>+ Organización</B>.</li>
          <li>Escribe el <B>nombre</B> y el <B>prefijo de empleados</B> (2 a 6 letras): los códigos de sus empleados serán como TDS-0001.</li>
          <li>Pulsa <B>Crear organización</B>.</li>
          <li>Pulsa <B>Gestionar →</B> en la organización nueva y crea su <B>primer administrador</B> (siguiente sección).</li>
        </Pasos>
        <Figura img="p-nueva-org" pie="Nueva organización con su prefijo de empleados" />
        <p>
          Desde ese momento, su administrador configura sus sucursales, productos, empleados, usuarios y celulares con el{' '}
          <B>Manual de la organización</B>.
        </p>
      </Seccion>

      <Seccion id="gestionar" titulo="5. Gestionar una organización">
        <Figura img="p-org-detalle" pie="Gestionar: datos, abastecimiento y administradores" />
        <Lista>
          <li><B>Datos de la organización:</B> cambiar el nombre o desactivarla.</li>
          <li>
            <B>Abastecimiento:</B> marca los centros de distribución de otras organizaciones que la abastecen. Así ese centro puede enviarle
            traslados y la organización usa sus productos.
          </li>
          <li>
            <B>Administradores de la organización → + Usuario:</B> crea su administrador con nombre, correo y rol Admin. organización. Recibe
            una contraseña temporal que cambia al entrar.
          </li>
        </Lista>
      </Seccion>

      <Seccion id="registro" titulo="6. Registro libre desde el enlace web">
        <p>
          Una empresa nueva también puede crear su propia organización sin intervención: en la pantalla de inicio,{' '}
          <B>¿Empresa nueva? Regístrala aquí</B>. Escribe el nombre de la empresa, su nombre, correo y contraseña, y entra de inmediato como
          administrador. El prefijo de empleados se genera solo.
        </p>
        <Figura img="p-registro" pie="Registro de una empresa nueva" />
        <Nota tipo="aviso">
          El registro es libre e inmediato. Las organizaciones nuevas aparecen en Mi plataforma → Organizaciones; revísalas y desactiva las que
          no correspondan. Por seguridad se aceptan como máximo 20 registros por hora.
        </Nota>
      </Seccion>

      <Seccion id="administradores" titulo="7. Administradores">
        <p>
          <B>Mi plataforma → Administradores</B> lista a todos los usuarios con correo de la plataforma y sus roles en cada organización. Desde
          aquí puedes crear usuarios, cambiar roles, desactivarlos o generar una contraseña temporal.
        </p>
        <Figura img="p-usuarios" pie="Todos los administradores de la plataforma" />
      </Seccion>

      <Seccion id="soporte" titulo="8. Acceso de soporte">
        <p>
          Cuando una organización necesita ayuda, su administrador te da acceso desde su menú <B>Acceso de soporte</B>, por 2 h, 8 h, 1, 3 o 7
          días y con un motivo. Ella puede quitarlo en cualquier momento.
        </p>
        <Pasos>
          <li>En el selector de área, elige la organización marcada con 🛟.</li>
          <li>Navega por sus pantallas. Una franja azul indica <B>Modo soporte · solo lectura</B> y hasta cuándo.</li>
          <li>No puedes crear ni cambiar nada: la base de datos lo bloquea. Cada pantalla que abres queda registrada.</li>
        </Pasos>
        <Figura img="p-soporte-modo" pie="Organización vista en modo soporte" />
      </Seccion>

      <Seccion id="auditoria" titulo="9. Auditoría de soporte">
        <p>
          <B>Mi plataforma → Auditoría de soporte</B> muestra todos los accesos otorgados por las organizaciones (quién, motivo, vigencia) y
          cada ingreso por soporte con la pantalla visitada. La organización ve lo mismo sobre su propia cuenta.
        </p>
        <Figura img="p-auditoria" pie="Accesos otorgados e ingresos por soporte" />
      </Seccion>

      <Seccion id="manuales" titulo="10. Manuales para las organizaciones">
        <p>Hay tres manuales, cada uno disponible dentro de la app (menú Manual) y en PDF:</p>
        <Lista>
          <li><B>Manual de la plataforma</B> (este): para el superadministrador.</li>
          <li><B>Manual de la organización:</B> para administradores, supervisores, bodega y auditores.</li>
          <li><B>Manual de la tienda:</B> para los empleados que usan el celular de la tienda.</li>
        </Lista>
        <p>Los enlaces son públicos: puedes compartirlos con una organización nueva antes de que entre por primera vez.</p>
      </Seccion>
    </>
  );
}
