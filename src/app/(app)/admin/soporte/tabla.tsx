'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { rpc } from '@/lib/datos';
import { Insignia, Tarjeta } from '@/components/ui';

type Acceso = { id: string; organizacion_id: string; motivo: string | null; otorgado_at: string; expira_at: string; revocado_at: string | null };
type Vista = { id: number; organizacion_id: string; ruta: string | null; visto_at: string; administrador_id: string };

/** Accesos de soporte y registro de ingresos. Con orgId filtra a esa organización y permite revocar. */
export default function TablaSoporte({ orgId, puedeRevocar = false, recarga = 0 }: { orgId?: string; puedeRevocar?: boolean; recarga?: number }) {
  const sb = supabaseNavegador();
  const [accesos, setAccesos] = useState<Acceso[]>([]);
  const [vistas, setVistas] = useState<Vista[]>([]);
  const [orgs, setOrgs] = useState<Record<string, string>>({});
  const [admins, setAdmins] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    let qa = sb.from('soporte_accesos').select('*').order('otorgado_at', { ascending: false }).limit(100);
    let qv = sb.from('soporte_vistas').select('*').order('visto_at', { ascending: false }).limit(200);
    if (orgId) {
      qa = qa.eq('organizacion_id', orgId);
      qv = qv.eq('organizacion_id', orgId);
    }
    const [a, v, o, ad] = await Promise.all([qa, qv, sb.from('organizaciones').select('id, nombre'), sb.from('administradores').select('id, nombre, email')]);
    setAccesos((a.data as Acceso[]) || []);
    setVistas((v.data as Vista[]) || []);
    setOrgs(Object.fromEntries(((o.data as { id: string; nombre: string }[]) || []).map((x) => [x.id, x.nombre])));
    setAdmins(Object.fromEntries(((ad.data as { id: string; nombre: string; email: string }[]) || []).map((x) => [x.id, `${x.nombre} (${x.email})`])));
  }, [sb, orgId]);

  useEffect(() => {
    cargar();
  }, [cargar, recarga]);

  const revocar = async (id: string) => {
    if (!confirm('¿Quitar el acceso de soporte ahora?')) return;
    const r = await rpc('revocar_soporte', { p_id: id });
    if (r.error) return alert(r.error);
    cargar();
  };

  const estado = (a: Acceso) =>
    a.revocado_at ? <Insignia color="gray">Revocado</Insignia> : new Date(a.expira_at) > new Date() ? <Insignia color="green">Vigente</Insignia> : <Insignia color="gray">Vencido</Insignia>;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Tarjeta>
        <p className="mb-3 font-black">Accesos otorgados</p>
        {accesos.length === 0 && <p className="text-sm text-gray-400">Ninguno.</p>}
        <div className="divide-y divide-gray-100">
          {accesos.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                {!orgId && <p className="font-black">{orgs[a.organizacion_id] ?? ''}</p>}
                <p className="text-xs text-gray-500">
                  {new Date(a.otorgado_at).toLocaleString()} → {new Date(a.expira_at).toLocaleString()}
                  {a.motivo ? ` · ${a.motivo}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {estado(a)}
                {puedeRevocar && !a.revocado_at && new Date(a.expira_at) > new Date() && (
                  <button onClick={() => revocar(a.id)} className="rounded-xl bg-red-50 px-3 py-1 text-xs font-bold text-red-600">
                    Quitar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Tarjeta>
      <Tarjeta>
        <p className="mb-3 font-black">Ingresos por soporte</p>
        {vistas.length === 0 && <p className="text-sm text-gray-400">Sin ingresos registrados.</p>}
        <div className="divide-y divide-gray-100">
          {vistas.map((v) => (
            <div key={v.id} className="py-2 text-sm">
              <p className="font-bold">{admins[v.administrador_id] ?? 'Superadmin'}</p>
              <p className="text-xs text-gray-500">
                {new Date(v.visto_at).toLocaleString()} · {!orgId && `${orgs[v.organizacion_id] ?? ''} · `}
                {v.ruta}
              </p>
            </div>
          ))}
        </div>
      </Tarjeta>
    </div>
  );
}
