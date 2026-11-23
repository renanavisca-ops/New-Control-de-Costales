'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { esSuperadmin, tieneAlgunRol, type AsignacionRol, type Rol } from '@/lib/tipos';

type Item = { href: string; etiqueta: string; icono: string; roles: Rol[] | 'SUPER' };
type Grupo = { titulo: string; items: Item[] };

const GRUPOS: Grupo[] = [
  {
    titulo: 'Operación',
    items: [
      { href: '/', etiqueta: 'Inicio', icono: '🏠', roles: ['ADMIN_ORG', 'SUPERVISOR', 'BODEGA', 'AUDITOR'] },
      { href: '/admin/en-vivo', etiqueta: 'Producción en vivo', icono: '✂️', roles: ['ADMIN_ORG', 'SUPERVISOR', 'AUDITOR'] },
      { href: '/admin/costales', etiqueta: 'Costales', icono: '📦', roles: ['ADMIN_ORG', 'SUPERVISOR', 'BODEGA', 'AUDITOR'] },
      { href: '/admin/produccion', etiqueta: 'Empaque vs. producción', icono: '📊', roles: ['ADMIN_ORG', 'AUDITOR'] },
      { href: '/admin/inventarios', etiqueta: 'Inventarios', icono: '🔍', roles: ['ADMIN_ORG', 'SUPERVISOR', 'AUDITOR'] },
      { href: '/admin/retornos', etiqueta: 'Retornos de saldo', icono: '↩️', roles: ['ADMIN_ORG', 'SUPERVISOR', 'BODEGA', 'AUDITOR'] },
    ],
  },
  {
    titulo: 'Configuración',
    items: [
      { href: '/admin/organizaciones', etiqueta: 'Organizaciones', icono: '🏢', roles: 'SUPER' },
      { href: '/admin/tiendas', etiqueta: 'Tiendas', icono: '🏬', roles: ['ADMIN_ORG', 'SUPERVISOR', 'BODEGA', 'AUDITOR'] },
      { href: '/admin/categorias', etiqueta: 'Productos', icono: '🏷️', roles: ['ADMIN_ORG', 'BODEGA', 'AUDITOR'] },
      { href: '/admin/empleados', etiqueta: 'Empleados', icono: '👷', roles: ['ADMIN_ORG', 'SUPERVISOR', 'AUDITOR'] },
      { href: '/admin/celulares', etiqueta: 'Celulares', icono: '📱', roles: ['ADMIN_ORG', 'SUPERVISOR', 'AUDITOR'] },
      { href: '/admin/usuarios', etiqueta: 'Usuarios', icono: '👥', roles: ['ADMIN_ORG'] },
    ],
  },
];

export default function Navegacion({ roles, nombre, rol }: { roles: AsignacionRol[]; nombre: string; rol: string }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  useEffect(() => setAbierto(false), [ruta]);

  const grupos = GRUPOS.map((g) => ({
    ...g,
    items: g.items.filter((i) => (i.roles === 'SUPER' ? esSuperadmin(roles) : tieneAlgunRol(roles, i.roles))),
  })).filter((g) => g.items.length);

  const Marca = () => (
    <p className="text-lg font-black tracking-tight">
      Control de <span className="text-indigo-600">Costales</span>
    </p>
  );

  const Menu = () => (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {grupos.map((g) => (
        <div key={g.titulo}>
          <p className="px-3 pb-1 text-[10px] font-black uppercase tracking-widest text-gray-400">{g.titulo}</p>
          <div className="space-y-1">
            {g.items.map((i) => {
              const activo = i.href === '/' ? ruta === '/' : ruta.startsWith(i.href);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition ${
                    activo ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className="w-5 text-center">{i.icono}</span>
                  {i.etiqueta}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const Usuario = () => (
    <div className="border-t border-gray-100 px-5 py-4">
      <p className="truncate text-sm font-black">{nombre}</p>
      <div className="mt-1 flex items-center justify-between">
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black uppercase text-indigo-700">{rol}</span>
        <a href="/auth/salir" className="text-xs font-bold uppercase text-gray-400 hover:text-red-500">
          Salir
        </a>
      </div>
    </div>
  );

  return (
    <>
      {/* Computadora: menú fijo a la izquierda */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-gray-100 bg-white lg:flex">
        <div className="px-5 pt-6">
          <Marca />
        </div>
        <Menu />
        <Usuario />
      </aside>

      {/* Celular y tableta: barra superior con menú desplegable */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <Marca />
        <button
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          className="rounded-xl bg-gray-100 px-3 py-2 text-lg font-black leading-none text-gray-700"
        >
          ☰
        </button>
      </header>
      {abierto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAbierto(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-5">
              <Marca />
              <button onClick={() => setAbierto(false)} aria-label="Cerrar menú" className="text-xl font-black text-gray-400">
                ✕
              </button>
            </div>
            <Menu />
            <Usuario />
          </div>
        </div>
      )}
    </>
  );
}
