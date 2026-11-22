'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { esSuperadmin, tieneAlgunRol, type AsignacionRol, type Rol } from '@/lib/tipos';

const ITEMS: { href: string; etiqueta: string; roles: Rol[] | 'SUPER' }[] = [
  { href: '/', etiqueta: 'Inicio', roles: ['ADMIN_ORG', 'SUPERVISOR', 'BODEGA', 'AUDITOR'] },
  { href: '/admin/costales', etiqueta: 'Costales', roles: ['ADMIN_ORG', 'SUPERVISOR', 'BODEGA', 'AUDITOR'] },
  { href: '/admin/produccion', etiqueta: 'Empaque vs. producción', roles: ['ADMIN_ORG', 'AUDITOR'] },
  { href: '/admin/organizaciones', etiqueta: 'Organizaciones', roles: 'SUPER' },
  { href: '/admin/tiendas', etiqueta: 'Tiendas', roles: ['ADMIN_ORG', 'SUPERVISOR', 'BODEGA', 'AUDITOR'] },
  { href: '/admin/categorias', etiqueta: 'Productos', roles: ['ADMIN_ORG', 'BODEGA', 'AUDITOR'] },
  { href: '/admin/empleados', etiqueta: 'Empleados', roles: ['ADMIN_ORG', 'SUPERVISOR', 'AUDITOR'] },
  { href: '/admin/celulares', etiqueta: 'Celulares', roles: ['ADMIN_ORG', 'SUPERVISOR', 'AUDITOR'] },
  { href: '/admin/usuarios', etiqueta: 'Usuarios', roles: ['ADMIN_ORG'] },
];

export default function Navegacion({ roles }: { roles: AsignacionRol[] }) {
  const ruta = usePathname();
  const visibles = ITEMS.filter((i) => (i.roles === 'SUPER' ? esSuperadmin(roles) : tieneAlgunRol(roles, i.roles)));
  return (
    <nav className="flex gap-2 overflow-x-auto px-5 pb-3">
      {visibles.map((i) => {
        const activo = i.href === '/' ? ruta === '/' : ruta.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide transition ${
              activo ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {i.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
