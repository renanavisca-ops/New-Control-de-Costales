'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { Entrada, Selector, Titulo } from '@/components/ui';

type Fila = { organizacion: string; tienda_id: string; tienda: string; producto: string; costales: number; piezas: number; en_camino: number };
const n = (x: number) => Number(x).toLocaleString();

/** Qué tiene cada tienda abastecida, por producto: tabla tiendas × productos. */
export default function StockTiendas({ centroId }: { centroId: string }) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [vista, setVista] = useState<'costales' | 'piezas'>('costales');
  const [org, setOrg] = useState('');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    supabaseNavegador()
      .rpc('centro_stock_tiendas', { p_centro: centroId })
      .then(({ data }: { data: unknown }) => setFilas((data as Fila[]) || []));
  }, [centroId]);

  const orgs = useMemo(() => Array.from(new Set(filas.map((f) => f.organizacion))).sort(), [filas]);
  const visibles = filas.filter((f) => (!org || f.organizacion === org) && f.tienda.toLowerCase().includes(busca.toLowerCase()));
  const productos = useMemo(() => Array.from(new Set(visibles.map((f) => f.producto))).sort(), [visibles]);
  const tiendas = useMemo(() => {
    const m = new Map<string, { tienda: string; organizacion: string; datos: Record<string, Fila> }>();
    visibles.forEach((f) => {
      const t = m.get(f.tienda_id) ?? { tienda: f.tienda, organizacion: f.organizacion, datos: {} };
      t.datos[f.producto] = f;
      m.set(f.tienda_id, t);
    });
    return Array.from(m.values()).sort((a, b) => a.organizacion.localeCompare(b.organizacion) || a.tienda.localeCompare(b.tienda));
  }, [visibles]);
  const valor = (f?: Fila) => (f ? (vista === 'costales' ? f.costales : f.piezas) : 0);
  const totalProd = (p: string) => tiendas.reduce((s, t) => s + valor(t.datos[p]), 0);

  return (
    <div>
      <Titulo>Stock de las tiendas</Titulo>
      <p className="mb-4 text-sm text-gray-500">
        Lo que tiene cada tienda que abastece este centro, por producto: costales sin abrir (en stock). Entre paréntesis, los que van en
        camino.
      </p>
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Selector value={vista} onChange={(e) => setVista(e.target.value as 'costales' | 'piezas')}>
          <option value="costales">Ver costales</option>
          <option value="piezas">Ver piezas</option>
        </Selector>
        <Selector value={org} onChange={(e) => setOrg(e.target.value)}>
          <option value="">Todas las organizaciones</option>
          {orgs.map((o) => <option key={o}>{o}</option>)}
        </Selector>
        <Entrada placeholder="Buscar tienda" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="overflow-x-auto rounded-3xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs font-black uppercase tracking-wide text-gray-500">
            <tr>
              <th className="sticky left-0 bg-gray-50 px-4 py-3">Tienda</th>
              {productos.map((p) => <th key={p} className="whitespace-nowrap px-3 py-3 text-right">{p}</th>)}
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tiendas.map((t) => (
              <tr key={t.tienda}>
                <td className="sticky left-0 bg-white px-4 py-2.5">
                  <p className="whitespace-nowrap font-bold">{t.tienda}</p>
                  <p className="text-[11px] text-gray-400">{t.organizacion}</p>
                </td>
                {productos.map((p) => {
                  const f = t.datos[p];
                  return (
                    <td key={p} className="px-3 py-2.5 text-right font-mono">
                      {valor(f) ? n(valor(f)) : <span className="text-gray-300">0</span>}
                      {f?.en_camino ? <span className="ml-1 text-[11px] text-indigo-500">({f.en_camino})</span> : null}
                    </td>
                  );
                })}
                <td className="px-4 py-2.5 text-right font-mono font-black">{n(productos.reduce((s, p) => s + valor(t.datos[p]), 0))}</td>
              </tr>
            ))}
            {tiendas.length > 0 && (
              <tr className="bg-gray-50 font-black">
                <td className="sticky left-0 bg-gray-50 px-4 py-2.5">Total</td>
                {productos.map((p) => <td key={p} className="px-3 py-2.5 text-right font-mono">{n(totalProd(p))}</td>)}
                <td className="px-4 py-2.5 text-right font-mono">{n(productos.reduce((s, p) => s + totalProd(p), 0))}</td>
              </tr>
            )}
            {tiendas.length === 0 && (
              <tr>
                <td colSpan={productos.length + 2} className="px-4 py-8 text-center text-gray-400">Las tiendas que abastece todavía no tienen costales.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
