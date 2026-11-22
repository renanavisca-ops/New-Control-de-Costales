import { obtenerSesion } from '@/lib/perfil';
import { supabaseServidor } from '@/lib/supabase/server';
import { esAdmin } from '@/lib/tipos';

export default async function InicioPage() {
  const { perfil } = await obtenerSesion();
  const sb = await supabaseServidor();
  const [empresas, bodegas, categorias] = await Promise.all([
    sb.from('empresas').select('id', { count: 'exact', head: true }),
    sb.from('bodegas').select('id', { count: 'exact', head: true }).eq('activa', true),
    sb.from('categorias').select('id', { count: 'exact', head: true }).eq('activa', true),
  ]);

  const tarjetas = [
    { etiqueta: 'Empresas', valor: empresas.count ?? 0, color: 'bg-blue-50 text-blue-700' },
    { etiqueta: 'Bodegas', valor: bodegas.count ?? 0, color: 'bg-emerald-50 text-emerald-700' },
    { etiqueta: 'Categorías', valor: categorias.count ?? 0, color: 'bg-orange-50 text-orange-700' },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black tracking-tight">Hola, {perfil?.nombre.split(' ')[0]}</h1>
      <div className="grid grid-cols-3 gap-3">
        {tarjetas.map((t) => (
          <div key={t.etiqueta} className={`rounded-3xl p-4 text-center ${t.color}`}>
            <p className="text-[10px] font-black uppercase tracking-wide">{t.etiqueta}</p>
            <p className="mt-1 text-3xl font-black">{t.valor}</p>
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-dashed border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-800">
        <p className="font-black">Versión 2 en construcción · Fase 1</p>
        <p className="mt-1">
          {esAdmin(perfil?.rol)
            ? 'Ya puedes configurar empresas, bodegas, categorías y usuarios. Recepción, apertura, traslados e inventarios llegan en las próximas fases.'
            : 'Las pantallas de recepción, apertura e inventario llegan en las próximas fases.'}
        </p>
      </div>
    </div>
  );
}
