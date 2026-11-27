'use client';
import { useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import Escaner from '@/components/escaner';
import { Aviso, Boton, Entrada } from '@/components/ui';

export type ResultadoAuditoria = {
  id: string;
  estado: 'ABIERTA' | 'FINALIZADA';
  auditor: string;
  tienda: string;
  iniciado_at: string;
  finalizado_at: string | null;
  esperados: number;
  encontrados: number;
  leidos: number;
  por_producto: { producto: string; esperados: number; encontrados: number }[];
  faltantes: { codigo: string; producto: string | null; piezas: number | null }[];
  sobrantes: { codigo: string; producto: string | null; estado: string | null; tienda: string | null }[];
};
const ESTADO: Record<string, string> = { EN_TIENDA: 'en stock', EN_TRANSITO: 'en tránsito', EN_PRODUCCION: 'en producción', PRODUCIDO: 'ya producido', VENDIDO: 'vendido', ANULADO: 'anulado' };
type Lectura = { tipo: 'ESPERADO' | 'NO_REPORTADO' | 'YA_LEIDO' | 'ERROR'; codigo: string; info: string | null };

/**
 * Auditoría de inventario con un código temporal generado en el panel.
 * Nada queda guardado en el celular: todo se envía al momento y el reporte queda en el panel.
 */
export default function Auditoria({ onSalir }: { onSalir?: () => void }) {
  const sb = supabaseNavegador();
  const [codigo, setCodigo] = useState('');
  const [acceso, setAcceso] = useState<{ codigo: string; id: string; expira: string } | null>(null);
  const [res, setRes] = useState<ResultadoAuditoria | null>(null);
  const [conteo, setConteo] = useState({ esperados: 0, encontrados: 0, sobrantes: 0 });
  const [ultima, setUltima] = useState<Lectura | null>(null);
  const [historial, setHistorial] = useState<Lectura[]>([]);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [verDetalle, setVerDetalle] = useState(false);

  const llamar = async <T,>(fn: string, args: Record<string, unknown>) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return { ok: false, error: 'Sin internet. La auditoría necesita conexión.' } as T & { ok: boolean; error?: string };
    const { data, error: e } = await sb.rpc(fn, args);
    if (e) return { ok: false, error: e.message } as T & { ok: boolean; error?: string };
    return data as T & { ok: boolean; error?: string };
  };

  const aplicar = (r: ResultadoAuditoria) => {
    setRes(r);
    setConteo({ esperados: r.esperados, encontrados: r.encontrados, sobrantes: r.sobrantes.length });
  };

  const entrar = async () => {
    setOcupado(true);
    setError('');
    const r = await llamar<{ auditoria_id: string; expira: string; resultado: ResultadoAuditoria }>('auditoria_entrar', { p_codigo: codigo });
    setOcupado(false);
    if (!r.ok) return setError(r.error ?? 'No se pudo entrar.');
    setAcceso({ codigo, id: r.auditoria_id, expira: r.expira });
    aplicar(r.resultado);
  };

  const leer = async (costal: string) => {
    if (!acceso) return;
    const r = await llamar<{ tipo: Lectura['tipo']; codigo: string; info: string | null; esperados: number; encontrados: number; sobrantes: number }>(
      'auditoria_leer',
      { p_codigo: acceso.codigo, p_auditoria: acceso.id, p_costal: costal },
    );
    const l: Lectura = r.ok ? { tipo: r.tipo, codigo: r.codigo, info: r.info } : { tipo: 'ERROR', codigo: costal, info: r.error ?? 'Error' };
    if (r.ok) setConteo({ esperados: r.esperados, encontrados: r.encontrados, sobrantes: r.sobrantes });
    if (navigator.vibrate && l.tipo === 'NO_REPORTADO') navigator.vibrate([80, 60, 80]);
    setUltima(l);
    setHistorial((h) => [l, ...h].slice(0, 30));
  };

  const refrescar = async () => {
    if (!acceso) return;
    const r = await llamar<{ resultado: ResultadoAuditoria }>('auditoria_estado', { p_codigo: acceso.codigo, p_auditoria: acceso.id });
    if (!r.ok) return setError(r.error ?? 'Error');
    aplicar(r.resultado);
    setVerDetalle(true);
  };

  const finalizar = async () => {
    if (!acceso || !confirm('¿Finalizar la auditoría? Ya no se podrán escanear más costales.')) return;
    setOcupado(true);
    const r = await llamar<{ resultado: ResultadoAuditoria }>('auditoria_finalizar', { p_codigo: acceso.codigo, p_auditoria: acceso.id });
    setOcupado(false);
    if (!r.ok) return setError(r.error ?? 'Error');
    aplicar(r.resultado);
    setVerDetalle(true);
  };

  const salir = () => {
    setAcceso(null);
    setRes(null);
    setHistorial([]);
    setUltima(null);
    setCodigo('');
    onSalir?.();
  };

  if (!acceso || !res)
    return (
      <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
        <p className="text-lg font-black">🛡️ Auditoría de inventario</p>
        <p className="text-sm text-gray-500">
          Escribe el código de auditoría que te dio el administrador. Vale por tiempo limitado y no queda guardado en este celular.
        </p>
        <Entrada
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="XXXXX-XXXXX"
          autoCapitalize="characters"
          autoComplete="off"
          className="text-center font-mono text-2xl font-black tracking-widest"
        />
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton className="w-full py-4" disabled={ocupado || codigo.replace(/[^A-Z0-9]/g, '').length < 10} onClick={entrar}>
          Entrar
        </Boton>
        {onSalir && (
          <button onClick={onSalir} className="w-full text-sm font-bold text-gray-500">
            Volver
          </button>
        )}
      </section>
    );

  const abierta = res.estado === 'ABIERTA';
  const faltan = conteo.esperados - conteo.encontrados;
  const colorUltima =
    ultima?.tipo === 'ESPERADO' ? 'bg-green-600' : ultima?.tipo === 'YA_LEIDO' ? 'bg-gray-500' : 'bg-red-600';

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-lg font-black">🛡️ Auditoría · {res.tienda}</p>
            <p className="text-xs text-gray-500">
              {res.auditor} · código vence {new Date(acceso.expira).toLocaleString()}
            </p>
          </div>
          <button onClick={salir} className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-black text-white">
            Salir
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-green-50 p-2">
            <p className="text-2xl font-black text-green-700">{conteo.encontrados}</p>
            <p className="text-[11px] font-bold text-green-800">de {conteo.esperados} reportados</p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-2">
            <p className="text-2xl font-black text-amber-700">{faltan}</p>
            <p className="text-[11px] font-bold text-amber-800">sin encontrar</p>
          </div>
          <div className="rounded-2xl bg-red-50 p-2">
            <p className="text-2xl font-black text-red-700">{conteo.sobrantes}</p>
            <p className="text-[11px] font-bold text-red-800">no reportados</p>
          </div>
        </div>
        {abierta ? (
          <>
            <Escaner onCodigo={leer} textoAyuda="Escanea cada costal" />
            {ultima && (
              <div className={`rounded-2xl p-3 text-white ${colorUltima}`}>
                <p className="font-mono text-xl font-black">{ultima.codigo}</p>
                <p className="text-sm font-bold">
                  {ultima.tipo === 'ESPERADO' && `✓ Reportado · ${ultima.info ?? ''}`}
                  {ultima.tipo === 'YA_LEIDO' && 'Ya lo habías escaneado'}
                  {ultima.tipo === 'NO_REPORTADO' && `⚠ No está reportado en esta tienda · ${(ultima.info ?? '').replace(/[A-Z_]{6,}/g, (e) => ESTADO[e] ?? e)}`}
                  {ultima.tipo === 'ERROR' && `✕ ${ultima.info}`}
                </p>
              </div>
            )}
          </>
        ) : (
          <Aviso tipo="exito">Auditoría finalizada. El reporte quedó guardado en el panel de administración.</Aviso>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="grid grid-cols-2 gap-2">
          <Boton variante="suave" onClick={refrescar}>
            Ver comparación
          </Boton>
          {abierta && (
            <Boton disabled={ocupado} onClick={finalizar}>
              Finalizar
            </Boton>
          )}
        </div>
      </section>

      {verDetalle && <DetalleAuditoria r={res} />}

      {abierta && historial.length > 0 && (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-gray-400">Últimos escaneos</p>
          {historial.map((h, i) => (
            <div key={i} className="flex justify-between border-b border-gray-50 py-1 text-xs">
              <span className="font-mono font-bold">{h.codigo}</span>
              <span className={h.tipo === 'ESPERADO' ? 'text-green-700' : h.tipo === 'YA_LEIDO' ? 'text-gray-400' : 'text-red-600'}>
                {h.tipo === 'ESPERADO' ? '✓ reportado' : h.tipo === 'YA_LEIDO' ? 'repetido' : h.tipo === 'NO_REPORTADO' ? '⚠ no reportado' : '✕ error'}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/** Comparación por producto, faltantes y sobrantes (se usa en el celular y en el reporte imprimible). */
export function DetalleAuditoria({ r }: { r: ResultadoAuditoria }) {
  return (
    <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm print:shadow-none">
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-gray-400">Por producto</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400">
              <th className="py-1">Producto</th>
              <th className="py-1 text-right">Reportados</th>
              <th className="py-1 text-right">Encontrados</th>
              <th className="py-1 text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {r.por_producto.map((p) => (
              <tr key={p.producto} className="border-t border-gray-100">
                <td className="py-1 font-bold">{p.producto}</td>
                <td className="py-1 text-right">{p.esperados}</td>
                <td className="py-1 text-right">{p.encontrados}</td>
                <td className={`py-1 text-right font-black ${p.encontrados < p.esperados ? 'text-red-600' : 'text-green-700'}`}>
                  {p.encontrados - p.esperados}
                </td>
              </tr>
            ))}
            {r.por_producto.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2 text-gray-400">La tienda no tenía costales reportados en stock.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-red-500">Reportados no encontrados ({r.faltantes.length})</p>
        {r.faltantes.length === 0 && <p className="text-sm text-gray-400">Ninguno.</p>}
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 print:grid-cols-3">
          {r.faltantes.map((f) => (
            <div key={f.codigo} className="flex justify-between rounded-xl bg-red-50 px-3 py-1 text-xs">
              <span className="font-mono font-bold">{f.codigo}</span>
              <span>{f.producto ?? '—'}{f.piezas ? ` · ${f.piezas} pzs` : ''}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-amber-600">Encontrados no reportados ({r.sobrantes.length})</p>
        {r.sobrantes.length === 0 && <p className="text-sm text-gray-400">Ninguno.</p>}
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 print:grid-cols-3">
          {r.sobrantes.map((s) => (
            <div key={s.codigo} className="flex justify-between rounded-xl bg-amber-50 px-3 py-1 text-xs">
              <span className="font-mono font-bold">{s.codigo}</span>
              <span>{s.estado ? `${s.producto ?? ''} · ${s.tienda ?? ''} · ${ESTADO[s.estado] ?? s.estado}` : 'No existe en el sistema'}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
