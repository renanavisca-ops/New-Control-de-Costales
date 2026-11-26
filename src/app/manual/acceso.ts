import { obtenerContexto } from '@/lib/contexto';
import { esSuperadmin } from '@/lib/tipos';
import type { TipoManual } from './datos';

/** Manuales que puede ver quien está conectado: el de tienda es público; el de organización, administradores; el de plataforma, superadmin. */
export async function manualesPermitidos(): Promise<TipoManual[]> {
  const { contexto } = await obtenerContexto();
  if (contexto.tipo !== 'ADMIN') return ['tienda'];
  const roles = contexto.roles;
  const lista: TipoManual[] = [];
  if (esSuperadmin(roles)) lista.push('plataforma');
  if (roles.some((r) => r.rol !== 'SUPERADMIN') || esSuperadmin(roles)) lista.push('organizacion');
  lista.push('tienda');
  return lista;
}

export const rutaPdf = (tipo: TipoManual) => (tipo === 'tienda' ? '/manuales/manual-tienda.pdf' : `/manual/${tipo}/pdf`);
