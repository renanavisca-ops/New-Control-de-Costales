import { redirect } from 'next/navigation';
import { obtenerSesion } from '@/lib/perfil';
import EmpresasCliente from './cliente';

export default async function Page() {
  const { perfil } = await obtenerSesion();
  if (perfil?.rol !== 'ADMIN_CENTRO') redirect('/');
  return <EmpresasCliente />;
}
