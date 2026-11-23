import { exigirPlataforma } from '@/lib/plataforma';
import TablaSoporte from '../../admin/soporte/tabla';

export default async function Page() {
  await exigirPlataforma();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black tracking-tight">Auditoría de soporte</h1>
      <p className="text-sm text-gray-500">Accesos de soporte otorgados por las organizaciones y cada ingreso registrado.</p>
      <TablaSoporte />
    </div>
  );
}
