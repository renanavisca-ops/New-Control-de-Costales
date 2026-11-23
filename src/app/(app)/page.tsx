import { obtenerContexto } from '@/lib/contexto';
import { supabaseServidor } from '@/lib/supabase/server';

export default async function InicioPage() {
  const { contexto } = await obtenerContexto();
  const sb = await supabaseServidor();
  const contar = async (tabla: string) => (await sb.from(tabla).select('id', { count: 'exact', head: true })).count ?? 0;
  const [orgs, tiendas, empleados, celulares] = await Promise.all([
    contar('organizaciones'),
    contar('tiendas'),
    contar('empleados'),
    contar('dispositivos'),
  ]);
  const nombre = contexto.tipo === 'ADMIN' ? contexto.admin.nombre.split(' ')[0] : '';

  const tarjetas = [
    { etiqueta: 'Organizaciones', valor: orgs, color: 'bg-blue-50 text-blue-700' },
    { etiqueta: 'Tiendas', valor: tiendas, color: 'bg-emerald-50 text-emerald-700' },
    { etiqueta: 'Empleados', valor: empleados, color: 'bg-orange-50 text-orange-700' },
    { etiqueta: 'Celulares', valor: celulares, color: 'bg-purple-50 text-purple-700' },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black tracking-tight">Hola, {nombre}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tarjetas.map((t) => (
          <div key={t.etiqueta} className={`rounded-3xl p-4 text-center ${t.color}`}>
            <p className="text-[10px] font-black uppercase tracking-wide">{t.etiqueta}</p>
            <p className="mt-1 text-3xl font-black">{t.valor}</p>
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-dashed border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-800">
        <p className="font-black">Primeros pasos</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Crea o revisa la organización y sus tiendas (marca el centro de distribución).</li>
          <li>Carga los productos desde Excel.</li>
          <li>Crea los empleados de cada tienda (código + PIN).</li>
          <li>Registra el celular de cada tienda y actívalo con el código de 8 caracteres.</li>
        </ol>
      </div>
    </div>
  );
}
