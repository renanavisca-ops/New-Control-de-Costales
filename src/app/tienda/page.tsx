import { redirect } from 'next/navigation';
import { obtenerContexto } from '@/lib/contexto';
import Cliente from './cliente';

export default async function TiendaPage() {
  const { autenticado, contexto } = await obtenerContexto();
  if (!autenticado) redirect('/dispositivo/activar');
  if (contexto.tipo !== 'DISPOSITIVO') redirect('/');
  if (contexto.dispositivo.estado !== 'ACTIVO') {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm space-y-3 rounded-3xl bg-white p-8 text-center shadow">
          <h1 className="text-xl font-black">Celular bloqueado</h1>
          <p className="text-sm text-gray-500">Este celular fue bloqueado por un administrador. Pide un código nuevo para activarlo.</p>
          <a href="/dispositivo/activar" className="inline-block rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white">Activar con código nuevo</a>
        </div>
      </main>
    );
  }
  return <Cliente tienda={contexto.tienda} organizacion={contexto.organizacion} dispositivo={contexto.dispositivo} />;
}
