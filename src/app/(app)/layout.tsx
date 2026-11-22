import { redirect } from 'next/navigation';
import { obtenerSesion } from '@/lib/perfil';
import { NOMBRE_ROL } from '@/lib/tipos';
import Navegacion from './navegacion';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, perfil } = await obtenerSesion();
  if (!user) redirect('/login');

  if (!perfil || !perfil.activo) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm space-y-4 rounded-3xl bg-white p-8 text-center shadow">
          <h1 className="text-xl font-black">Cuenta sin acceso</h1>
          <p className="text-sm text-gray-500">Tu usuario no tiene un perfil activo. Contacta a tu administrador.</p>
          <a href="/auth/salir" className="inline-block rounded-2xl bg-gray-900 px-4 py-3 text-sm font-bold text-white">
            Salir
          </a>
        </div>
      </main>
    );
  }
  if (perfil.debe_cambiar_password) redirect('/cambiar-password');

  return (
    <div className="mx-auto min-h-screen max-w-3xl pb-28">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-100 bg-white/80 px-5 py-4 backdrop-blur">
        <div>
          <p className="text-lg font-black tracking-tight">
            Control de <span className="text-indigo-600">Costales</span>
          </p>
          <p className="text-xs font-semibold text-gray-400">{perfil.nombre}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase text-indigo-700">
            {NOMBRE_ROL[perfil.rol]}
          </span>
          <a href="/auth/salir" className="text-[11px] font-bold uppercase text-gray-400 hover:text-red-500">
            Salir
          </a>
        </div>
      </header>
      <main className="p-5">{children}</main>
      <Navegacion rol={perfil.rol} />
    </div>
  );
}
