'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cargarOrgsPropias, rpc } from '@/lib/datos';
import { puedeAdministrarOrg, type AsignacionRol, type Dispositivo, type Organizacion, type Tienda } from '@/lib/tipos';
import { SelectorOrg, useOrgActiva } from '@/components/selector-org';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Selector, Tarjeta, Titulo } from '@/components/ui';

const COLOR_ESTADO = { ACTIVO: 'green', PENDIENTE: 'indigo', BLOQUEADO: 'red' } as const;

export default function CelularesCliente({ roles }: { roles: AsignacionRol[] }) {
  const sb = supabaseNavegador();
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [orgId, setOrgId] = useOrgActiva(orgs);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [nuevo, setNuevo] = useState<{ tienda: string; nombre: string } | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const editable = puedeAdministrarOrg(roles, orgId);

  useEffect(() => {
    cargarOrgsPropias(roles).then(setOrgs);
  }, [roles]);

  const cargar = useCallback(async () => {
    if (!orgId) return;
    const [t, d] = await Promise.all([
      sb.from('tiendas').select('*').eq('organizacion_id', orgId).order('codigo'),
      sb.from('dispositivos').select('id, organizacion_id, tienda_id, nombre, estado, codigo_expira, activado_at, ultimo_contacto').eq('organizacion_id', orgId).order('created_at'),
    ]);
    setTiendas((t.data as Tienda[]) || []);
    setDispositivos((d.data as Dispositivo[]) || []);
  }, [orgId, sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async () => {
    if (!nuevo) return;
    setError('');
    if (!nuevo.tienda) return setError('Selecciona la tienda.');
    const r = await rpc<{ codigo: string }>('crear_dispositivo', { p_tienda: nuevo.tienda, p_nombre: nuevo.nombre });
    if (r.error) return setError(r.error);
    setNuevo(null);
    setCodigo(r.data!.codigo);
    cargar();
  };

  const regenerar = async (d: Dispositivo) => {
    if (d.estado === 'ACTIVO' && !confirm('El celular actual dejará de funcionar hasta que se active de nuevo con el código nuevo. ¿Continuar?')) return;
    const r = await rpc<{ codigo: string }>('regenerar_codigo_dispositivo', { p_id: d.id });
    if (r.error) return alert(r.error);
    setCodigo(r.data!.codigo);
    cargar();
  };

  const cambiarEstado = async (d: Dispositivo, bloquear: boolean) => {
    const r = await rpc('cambiar_estado_dispositivo', { p_id: d.id, p_bloquear: bloquear });
    if (r.error) return alert(r.error);
    cargar();
  };

  const fecha = (v: string | null) => (v ? new Date(v).toLocaleString() : '—');
  const urlActivacion = typeof window !== 'undefined' ? `${window.location.origin}/dispositivo/activar` : '/dispositivo/activar';

  return (
    <div>
      <Titulo accion={editable && <Boton onClick={() => { setNuevo({ tienda: tiendas[0]?.id ?? '', nombre: '' }); setError(''); }}>+ Celular</Boton>}>
        Celulares de tienda
      </Titulo>
      <SelectorOrg orgs={orgs} valor={orgId} onCambio={setOrgId} />
      <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
        <p className="font-black">¿Dónde se produce?</p>
        <p className="mt-1">
          La producción, recepción, retornos e inventarios se hacen en la <b>pantalla de tienda</b>, que solo se abre en un celular activado. Para probarla desde
          esta computadora, ábrela en una <b>ventana de incógnito</b> (si la activas aquí mismo se cerrará tu sesión de administrador).
        </p>
        <a href="/dispositivo/activar" target="_blank" rel="noreferrer" className="mt-2 inline-block rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white">
          Abrir pantalla de activación ↗
        </a>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Cada celular queda fijado a una tienda. Se activa abriendo <span className="font-bold">{urlActivacion}</span> en el celular e ingresando el código de 8 caracteres (vence en 24 horas).
      </p>

      <div className="space-y-5">
        {tiendas.map((t) => {
          const lista = dispositivos.filter((d) => d.tienda_id === t.id);
          if (!lista.length) return null;
          return (
            <section key={t.id} className="space-y-2">
              <h2 className="text-sm font-black uppercase tracking-wide text-gray-500">{t.codigo} · {t.nombre}</h2>
              {lista.map((d) => (
                <Tarjeta key={d.id} className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-black">{d.nombre}</p>
                      <Insignia color={COLOR_ESTADO[d.estado]}>{d.estado}</Insignia>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {d.estado === 'PENDIENTE' ? `Código vence: ${fecha(d.codigo_expira)}` : `Activado: ${fecha(d.activado_at)} · Último uso: ${fecha(d.ultimo_contacto)}`}
                    </p>
                  </div>
                  {editable && (
                    <div className="flex shrink-0 flex-col gap-2">
                      <Boton variante="suave" className="px-3 py-2 text-xs" onClick={() => regenerar(d)}>Nuevo código</Boton>
                      {d.estado === 'BLOQUEADO' ? (
                        <Boton variante="secundario" className="px-3 py-2 text-xs" onClick={() => cambiarEstado(d, false)}>Desbloquear</Boton>
                      ) : (
                        <Boton variante="peligro" className="px-3 py-2 text-xs" onClick={() => cambiarEstado(d, true)}>Bloquear</Boton>
                      )}
                    </div>
                  )}
                </Tarjeta>
              ))}
            </section>
          );
        })}
        {dispositivos.length === 0 && <p className="text-sm text-gray-400">Sin celulares registrados.</p>}
      </div>

      {nuevo && (
        <Modal titulo="Registrar celular" onCerrar={() => setNuevo(null)}>
          <Campo etiqueta="Tienda">
            <Selector value={nuevo.tienda} onChange={(e) => setNuevo({ ...nuevo, tienda: e.target.value })}>
              <option value="">Selecciona…</option>
              {tiendas.map((t) => <option key={t.id} value={t.id}>{t.codigo} · {t.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Nombre del celular">
            <Entrada value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Celular bodega" />
          </Campo>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton className="w-full" onClick={crear}>Generar código</Boton>
        </Modal>
      )}

      {codigo && (
        <Modal titulo="Código de activación" onCerrar={() => setCodigo(null)}>
          <p className="text-sm text-gray-600">
            En el celular de la tienda abre <span className="font-bold">{urlActivacion}</span> e ingresa este código. Vence en 24 horas y no se volverá a mostrar.
          </p>
          <p className="select-all rounded-2xl bg-indigo-50 p-4 text-center font-mono text-3xl font-black tracking-widest text-indigo-900">{codigo}</p>
        </Modal>
      )}
    </div>
  );
}
