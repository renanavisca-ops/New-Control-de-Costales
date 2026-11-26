'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cargarOrgsPropias } from '@/lib/datos';
import type { AsignacionRol, Organizacion } from '@/lib/tipos';
import { useOrgActiva } from '@/components/selector-org';
import { Entrada, Tarjeta, Titulo } from '@/components/ui';

type Fila = {
  contenedor: string; primera_fecha: string | null; ultima_fecha: string | null;
  costales: number; piezas: number; peso: number;
  en_centro: number; en_transito: number; en_tienda: number; en_produccion: number; producidos: number;
  piezas_producidas: number; diferencia: number;
};

const n = (x: number) => Number(x).toLocaleString();
const fecha = (f: string | null) => (f ? new Date(f + 'T12:00:00').toLocaleDateString() : '—');

export default function ContenedoresCliente({ roles, centroId }: { roles: AsignacionRol[]; centroId?: string }) {
  const sb = supabaseNavegador();
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [orgId] = useOrgActiva(orgs);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    cargarOrgsPropias(roles).then(setOrgs);
  }, [roles]);

  const cargar = useCallback(async () => {
    if (!centroId && !orgId) return;
    const { data } = centroId
      ? await sb.rpc('centro_contenedores', { p_centro: centroId })
      : await sb.rpc('reporte_contenedores', { p_org: orgId });
    setFilas((data as Fila[]) || []);
  }, [orgId, centroId, sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = filas.filter((f) => f.contenedor.toLowerCase().includes(busqueda.toLowerCase()));
  const tot = useMemo(
    () =>
      visibles.reduce(
        (a, f) => ({
          costales: a.costales + f.costales, piezas: a.piezas + f.piezas, en_centro: a.en_centro + f.en_centro,
          enviados: a.enviados + f.en_transito + f.en_tienda + f.en_produccion + f.producidos, producidos: a.producidos + f.producidos,
        }),
        { costales: 0, piezas: 0, en_centro: 0, enviados: 0, producidos: 0 },
      ),
    [visibles],
  );

  return (
    <div>
      <Titulo>Producción por contenedor</Titulo>
      <p className="mb-4 text-sm text-gray-500">
        Costales empacados en el centro de distribución por contenedor (EMBARQUE NO. del reporte de existencias), y dónde está cada uno
        ahora: en el centro, en camino, en la tienda o ya producido.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Cifra e="Contenedores" v={n(visibles.length)} />
        <Cifra e="Costales empacados" v={n(tot.costales)} />
        <Cifra e="Piezas empacadas" v={n(tot.piezas)} />
        <Cifra e="En el centro" v={n(tot.en_centro)} />
        <Cifra e="Enviados · producidos" v={`${n(tot.enviados)} · ${n(tot.producidos)}`} />
      </div>
      <div className="mb-3 max-w-sm">
        <Entrada placeholder="Buscar contenedor (ej. BOS 160)" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>
      <div className="overflow-x-auto rounded-3xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full min-w-[60rem] text-left text-sm">
          <thead className="bg-gray-50 text-xs font-black uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Contenedor</th>
              <th className="px-4 py-3">Empaque</th>
              <th className="px-4 py-3 text-right">Costales</th>
              <th className="px-4 py-3 text-right">Piezas</th>
              <th className="px-4 py-3 text-right">En centro</th>
              <th className="px-4 py-3 text-right">En camino</th>
              <th className="px-4 py-3 text-right">En tienda</th>
              <th className="px-4 py-3 text-right">Produciendo</th>
              <th className="px-4 py-3 text-right">Producidos</th>
              <th className="px-4 py-3 text-right">Dif. piezas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibles.map((f) => {
              const avance = f.costales ? Math.round((100 * f.producidos) / f.costales) : 0;
              return (
                <tr key={f.contenedor}>
                  <td className="px-4 py-3">
                    <p className="font-black">{f.contenedor}</p>
                    <div className="mt-1 h-1.5 w-28 rounded-full bg-gray-100">
                      <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${avance}%` }} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-400">{avance}% producido</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {fecha(f.primera_fecha)}
                    {f.ultima_fecha && f.ultima_fecha !== f.primera_fecha ? ` – ${fecha(f.ultima_fecha)}` : ''}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{n(f.costales)}</td>
                  <td className="px-4 py-3 text-right font-mono">{n(f.piezas)}</td>
                  <td className="px-4 py-3 text-right font-mono">{n(f.en_centro)}</td>
                  <td className="px-4 py-3 text-right font-mono">{n(f.en_transito)}</td>
                  <td className="px-4 py-3 text-right font-mono">{n(f.en_tienda)}</td>
                  <td className="px-4 py-3 text-right font-mono">{n(f.en_produccion)}</td>
                  <td className="px-4 py-3 text-right font-mono">{n(f.producidos)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${f.diferencia < 0 ? 'text-red-600' : f.diferencia > 0 ? 'text-orange-600' : ''}`}>
                    {f.producidos ? (f.diferencia > 0 ? '+' : '') + n(f.diferencia) : '—'}
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                  Sin contenedores. Carga el Reporte de Existencias de Costales en Existencias y traslados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        Dif. piezas = piezas producidas en tienda menos piezas empacadas, solo de los costales ya producidos.
      </p>
    </div>
  );
}

function Cifra({ e, v }: { e: string; v: string }) {
  return (
    <Tarjeta className="p-4">
      <p className="text-[10px] font-black uppercase tracking-wide text-gray-400">{e}</p>
      <p className="mt-1 text-xl font-black">{v}</p>
    </Tarjeta>
  );
}
