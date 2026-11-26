import { exigirCentro } from '@/lib/contexto';
import RetornosCliente from '../../admin/retornos/cliente';

export default async function Page() {
  const { roles, centro } = await exigirCentro();
  return <RetornosCliente roles={roles} destinoId={centro.id} />;
}
