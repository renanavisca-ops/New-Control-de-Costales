import { rolesActuales } from '@/lib/contexto';
import Cliente from './cliente';

export default async function Page() {
  return <Cliente roles={await rolesActuales()} />;
}
