import { redirect } from 'next/navigation';
import { obtenerArea, puedeVerEnArea } from '@/lib/contexto';
import Cliente from './cliente';

export default async function Page() {
  const { contexto, activa } = await obtenerArea();
  if (!puedeVerEnArea(activa, ['ADMIN_ORG', 'AUDITOR'])) redirect('/');
  return <Cliente roles={contexto.tipo === 'ADMIN' ? contexto.roles : []} />;
}
