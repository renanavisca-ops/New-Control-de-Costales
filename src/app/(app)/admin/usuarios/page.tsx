import { redirect } from 'next/navigation';
import { obtenerContexto } from '@/lib/contexto';
import { tieneAlgunRol } from '@/lib/tipos';
import Cliente from './cliente';

export default async function Page() {
  const { contexto } = await obtenerContexto();
  if (contexto.tipo !== 'ADMIN' || !tieneAlgunRol(contexto.roles, ['ADMIN_ORG'])) redirect('/');
  return <Cliente roles={contexto.roles} miId={contexto.admin.id} />;
}
