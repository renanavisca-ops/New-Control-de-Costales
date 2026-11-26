import Link from 'next/link';
import { MANUALES, type TipoManual } from './datos';
import { manualesPermitidos, rutaPdf } from './acceso';

export const metadata = { title: 'Manuales · Control de Costales' };

export default async function Manuales() {
  const permitidos = await manualesPermitidos();
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-8">
      <p className="text-sm font-black uppercase tracking-widest text-indigo-500">Control de Costales</p>
      <h1 className="mt-1 text-4xl font-black tracking-tight">Manuales de uso</h1>
      <p className="mt-2 text-gray-500">Léelos aquí o descárgalos en PDF para imprimirlos o compartirlos.</p>
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {(Object.keys(MANUALES) as TipoManual[]).filter((t) => permitidos.includes(t)).map((t) => {
          const m = MANUALES[t];
          return (
            <div key={t} className="flex flex-col rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl">{m.icono}</div>
              <h2 className="text-lg font-black">{m.titulo}</h2>
              <p className="mt-1 flex-1 text-sm text-gray-500">{m.para}</p>
              <div className="mt-5 flex gap-2">
                <Link href={`/manual/${t}`} className="flex-1 rounded-2xl bg-indigo-600 px-4 py-2.5 text-center text-sm font-black text-white">Leer</Link>
                <a href={rutaPdf(t)} download className="flex-1 rounded-2xl bg-gray-900 px-4 py-2.5 text-center text-sm font-black text-white">PDF</a>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
