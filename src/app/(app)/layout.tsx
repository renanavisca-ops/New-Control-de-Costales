import { redirect } from 'next/navigation';
import { obtenerContexto } from '@/lib/contexto';
import { NOMBRE_ROL, esSuperadmin } from '@/lib/tipos';
import Navegacion from './navegacion';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { autenticado, contexto } = await obtenerContexto();
  if (!autenticado) redirect('/login');
  if (contexto.tipo === 'DISPOSITIVO') redirect('/tienda');

  if (contexto.tipo !== 'ADMIN' || !contexto.admin.activo) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm space-y-4 rounded-3xl bg-white p-8 text-center shadow">
          <h1 className="text-xl font-black">Cuenta sin acceso</h1>
          <p className="text-sm text-gray-500">Tu usuario no tiene permisos en la plataforma. Contacta a tu administrador.</p>
          <a href="/auth/salir" className="inline-block rounded-2xl bg-gray-900 px-4 py-3 text-sm font-bold text-white">
            Salir
          </a>
        </div>
      </main>
    );
  }
  if (contexto.admin.debe_cambiar_password) redirect('/cambiar-password');

  const rolPrincipal = esSuperadmin(contexto.roles) ? 'SUPERADMIN' : contexto.roles[0]?.rol;

  return (
    <div className="min-h-screen lg:flex">
      <Navegacion roles={contexto.roles} nombre={contexto.admin.nombre} rol={rolPrincipal ? NOMBRE_ROL[rolPrincipal] : ''} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-10 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
