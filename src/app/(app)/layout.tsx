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
    <div className="mx-auto min-h-screen max-w-4xl pb-16">
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-lg font-black tracking-tight">
              Control de <span className="text-indigo-600">Costales</span>
            </p>
            <p className="text-xs font-semibold text-gray-400">{contexto.admin.nombre}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {rolPrincipal && (
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase text-indigo-700">
                {NOMBRE_ROL[rolPrincipal]}
              </span>
            )}
            <a href="/auth/salir" className="text-[11px] font-bold uppercase text-gray-400 hover:text-red-500">
              Salir
            </a>
          </div>
        </div>
        <Navegacion roles={contexto.roles} />
      </header>
      <main className="p-5">{children}</main>
    </div>
  );
}
