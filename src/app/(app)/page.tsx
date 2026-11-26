import { redirect } from 'next/navigation';
import { obtenerArea } from '@/lib/contexto';
import { supabaseServidor } from '@/lib/supabase/server';

export default async function InicioPage() {
  const { contexto, activa } = await obtenerArea();
  if (activa?.modo === 'PLATAFORMA') redirect('/plataforma');
  if (activa?.modo === 'CENTRO') redirect('/centro');
  if (!activa || activa.modo === 'SIN_ACCESO') return null; // la franja superior explica la falta de acceso

  const sb = await supabaseServidor();
  const org = activa.id;
  const contar = async (tabla: string, extra?: (q: any) => any) => {
    let q = sb.from(tabla).select('id', { count: 'exact', head: true }).eq('organizacion_id', org);
    if (extra) q = extra(q);
    return (await q).count ?? 0;
  };
  const [sucursales, stock, enProceso, empleados, celulares] = await Promise.all([
    contar('tiendas'),
    contar('costales', (q) => q.eq('estado', 'EN_TIENDA')),
    contar('costales', (q) => q.eq('estado', 'EN_PRODUCCION')),
    contar('empleados', (q) => q.eq('activo', true)),
    contar('dispositivos', (q) => q.eq('estado', 'ACTIVO')),
  ]);
  const nombre = contexto.tipo === 'ADMIN' ? contexto.admin.nombre.split(' ')[0] : '';

  const tarjetas = [
    { etiqueta: 'Sucursales', valor: sucursales, color: 'bg-blue-50 text-blue-700' },
    { etiqueta: 'Costales en stock', valor: stock, color: 'bg-emerald-50 text-emerald-700' },
    { etiqueta: 'En producción', valor: enProceso, color: 'bg-orange-50 text-orange-700' },
    { etiqueta: 'Empleados', valor: empleados, color: 'bg-purple-50 text-purple-700' },
    { etiqueta: 'Celulares activos', valor: celulares, color: 'bg-pink-50 text-pink-700' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Hola, {nombre}</h1>
        <p className="text-sm font-semibold text-gray-400">{activa.nombre}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {tarjetas.map((t) => (
          <div key={t.etiqueta} className={`rounded-3xl p-4 text-center ${t.color}`}>
            <p className="text-[10px] font-black uppercase tracking-wide">{t.etiqueta}</p>
            <p className="mt-1 text-3xl font-black">{t.valor}</p>
          </div>
        ))}
      </div>
      {activa.modo === 'MIEMBRO' && activa.roles.includes('ADMIN_ORG') && (
        <div className="rounded-3xl border border-dashed border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-800">
          <p className="font-black">Primeros pasos</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Crea tus sucursales en Sucursales (marca el centro de distribución si tienes uno).</li>
            <li>Carga los productos desde Excel.</li>
            <li>Crea los empleados de cada sucursal (código + PIN).</li>
            <li>Registra el celular de cada sucursal y actívalo con el código de 8 caracteres.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
