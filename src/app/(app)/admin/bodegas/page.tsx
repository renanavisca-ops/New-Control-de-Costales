import { redirect } from 'next/navigation';
import { obtenerSesion } from '@/lib/perfil';
import { esAdmin } from '@/lib/tipos';
import BodegasCliente from './cliente';

export default async function Page() {
  const { perfil } = await obtenerSesion();
  if (!perfil || !esAdmin(perfil.rol)) redirect('/');
  return <BodegasCliente puedeEditar={perfil.rol === 'ADMIN_CENTRO'} centroId={perfil.centro_id} />;
}
