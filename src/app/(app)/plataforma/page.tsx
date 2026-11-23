import { exigirPlataforma } from '@/lib/plataforma';
import Cliente from './cliente';

export default async function Page() {
  await exigirPlataforma();
  return <Cliente />;
}
