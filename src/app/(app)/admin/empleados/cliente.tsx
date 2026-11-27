'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cargarOrgsPropias, rpc } from '@/lib/datos';
import { puedeAdministrarOrg, type AsignacionRol, type Empleado, type Organizacion, type Tienda } from '@/lib/tipos';
import { SelectorOrg, useOrgActiva } from '@/components/selector-org';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Selector, Tarjeta, Titulo } from '@/components/ui';

type Form = { id?: string; nombre: string; apellidos: string; tiendas: string[]; pin: string; activo: boolean };

export default function EmpleadosCliente({ roles }: { roles: AsignacionRol[] }) {
  const sb = supabaseNavegador();
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [orgId, setOrgId] = useOrgActiva(orgs);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [asign, setAsign] = useState<{ empleado_id: string; tienda_id: string }[]>([]);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [pinDe, setPinDe] = useState<Empleado | null>(null);
  const [nuevoPin, setNuevoPin] = useState('');
  const [creado, setCreado] = useState<{ codigo: string; nombre: string } | null>(null);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroTienda, setFiltroTienda] = useState('');
  const [abrirNuevo, setAbrirNuevo] = useState(false);
  const editable = puedeAdministrarOrg(roles, orgId);

  useEffect(() => {
    cargarOrgsPropias(roles).then(setOrgs);
    // Acceso directo desde Sucursales: ?tienda=<id>&nuevo=1
    const q = new URLSearchParams(window.location.search);
    if (q.get('tienda')) setFiltroTienda(q.get('tienda')!);
    if (q.get('nuevo')) setAbrirNuevo(true);
  }, [roles]);

  const nuevoEmpleado = () => {
    setForm({ nombre: '', apellidos: '', tiendas: filtroTienda ? [filtroTienda] : [], pin: '', activo: true });
    setError('');
  };

  useEffect(() => {
    if (abrirNuevo && editable && tiendas.length) {
      setAbrirNuevo(false);
      nuevoEmpleado();
    }
  }, [abrirNuevo, editable, tiendas]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(async () => {
    if (!orgId) return;
    const [e, t] = await Promise.all([
      sb.from('empleados').select('id, organizacion_id, codigo, nombre, apellidos, activo').eq('organizacion_id', orgId).order('codigo'),
      sb.from('tiendas').select('*').eq('organizacion_id', orgId).eq('activa', true).order('codigo'),
    ]);
    const lista = (e.data as Empleado[]) || [];
    setEmpleados(lista);
    setTiendas((t.data as Tienda[]) || []);
    if (lista.length) {
      const { data } = await sb.from('empleado_tiendas').select('*').in('empleado_id', lista.map((x) => x.id));
      setAsign(data || []);
    } else setAsign([]);
  }, [orgId, sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const tiendasDe = (id: string) =>
    asign
      .filter((a) => a.empleado_id === id)
      .map((a) => tiendas.find((t) => t.id === a.tienda_id)?.codigo)
      .filter(Boolean)
      .join(', ');

  const guardar = async () => {
    if (!form || !orgId) return;
    setError('');
    if (!form.nombre.trim()) return setError('El nombre es obligatorio.');
    if (!form.tiendas.length) return setError('Asigna al menos una tienda.');
    if (form.id) {
      const r = await rpc('actualizar_empleado', { p_id: form.id, p_nombre: form.nombre, p_apellidos: form.apellidos, p_tiendas: form.tiendas, p_activo: form.activo });
      if (r.error) return setError(r.error);
    } else {
      if (!/^\d{4,6}$/.test(form.pin)) return setError('El PIN debe tener de 4 a 6 dígitos.');
      const r = await rpc<{ codigo: string }>('crear_empleado', { p_org: orgId, p_nombre: form.nombre, p_apellidos: form.apellidos, p_tiendas: form.tiendas, p_pin: form.pin });
      if (r.error) return setError(r.error);
      setCreado({ codigo: r.data!.codigo, nombre: form.nombre });
    }
    setForm(null);
    cargar();
  };

  const guardarPin = async () => {
    if (!pinDe) return;
    setError('');
    if (!/^\d{4,6}$/.test(nuevoPin)) return setError('El PIN debe tener de 4 a 6 dígitos.');
    const r = await rpc('establecer_pin_empleado', { p_id: pinDe.id, p_pin: nuevoPin });
    if (r.error) return setError(r.error);
    setPinDe(null);
    setNuevoPin('');
  };

  const alternarTienda = (id: string) => {
    if (!form) return;
    setForm({ ...form, tiendas: form.tiendas.includes(id) ? form.tiendas.filter((t) => t !== id) : [...form.tiendas, id] });
  };

  const filtrados = empleados.filter(
    (e) =>
      `${e.codigo} ${e.nombre} ${e.apellidos ?? ''}`.toLowerCase().includes(busqueda.toLowerCase()) &&
      (!filtroTienda || asign.some((a) => a.empleado_id === e.id && a.tienda_id === filtroTienda)),
  );
  const tiendaFiltro = tiendas.find((t) => t.id === filtroTienda);

  return (
    <div>
      <Titulo accion={editable && <Boton onClick={nuevoEmpleado}>+ Empleado{tiendaFiltro ? ` en ${tiendaFiltro.codigo}` : ''}</Boton>}>
        Empleados
      </Titulo>
      <SelectorOrg orgs={orgs} valor={orgId} onCambio={setOrgId} />
      <p className="mb-3 text-sm text-gray-500">Los empleados entran a Producción en el celular de su tienda con su código y PIN. El código se genera solo.</p>
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Selector value={filtroTienda} onChange={(e) => setFiltroTienda(e.target.value)}>
          <option value="">Todas las tiendas</option>
          {tiendas.filter((t) => !t.es_central).map((t) => (
            <option key={t.id} value={t.id}>{t.codigo} · {t.nombre}</option>
          ))}
        </Selector>
        <Entrada placeholder="Buscar por código o nombre" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {filtrados.length === 0 && <p className="text-sm text-gray-400">Sin empleados.</p>}
        {filtrados.map((e) => (
          <Tarjeta key={e.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Insignia>{e.codigo}</Insignia>
                <p className="font-black">{e.nombre} {e.apellidos}</p>
                {!e.activo && <Insignia color="red">Inactivo</Insignia>}
              </div>
              <p className="mt-1 text-xs text-gray-400">{tiendasDe(e.id) || 'Sin tienda'}</p>
            </div>
            {editable && (
              <div className="flex shrink-0 flex-col gap-2">
                <Boton variante="suave" className="px-3 py-2" onClick={() => {
                  setForm({ id: e.id, nombre: e.nombre, apellidos: e.apellidos ?? '', tiendas: asign.filter((a) => a.empleado_id === e.id).map((a) => a.tienda_id), pin: '', activo: e.activo });
                  setError('');
                }}>Editar</Boton>
                <Boton variante="secundario" className="px-3 py-2 text-xs" onClick={() => { setPinDe(e); setNuevoPin(''); setError(''); }}>PIN</Boton>
              </div>
            )}
          </Tarjeta>
        ))}
      </div>

      {form && (
        <Modal titulo={form.id ? 'Editar empleado' : 'Nuevo empleado'} onCerrar={() => setForm(null)}>
          <Campo etiqueta="Nombre">
            <Entrada value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Campo>
          <Campo etiqueta="Apellidos">
            <Entrada value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} />
          </Campo>
          <Campo etiqueta="Tiendas donde trabaja">
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-2xl bg-gray-50 p-3">
              {tiendas.length === 0 && <p className="text-xs text-gray-400">Primero crea tiendas.</p>}
              {tiendas.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={form.tiendas.includes(t.id)} onChange={() => alternarTienda(t.id)} />
                  {t.codigo} · {t.nombre}
                </label>
              ))}
            </div>
          </Campo>
          {!form.id && (
            <Campo etiqueta="PIN (4 a 6 dígitos)">
              <Entrada inputMode="numeric" maxLength={6} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} />
            </Campo>
          )}
          {form.id && (
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
              Activo
            </label>
          )}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton className="w-full" onClick={guardar}>Guardar</Boton>
        </Modal>
      )}

      {pinDe && (
        <Modal titulo={`Nuevo PIN · ${pinDe.codigo}`} onCerrar={() => setPinDe(null)}>
          <p className="text-sm text-gray-500">También desbloquea el código si estaba bloqueado por intentos fallidos.</p>
          <Entrada inputMode="numeric" maxLength={6} value={nuevoPin} onChange={(e) => setNuevoPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN de 4 a 6 dígitos" />
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton className="w-full" onClick={guardarPin}>Guardar PIN</Boton>
        </Modal>
      )}

      {creado && (
        <Modal titulo="Empleado creado" onCerrar={() => setCreado(null)}>
          <p className="text-sm text-gray-600">Entrégale a {creado.nombre} su código. Con este código y su PIN entra a Producción.</p>
          <p className="rounded-2xl bg-indigo-50 p-4 text-center font-mono text-3xl font-black text-indigo-900">{creado.codigo}</p>
        </Modal>
      )}
    </div>
  );
}
