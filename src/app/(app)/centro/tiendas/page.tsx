import { exigirCentro } from '@/lib/contexto';
import StockTiendas from './cliente';

export default async function Page() {
  const { centro } = await exigirCentro();
  return <StockTiendas centroId={centro.id} />;
}
