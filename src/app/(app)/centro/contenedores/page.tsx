import { exigirCentro } from '@/lib/contexto';
import ContenedoresCliente from '../../admin/contenedores/cliente';

export default async function Page() {
  const { roles, centro } = await exigirCentro();
  return <ContenedoresCliente roles={roles} centroId={centro.id} />;
}
