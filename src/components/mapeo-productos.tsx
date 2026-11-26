'use client';
import type { Categoria } from '@/lib/tipos';
import type { CostalLeido } from '@/lib/traslado';
import { Selector } from '@/components/ui';

export const CREAR = '__crear__';

/** Resumen por sección del Excel con el producto del sistema que le corresponde. */
export function MapeoProductos({
  costales,
  productos,
  mapa,
  onCambio,
  permitirCrear,
}: {
  costales: CostalLeido[];
  productos: Categoria[];
  mapa: Record<string, string>;
  onCambio: (m: Record<string, string>) => void;
  permitirCrear: boolean;
}) {
  const secciones = new Map<string, { costales: number; piezas: number; peso: number }>();
  costales.forEach((k) => {
    const x = secciones.get(k.seccion) ?? { costales: 0, piezas: 0, peso: 0 };
    x.costales++;
    x.piezas += k.piezas;
    x.peso += k.peso ?? 0;
    secciones.set(k.seccion, x);
  });
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs font-black uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2">En el Excel</th>
            <th className="px-3 py-2">Producto en el sistema</th>
            <th className="px-3 py-2 text-right">Costales</th>
            <th className="px-3 py-2 text-right">Piezas</th>
            <th className="px-3 py-2 text-right">Peso (lb)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {Array.from(secciones.entries()).map(([s, x]) => {
            const prod = productos.find((p) => p.nombre === mapa[s]);
            const promedio = x.piezas / x.costales;
            return (
              <tr key={s}>
                <td className="px-3 py-2 font-bold">{s}</td>
                <td className="px-3 py-2">
                  <Selector value={mapa[s] ?? ''} onChange={(e) => onCambio({ ...mapa, [s]: e.target.value })}>
                    {!permitirCrear && <option value="">Elige el producto…</option>}
                    {permitirCrear && <option value={CREAR}>➕ Crear producto &quot;{s}&quot;</option>}
                    {productos.filter((p) => p.activa).map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                  </Selector>
                  {prod?.piezas_estandar != null && Math.round(promedio) !== prod.piezas_estandar && (
                    <p className="mt-1 text-xs font-bold text-amber-600">
                      Estándar {prod.piezas_estandar} pzs; este archivo trae {Number.isInteger(promedio) ? promedio : promedio.toFixed(1)} por costal.
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono">{x.costales.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-mono">{x.piezas.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-mono">{x.peso.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Producto final de cada costal según el mapeo elegido. */
export const productoDe = (k: CostalLeido, mapa: Record<string, string>) => (mapa[k.seccion] === CREAR ? k.seccion : mapa[k.seccion]);
