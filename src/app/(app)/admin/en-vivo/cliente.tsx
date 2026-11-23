'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cargarOrgsPropias } from '@/lib/datos';
import type { AsignacionRol, Organizacion } from '@/lib/tipos';
import { SelectorOrg, useOrgActiva } from '@/components/selector-org';
import { Tarjeta, Titulo } from '@/components/ui';

type EnVivo = { tienda_id: string; tienda: string; codigo: string; producto: string | null; empleado: string; iniciado_at: string };
type Hoy = { tienda_id: string; tienda: string; finalizados: number; en_proceso: number };

const minutos = (iso: string) => {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

export default function EnVivoCliente({ roles }: { roles: AsignacionRol[] }) {
  const sb = supabaseNavegador();
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [orgId, setOrgId] = useOrgActiva(orgs);
  const [enVivo, setEnVivo] = useState<EnVivo[]>([]);
  const [hoy, setHoy] = useState<Hoy[]>([]);
  const [actualizado, setActualizado] = useState('');

  useEffect(() => {
    cargarOrgsPropias(roles).then(setOrgs);
  }, [roles]);

  const cargar = useCallback(async () => {
    if (!orgId) return;
    const [a, b] = await Promise.all([sb.rpc('produccion_en_vivo', { p_org: orgId }), sb.rpc('produccion_hoy', { p_org: orgId })]);
    setEnVivo((a.data as EnVivo[]) || []);
    setHoy((b.data as Hoy[]) || []);
    setActualizado(new Date().toLocaleTimeString());
  }, [orgId, sb]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 20000);
    return () => clearInterval(t);
  }, [cargar]);

  return (
    <div className="space-y-4">
      <Titulo>Producción en vivo</Titulo>
      <SelectorOrg orgs={orgs} valor={orgId} onCambio={setOrgId} />
      <p className="text-sm text-gray-500">
        Lo que se está produciendo ahora en las tiendas. Los empleados trabajan desde el celular de su tienda (sección Celulares). Se actualiza cada 20 segundos · {actualizado}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {hoy.map((t) => {
          const lista = enVivo.filter((e) => e.tienda_id === t.tienda_id);
          return (
            <Tarjeta key={t.tienda_id} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-black">{t.tienda}</p>
                <div className="flex gap-2 text-xs font-black">
                  <span className="rounded-full bg-orange-50 px-2 py-1 text-orange-700">{t.en_proceso} en proceso</span>
                  <span className="rounded-full bg-green-50 px-2 py-1 text-green-700">{t.finalizados} hoy</span>
                </div>
              </div>
              {lista.length === 0 ? (
                <p className="text-sm text-gray-400">Nadie produciendo ahora.</p>
              ) : (
                lista.map((e) => (
                  <div key={e.codigo} className="flex items-center justify-between rounded-2xl bg-gray-50 px-3 py-2 text-sm">
                    <div>
                      <p className="font-mono font-black">{e.codigo}</p>
                      <p className="text-xs text-gray-500">{e.producto ?? '—'} · {e.empleado}</p>
                    </div>
                    <span className="text-xs font-bold text-orange-600">{minutos(e.iniciado_at)}</span>
                  </div>
                ))
              )}
            </Tarjeta>
          );
        })}
        {hoy.length === 0 && <p className="text-sm text-gray-400">Sin tiendas.</p>}
      </div>
    </div>
  );
}
