import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MANUALES, type TipoManual } from '../datos';
import Volver from '../volver';

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(MANUALES).map((tipo) => ({ tipo }));
}

export async function generateMetadata({ params }: { params: Promise<{ tipo: string }> }): Promise<Metadata> {
  const m = MANUALES[(await params).tipo as TipoManual];
  return { title: m ? `${m.titulo} · Control de Costales` : 'Manual' };
}

export default async function PaginaManual({ params }: { params: Promise<{ tipo: string }> }) {
  const tipo = (await params).tipo as TipoManual;
  const m = MANUALES[tipo];
  if (!m) notFound();
  const Contenido = m.Contenido;
  return (
    <main className="manual mx-auto w-full max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
      <div className="no-imprimir mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-5">
          <Volver />
          <Link href="/manual" className="text-sm font-bold text-gray-500">Todos los manuales</Link>
        </div>
        <a href={`/manuales/${m.pdf}`} download className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-200">
          ⬇ Descargar PDF
        </a>
      </div>

      <header className="manual-portada mb-10 rounded-[2rem] bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 text-white sm:p-12">
        <p className="text-sm font-black uppercase tracking-widest text-indigo-200">Control de Costales</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">{m.titulo}</h1>
        <p className="mt-3 max-w-2xl text-lg text-indigo-100">{m.para}</p>
        <p className="mt-6 text-xs font-semibold text-indigo-200">Versión {m.version} · new-control-de-costales.vercel.app</p>
      </header>

      <nav className="manual-indice mb-10 rounded-3xl border border-gray-200 bg-white p-6">
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-gray-400">Contenido</p>
        <ol className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          {m.secciones.map(([id, t], i) => (
            <li key={id}>
              <a href={`#${id}`} className="font-semibold text-gray-700 hover:text-indigo-600">
                <span className="mr-2 font-black text-indigo-500">{i + 1}.</span>
                {t}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="rounded-3xl bg-white p-6 sm:p-10">
        <Contenido />
      </article>

      <p className="mt-8 text-center text-xs text-gray-400">Las capturas usan datos de ejemplo (Empresa Demo, S.A.).</p>
    </main>
  );
}
