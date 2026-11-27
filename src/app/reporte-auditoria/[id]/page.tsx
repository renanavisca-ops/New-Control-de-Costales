'use client';
import { use, useEffect, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { DetalleAuditoria, type ResultadoAuditoria } from '@/components/auditoria';

export default function ReporteAuditoria({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [r, setR] = useState<ResultadoAuditoria | null | undefined>(undefined);

  useEffect(() => {
    supabaseNavegador()
      .rpc('auditoria_reporte', { p_auditoria: id })
      .then(({ data }: { data: unknown }) => setR((data as ResultadoAuditoria) ?? null));
  }, [id]);

  if (r === undefined) return <p className="p-6 text-sm text-gray-400">Cargando…</p>;
  if (r === null) return <p className="p-6 text-sm text-red-600">Reporte no encontrado o sin permiso.</p>;
  const pct = r.esperados ? Math.round((r.encontrados / r.esperados) * 100) : 100;

  return (
    <main className="mx-auto max-w-4xl space-y-4 bg-white p-6">
      <div className="no-imprimir flex justify-between">
        <a href="/admin/auditorias" className="text-sm font-bold text-indigo-600">← Auditorías</a>
        <button onClick={() => window.print()} className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white">🖨️ Imprimir</button>
      </div>
      <header className="border-b pb-3">
        <p className="text-xs font-black uppercase tracking-wide text-gray-400">Reporte de auditoría de inventario</p>
        <h1 className="text-2xl font-black">{r.tienda}</h1>
        <p className="text-sm text-gray-600">
          Auditor: <b>{r.auditor}</b> · Inicio: {new Date(r.iniciado_at).toLocaleString()}
          {r.finalizado_at ? ` · Fin: ${new Date(r.finalizado_at).toLocaleString()}` : ' · EN CURSO'}
        </p>
      </header>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ['Reportados en sistema', r.esperados],
          ['Encontrados', `${r.encontrados} (${pct}%)`],
          ['Reportados no encontrados', r.faltantes.length],
          ['Encontrados no reportados', r.sobrantes.length],
        ].map(([t, v]) => (
          <div key={String(t)} className="rounded-2xl border p-2">
            <p className="text-xl font-black">{v}</p>
            <p className="text-[11px] font-bold text-gray-500">{t}</p>
          </div>
        ))}
      </div>
      <DetalleAuditoria r={r} />
      <div className="grid grid-cols-2 gap-8 pt-10 text-center text-xs text-gray-500">
        <p className="border-t pt-1">Firma del auditor</p>
        <p className="border-t pt-1">Firma del encargado de tienda</p>
      </div>
    </main>
  );
}
