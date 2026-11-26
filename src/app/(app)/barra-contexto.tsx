'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { OpcionArea } from '@/lib/tipos';

/** Franja superior: indica el modo soporte (solo lectura) y registra el ingreso en la auditoría de la organización. */
export default function BarraContexto({ activa }: { activa: OpcionArea | null }) {
  const ruta = usePathname();
  const router = useRouter();
  // En el área de un centro de distribución, las pantallas de la organización no aplican
  useEffect(() => {
    if (activa?.modo === 'CENTRO' && (ruta.startsWith('/admin') || ruta.startsWith('/plataforma'))) router.replace('/centro');
  }, [activa, ruta, router]);
  useEffect(() => {
    if (activa?.modo === 'SOPORTE') void supabaseNavegador().rpc('registrar_vista_soporte', { p_org: activa.id, p_ruta: ruta });
  }, [activa, ruta]);

  if (activa?.modo === 'SOPORTE')
    return (
      <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900">
        🛟 <b>Modo soporte · solo lectura</b> en {activa.nombre}. Acceso otorgado por la organización hasta{' '}
        {activa.soporteHasta ? new Date(activa.soporteHasta).toLocaleString() : '—'}. Tus ingresos quedan registrados.
      </div>
    );
  if (activa?.modo === 'SIN_ACCESO')
    return (
      <div className="mb-5 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700">
        🔒 No tienes acceso a <b>{activa.nombre}</b>. Un administrador de esa organización puede darte acceso de soporte de solo lectura desde
        &quot;Acceso de soporte&quot;.
      </div>
    );
  return null;
}
