import { exigirCentro } from '@/lib/contexto';
import ResumenCentro from './resumen';

export default async function Page() {
  const { centro } = await exigirCentro();
  return <ResumenCentro centro={centro} />;
}
