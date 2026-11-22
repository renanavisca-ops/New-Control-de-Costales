'use client';
import { useEffect, useState } from 'react';
import type { Organizacion } from '@/lib/tipos';
import { Selector } from '@/components/ui';

const CLAVE = 'cc_org_activa';

/** Organización activa elegida por el usuario (recordada en el navegador). */
export function useOrgActiva(orgs: Organizacion[]) {
  const [orgId, setOrgId] = useState<string | null>(null);
  useEffect(() => {
    if (!orgs.length) return;
    let guardada: string | null = null;
    try {
      guardada = localStorage.getItem(CLAVE);
    } catch {
      /* sin almacenamiento */
    }
    setOrgId((actual) => {
      if (actual && orgs.some((o) => o.id === actual)) return actual;
      if (guardada && orgs.some((o) => o.id === guardada)) return guardada;
      return orgs[0].id;
    });
  }, [orgs]);
  const elegir = (id: string) => {
    setOrgId(id);
    try {
      localStorage.setItem(CLAVE, id);
    } catch {
      /* sin almacenamiento */
    }
  };
  return [orgId, elegir] as const;
}

export function SelectorOrg({ orgs, valor, onCambio }: { orgs: Organizacion[]; valor: string | null; onCambio: (id: string) => void }) {
  if (orgs.length <= 1) return null;
  return (
    <div className="mb-4">
      <Selector value={valor ?? ''} onChange={(e) => onCambio(e.target.value)}>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </Selector>
    </div>
  );
}
