import { redirect } from 'next/navigation';
import { obtenerSesion } from '@/lib/perfil';
import { esAdmin } from '@/lib/tipos';
import CategoriasCliente from './cliente';

export default async function Page() {
  const { perfil } = await obtenerSesion();
  if (!perfil || !esAdmin(perfil.rol)) redirect('/');
  return <CategoriasCliente puedeEditar={perfil.rol === 'ADMIN_CENTRO'} centroId={perfil.centro_id} />;
}
