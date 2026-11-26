import { exigirCentro } from '@/lib/contexto';
import TrasladosCliente from '../../admin/traslados/cliente';

export default async function Page() {
  const { roles, centro } = await exigirCentro();
  return <TrasladosCliente roles={roles} soloLectura={false} centro={centro} />;
}
