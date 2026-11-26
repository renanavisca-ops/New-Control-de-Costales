import { exigirCentro } from '@/lib/contexto';
import InventarioCentro from './cliente';

export default async function Page() {
  const { centro, roles } = await exigirCentro();
  const puedeBaja = roles.some((r) => r.rol === 'ADMIN_ORG' && r.organizacion_id === centro.organizacion_id);
  return <InventarioCentro centro={centro} puedeBaja={puedeBaja} />;
}
