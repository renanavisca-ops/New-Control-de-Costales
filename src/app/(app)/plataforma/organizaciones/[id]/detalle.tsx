'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseNavegador } from '@/lib/supabase/client';
import { traducirError } from '@/lib/datos';
import type { AsignacionRol, Organizacion, Tienda } from '@/lib/tipos';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Selector, Tarjeta } from '@/components/ui';
import UsuariosCliente from '../../../admin/usuarios/cliente';

export default function DetalleOrgPlataforma({ org, roles, miId }: { org: Organizacion; roles: AsignacionRol[]; miId: string }) {
  const sb = supabaseNavegador();
  const [datos, setDatos] = useState({ nombre: org.nombre, activa: org.activa });
  const [guardado, setGuardado] = useState('');
  const [centros, setCentros] = useState<Tienda[]>([]);
  const [todas, setTodas] = useState<Organizacion[]>([]);
  const [abast, setAbast] = useState<{ centro_id: string; organizacion_id: string }[]>([]);
  const [agregar, setAgregar] = useState<{ centro: string; orgs: string[] } | null>(null);

  const cargar = useCallback(async () => {
    const [c, o, a] = await Promise.all([
      sb.from('tiendas').select('*').eq('es_central', true).order('codigo'),
      sb.from('organizaciones').select('*').order('nombre'),
      sb.from('abastecimientos').select('centro_id, organizacion_id'),
    ]);
    setCentros((c.data as Tienda[]) || []);
    setTodas((o.data as Organizacion[]) || []);
    setAbast(a.data || []);
  }, [sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    setGuardado('');
    const { error } = await sb.from('organizaciones').update({ nombre: datos.nombre.trim(), activa: datos.activa }).eq('id', org.id);
    setGuardado(error ? traducirError(error.message) : 'Guardado.');
  };

  const alternar = async (centroId: string, activo: boolean, orgId = org.id) => {
    const { error } = activo
      ? await sb.from('abastecimientos').delete().eq('centro_id', centroId).eq('organizacion_id', orgId)
      : await sb.from('abastecimientos').insert({ centro_id: centroId, organizacion_id: orgId });
    if (error) alert(traducirError(error.message));
    cargar();
  };

  const quitarCliente = async (centroId: string, orgId: string) => {
    if (!confirm(`¿Dejar de abastecer a ${nombreOrg(orgId)}? Ya no podrá recibir traslados de este centro.`)) return;
    alternar(centroId, true, orgId);
  };

  const guardarClientes = async () => {
    if (!agregar || !agregar.orgs.length) return;
    const { error } = await sb.from('abastecimientos').insert(agregar.orgs.map((o) => ({ centro_id: agregar.centro, organizacion_id: o })));
    if (error) return alert(traducirError(error.message));
    setAgregar(null);
    cargar();
  };

  const propios = centros.filter((c) => c.organizacion_id === org.id);
  const ajenos = centros.filter((c) => c.organizacion_id !== org.id);
  const nombreOrg = (id: string) => todas.find((o) => o.id === id)?.nombre ?? '';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/plataforma" className="text-xs font-bold uppercase text-gray-400 hover:text-amber-600">
          ← Organizaciones
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight">{org.nombre}</h1>
          <Insignia>{org.prefijo_empleado}</Insignia>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Tarjeta className="space-y-3">
          <p className="font-black">Datos de la organización</p>
          <Campo etiqueta="Nombre">
            <Entrada value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
          </Campo>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={datos.activa} onChange={(e) => setDatos({ ...datos, activa: e.target.checked })} />
            Activa
          </label>
          {guardado && <Aviso tipo={guardado === 'Guardado.' ? 'exito' : 'error'}>{guardado}</Aviso>}
          <Boton onClick={guardar}>Guardar</Boton>
        </Tarjeta>

        <Tarjeta className="space-y-3">
          <p className="font-black">Quién la abastece</p>
          <p className="text-xs text-gray-500">
            Centros de distribución que despachan a esta organización. Su propio centro (si lo tiene) la abastece siempre; aquí agregas centros de otras organizaciones.
          </p>
          {propios.length > 0 && (
            <p className="text-sm">
              <b>Centros propios:</b> {propios.map((c) => `${c.codigo} · ${c.nombre}`).join(', ')}
            </p>
          )}
          <div className="space-y-1">
            {ajenos.length === 0 && <p className="text-sm text-gray-400">No hay centros de otras organizaciones.</p>}
            {ajenos.map((c) => {
              const activo = abast.some((a) => a.centro_id === c.id && a.organizacion_id === org.id);
              return (
                <label key={c.id} className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={activo} onChange={() => alternar(c.id, activo)} />
                  {c.codigo} · {c.nombre} <span className="text-gray-400">({nombreOrg(c.organizacion_id)})</span>
                </label>
              );
            })}
          </div>
        </Tarjeta>
      </div>

      <Tarjeta className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-black">Sus centros de distribución abastecen a</p>
            <p className="text-xs text-gray-500">
              Organizaciones a las que los centros de {org.nombre} envían traslados. El centro verá las sucursales de esas organizaciones para poder despacharles.
            </p>
          </div>
          {propios.length > 0 && (
            <Boton onClick={() => setAgregar({ centro: propios[0].id, orgs: [] })}>+ Abastecer a otra organización</Boton>
          )}
        </div>
        {propios.length === 0 && (
          <Aviso tipo="info">
            {org.nombre} no tiene centro de distribución. Su administrador lo crea en Sucursales marcando &quot;Es centro de distribución&quot;.
          </Aviso>
        )}
        {propios.map((c) => {
          const clientes = abast.filter((a) => a.centro_id === c.id).map((a) => a.organizacion_id);
          return (
            <div key={c.id} className="rounded-2xl bg-gray-50 p-4">
              <p className="mb-2 text-sm font-black">
                {c.codigo} · {c.nombre}
              </p>
              {clientes.length === 0 && <p className="text-sm text-gray-400">Solo abastece a {org.nombre}.</p>}
              <div className="flex flex-wrap gap-2">
                {clientes.map((o) => (
                  <span key={o} className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-bold shadow-sm">
                    {nombreOrg(o)}
                    <button onClick={() => quitarCliente(c.id, o)} className="text-xs font-black text-red-500" title="Quitar">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </Tarjeta>

      <UsuariosCliente roles={roles} miId={miId} modoPlataforma orgFijaId={org.id} />

      {agregar && (
        <Modal titulo="Abastecer a otra organización" onCerrar={() => setAgregar(null)}>
          {propios.length > 1 && (
            <Campo etiqueta="Centro de distribución">
              <Selector value={agregar.centro} onChange={(e) => setAgregar({ centro: e.target.value, orgs: [] })}>
                {propios.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}
              </Selector>
            </Campo>
          )}
          {(() => {
            const disponibles = todas.filter(
              (o) => o.id !== org.id && !abast.some((a) => a.centro_id === agregar.centro && a.organizacion_id === o.id),
            );
            if (todas.filter((o) => o.id !== org.id).length === 0)
              return (
                <Aviso tipo="info">
                  Todavía no hay otras organizaciones. Créala en{' '}
                  <Link href="/plataforma" className="font-black underline">Mi plataforma → + Organización</Link> y vuelve aquí.
                </Aviso>
              );
            if (disponibles.length === 0) return <Aviso tipo="info">Este centro ya abastece a todas las demás organizaciones.</Aviso>;
            return (
              <Campo etiqueta="Organizaciones">
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-2xl bg-gray-50 p-3">
                  {disponibles.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={agregar.orgs.includes(o.id)}
                        onChange={() =>
                          setAgregar({
                            ...agregar,
                            orgs: agregar.orgs.includes(o.id) ? agregar.orgs.filter((x) => x !== o.id) : [...agregar.orgs, o.id],
                          })
                        }
                      />
                      {o.nombre}
                    </label>
                  ))}
                </div>
              </Campo>
            );
          })()}
          <Boton className="w-full" disabled={!agregar.orgs.length} onClick={guardarClientes}>
            Guardar
          </Boton>
        </Modal>
      )}
    </div>
  );
}
