import { redirect } from 'next/navigation';
import { obtenerArea } from '@/lib/contexto';
import Cliente from './cliente';

export default async function Page() {
  const { activa } = await obtenerArea();
  if (!activa || activa.modo !== 'MIEMBRO' || !activa.roles.some((r) => r === 'ADMIN_ORG' || r === 'AUDITOR')) redirect('/');
  return <Cliente orgId={activa.id} orgNombre={activa.nombre} puedeOtorgar={activa.roles.includes('ADMIN_ORG')} />;
}
