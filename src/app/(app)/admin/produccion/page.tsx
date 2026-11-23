import { redirect } from 'next/navigation';
import { rolesActuales } from '@/lib/contexto';
import { tieneAlgunRol } from '@/lib/tipos';
import Cliente from './cliente';

export default async function Page() {
  const roles = await rolesActuales();
  if (!tieneAlgunRol(roles, ['ADMIN_ORG', 'AUDITOR'])) redirect('/');
  return <Cliente roles={roles} />;
}
