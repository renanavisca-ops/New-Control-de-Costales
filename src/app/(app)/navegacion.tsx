'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Rol } from '@/lib/tipos';

const ITEMS: { href: string; etiqueta: string; icono: string; roles: Rol[] }[] = [
  { href: '/', etiqueta: 'Inicio', icono: '🏠', roles: ['ADMIN_CENTRO', 'BODEGA', 'ADMIN_EMPRESA', 'SUPERVISOR', 'OPERADOR'] },
  { href: '/admin/empresas', etiqueta: 'Empresas', icono: '🏢', roles: ['ADMIN_CENTRO'] },
  { href: '/admin/bodegas', etiqueta: 'Bodegas', icono: '🏬', roles: ['ADMIN_CENTRO', 'ADMIN_EMPRESA'] },
  { href: '/admin/categorias', etiqueta: 'Categorías', icono: '🏷️', roles: ['ADMIN_CENTRO', 'ADMIN_EMPRESA'] },
  { href: '/admin/usuarios', etiqueta: 'Usuarios', icono: '👥', roles: ['ADMIN_CENTRO', 'ADMIN_EMPRESA'] },
];

export default function Navegacion({ rol }: { rol: Rol }) {
  const ruta = usePathname();
  const visibles = ITEMS.filter((i) => i.roles.includes(rol));
  if (visibles.length < 2) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-3xl justify-around rounded-t-[32px] border-t border-gray-100 bg-white/90 px-2 pb-5 pt-3 backdrop-blur">
      {visibles.map((i) => {
        const activo = i.href === '/' ? ruta === '/' : ruta.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`flex flex-col items-center rounded-2xl px-3 py-2 transition ${activo ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500'}`}
          >
            <span className="text-lg">{i.icono}</span>
            <span className="text-[10px] font-black uppercase tracking-wide">{i.etiqueta}</span>
          </Link>
        );
      })}
    </nav>
  );
}
