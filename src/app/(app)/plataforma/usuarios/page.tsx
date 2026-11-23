import { exigirPlataforma } from '@/lib/plataforma';
import UsuariosCliente from '../../admin/usuarios/cliente';

export default async function Page() {
  const { contexto } = await exigirPlataforma();
  if (contexto.tipo !== 'ADMIN') return null;
  return <UsuariosCliente roles={contexto.roles} miId={contexto.admin.id} modoPlataforma />;
}
