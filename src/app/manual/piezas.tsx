import type { ReactNode } from 'react';

/** Bloques comunes de los manuales (pantalla y PDF). */
export function Seccion({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} className="manual-seccion mt-12 first:mt-0">
      <h2 className="mb-4 border-b-2 border-indigo-100 pb-2 text-2xl font-black tracking-tight text-gray-900">{titulo}</h2>
      <div className="space-y-4 text-[1.02rem] leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

export function Sub({ children }: { children: ReactNode }) {
  return <h3 className="manual-sub pt-2 text-lg font-black text-gray-900">{children}</h3>;
}

export function Pasos({ children }: { children: ReactNode }) {
  return <ol className="manual-pasos list-decimal space-y-2 pl-6 marker:font-black marker:text-indigo-600">{children}</ol>;
}

export function Lista({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-6 marker:text-indigo-400">{children}</ul>;
}

export function Nota({ tipo = 'info', children }: { tipo?: 'info' | 'aviso'; children: ReactNode }) {
  const c = tipo === 'aviso' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-indigo-200 bg-indigo-50 text-indigo-900';
  return <div className={`manual-nota rounded-2xl border-l-4 p-4 text-sm font-medium ${c}`}>{children}</div>;
}

/** Captura de pantalla. `movil` = captura de celular (más angosta). */
export function Figura({ img, pie, movil = false }: { img: string; pie: string; movil?: boolean }) {
  return (
    <figure className={`manual-figura mx-auto my-6 ${movil ? 'max-w-[18rem]' : 'max-w-full'}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/manuales/img/${img}.jpg`} alt={pie} className="w-full rounded-2xl border border-gray-200 shadow-md" loading="lazy" />
      <figcaption className="mt-2 text-center text-xs font-semibold text-gray-500">{pie}</figcaption>
    </figure>
  );
}

/** Dos capturas de celular lado a lado. */
export function Par({ children }: { children: ReactNode }) {
  return <div className="manual-par grid grid-cols-1 gap-4 sm:grid-cols-2 [&_figure]:my-2">{children}</div>;
}

export function Tabla({ cols, filas }: { cols: string[]; filas: ReactNode[][] }) {
  return (
    <div className="manual-tabla overflow-x-auto rounded-2xl border border-gray-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs font-black uppercase tracking-wide text-gray-500">
          <tr>{cols.map((c) => <th key={c} className="px-4 py-2.5">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas.map((f, i) => (
            <tr key={i}>{f.map((c, j) => <td key={j} className={`px-4 py-2.5 align-top ${j === 0 ? 'font-bold text-gray-900' : ''}`}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const B = ({ children }: { children: ReactNode }) => <b className="font-bold text-gray-900">{children}</b>;
