'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc } from '@/lib/datos';
import Escaner from '@/components/escaner';
import { Aviso, Boton, Entrada, Selector, Tarjeta, Titulo } from '@/components/ui';

type Datos = {
  stock: { producto: string; costales: number; piezas: number }[];
  ventas: { codigo: string; producto: string | null; piezas: number | null; contenedor: string | null; vendido_at: string; vendido_por: string | null }[];
};
type Lectura = { ok: boolean; codigo: string; producto?: string; piezas?: number; error?: string };

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
const n = (x: number) => Number(x).toLocaleString();

export default function VentasLocales({ bodegas }: { bodegas: { id: string; codigo: string; nombre: string }[] }) {
  const [bodega, setBodega] = useState(bodegas[0]?.id ?? '');
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());
  const [datos, setDatos] = useState<Datos | null>(null);
  const [ultima, setUltima] = useState<Lectura | null>(null);
  const [error, setError] = useState('');
  const ocupado = useRef(false);

  const cargar = useCallback(async () => {
    if (!bodega) return;
    const r = await rpc<Datos>('ventas_locales', { p_tienda: bodega, p_desde: desde, p_hasta: hasta });
    if (r.error) return setError(r.error);
    setDatos(r.data ?? null);
  }, [bodega, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const vender = async (codigo: string) => {
    if (!bodega || ocupado.current) return;
    ocupado.current = true;
    const r = await rpc<Lectura>('vender_costal', { p_tienda: bodega, p_codigo: codigo });
    ocupado.current = false;
    if (r.error) return setError(r.error);
    setError('');
    setUltima(r.data ?? null);
    cargar();
  };

  const deshacer = async (codigo: string) => {
    if (!confirm(`¿Deshacer la venta de ${codigo}? Vuelve a quedar disponible en la bodega.`)) return;
    const r = await rpc('anular_venta', { p_tienda: bodega, p_codigo: codigo });
    if (r.error) return alert(r.error);
    setUltima(null);
    cargar();
  };

  if (!bodegas.length)
    return (
      <div>
        <Titulo>Ventas locales</Titulo>
        <Aviso tipo="info">
          No hay una bodega de ventas locales. Créala en el área de la organización → Sucursales, marcando &quot;Bodega de ventas locales&quot; (ej. B037).
        </Aviso>
      </div>
    );

  const totC = datos?.stock.reduce((s, x) => s + x.costales, 0) ?? 0;
  const totP = datos?.stock.reduce((s, x) => s + x.piezas, 0) ?? 0;

  return (
    <div>
      <Titulo>Ventas locales</Titulo>
      <p className="mb-4 text-sm text-gray-500">
        Los costales que el centro traslada a la bodega de ventas locales quedan disponibles aquí. Escanea cada costal al venderlo (lector USB o
        Bluetooth, o escribe el código y pulsa OK).
      </p>
      {bodegas.length > 1 && (
        <div className="mb-4 max-w-sm">
          <Selector value={bodega} onChange={(e) => setBodega(e.target.value)}>
            {bodegas.map((b) => <option key={b.id} value={b.id}>{b.codigo} · {b.nombre}</option>)}
          </Selector>
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Tarjeta className="space-y-4 xl:col-span-2">
          <p className="font-black">Vender costal</p>
          <Escaner onCodigo={vender} textoAyuda="Escanea o escribe el costal vendido" />
          {error && <Aviso tipo="error">{error}</Aviso>}
          {ultima &&
            (ultima.ok ? (
              <Aviso tipo="exito">
                ✓ {ultima.codigo} vendido · {ultima.producto ?? 'Sin producto'}
                {ultima.piezas ? ` · ${ultima.piezas} pzs` : ''}
              </Aviso>
            ) : (
              <Aviso tipo="error">
                {ultima.codigo}: {ultima.error}
              </Aviso>
            ))}
          <div className="flex flex-wrap items-end gap-2 pt-2">
            <p className="mr-auto text-sm font-black">
              Ventas · {n(datos?.ventas.length ?? 0)} costales · {n(datos?.ventas.reduce((s, v) => s + (v.piezas ?? 0), 0) ?? 0)} pzs
            </p>
            <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
            <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
          </div>
          <div className="max-h-[28rem] overflow-y-auto rounded-2xl border border-gray-100">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs font-black uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Costal</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Piezas</th>
                  <th className="px-3 py-2">Vendido</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {datos?.ventas.map((v) => (
                  <tr key={v.codigo}>
                    <td className="px-3 py-2 font-mono font-bold">{v.codigo}</td>
                    <td className="px-3 py-2">{v.producto}<span className="ml-1 text-xs text-gray-400">{v.contenedor ?? ''}</span></td>
                    <td className="px-3 py-2 text-right font-mono">{v.piezas}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{new Date(v.vendido_at).toLocaleString()} · {v.vendido_por ?? ''}</td>
                    <td className="px-3 py-2 text-right">
                      <Boton variante="suave" className="px-2 py-1 text-xs" onClick={() => deshacer(v.codigo)}>Deshacer</Boton>
                    </td>
                  </tr>
                ))}
                {datos && datos.ventas.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">Sin ventas en estas fechas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Tarjeta>
        <Tarjeta className="space-y-2">
          <p className="text-xs font-black uppercase tracking-wide text-gray-400">Disponible en la bodega · {n(totC)} costales · {n(totP)} pzs</p>
          {datos?.stock.map((s) => (
            <div key={s.producto} className="flex justify-between border-b border-gray-100 py-1.5 text-sm">
              <span className="font-bold">{s.producto}</span>
              <span className="font-mono text-gray-600">{n(s.costales)} · {n(s.piezas)} pzs</span>
            </div>
          ))}
          {datos && datos.stock.length === 0 && <p className="text-sm text-gray-400">Sin costales. Carga el traslado del centro a esta bodega en Existencias y traslados.</p>}
        </Tarjeta>
      </div>
    </div>
  );
}
