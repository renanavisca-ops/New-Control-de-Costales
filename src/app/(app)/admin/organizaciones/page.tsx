import { redirect } from 'next/navigation';
import { rolesActuales } from '@/lib/contexto';
import { esSuperadmin } from '@/lib/tipos';
import Cliente from './cliente';

export default async function Page() {
  const roles = await rolesActuales();
  if (!esSuperadmin(roles)) redirect('/');
  return <Cliente />;
}
