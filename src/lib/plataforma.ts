import { redirect } from 'next/navigation';
import { obtenerArea } from '@/lib/contexto';
import { esSuperadmin } from '@/lib/tipos';

/** Exige superadmin y deja el área en "plataforma". */
export async function exigirPlataforma() {
  const r = await obtenerArea();
  if (r.contexto.tipo !== 'ADMIN' || !esSuperadmin(r.contexto.roles)) redirect('/');
  return r;
}
