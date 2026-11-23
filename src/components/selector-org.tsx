'use client';
import { useEffect, useState } from 'react';
import type { Organizacion } from '@/lib/tipos';
import { Selector } from '@/components/ui';

const CLAVE = 'cc_org_activa';

/** Deja una organización como activa (la usan todas las pantallas del panel). */
export function fijarOrgActiva(id: string) {
  try {
    localStorage.setItem(CLAVE, id);
  } catch {
    /* sin almacenamiento */
  }
}

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
  if (orgs.length === 0) return null;
  if (orgs.length === 1)
    return (
      <div className="mb-4 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Organización · </span>
        <span className="font-black">{orgs[0].nombre}</span>
      </div>
    );
  return (
    <div className="mb-4">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400">Organización</span>
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
