'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AREA_PLATAFORMA, fijarAreaCliente } from '@/lib/area';
import type { OpcionArea, Rol } from '@/lib/tipos';

type Item = { href: string; etiqueta: string; icono: string; roles: Rol[]; soporte: boolean };
type Grupo = { titulo: string; items: Item[] };

const TODOS: Rol[] = ['ADMIN_ORG', 'SUPERVISOR', 'BODEGA', 'AUDITOR'];

/** Menú de la organización (operación). "soporte" indica si se muestra en modo soporte (solo lectura). */
const MENU_ORG: Grupo[] = [
  {
    titulo: 'Operación',
    items: [
      { href: '/', etiqueta: 'Inicio', icono: '🏠', roles: TODOS, soporte: true },
      { href: '/admin/en-vivo', etiqueta: 'Producción en vivo', icono: '✂️', roles: ['ADMIN_ORG', 'SUPERVISOR', 'AUDITOR'], soporte: true },
      { href: '/admin/traslados', etiqueta: 'Traslados', icono: '🚚', roles: ['ADMIN_ORG', 'BODEGA', 'SUPERVISOR', 'AUDITOR'], soporte: true },
      { href: '/admin/contenedores', etiqueta: 'Producción por contenedor', icono: '🚢', roles: ['ADMIN_ORG', 'BODEGA', 'AUDITOR'], soporte: true },
      { href: '/admin/costales', etiqueta: 'Costales', icono: '📦', roles: TODOS, soporte: true },
      { href: '/admin/produccion', etiqueta: 'Empaque vs. producción', icono: '📊', roles: ['ADMIN_ORG', 'AUDITOR'], soporte: true },
      { href: '/admin/inventarios', etiqueta: 'Inventarios', icono: '🔍', roles: ['ADMIN_ORG', 'SUPERVISOR', 'AUDITOR'], soporte: true },
      { href: '/admin/retornos', etiqueta: 'Retornos de saldo', icono: '↩️', roles: TODOS, soporte: true },
    ],
  },
  {
    titulo: 'Configuración',
    items: [
      { href: '/admin/tiendas', etiqueta: 'Sucursales', icono: '🏬', roles: TODOS, soporte: true },
      { href: '/admin/categorias', etiqueta: 'Productos', icono: '🏷️', roles: ['ADMIN_ORG', 'BODEGA', 'AUDITOR'], soporte: true },
      { href: '/admin/empleados', etiqueta: 'Empleados', icono: '👷', roles: ['ADMIN_ORG', 'SUPERVISOR', 'AUDITOR'], soporte: true },
      { href: '/admin/celulares', etiqueta: 'Celulares', icono: '📱', roles: ['ADMIN_ORG', 'SUPERVISOR', 'AUDITOR'], soporte: true },
      { href: '/admin/usuarios', etiqueta: 'Usuarios', icono: '👥', roles: ['ADMIN_ORG'], soporte: false },
      { href: '/admin/soporte', etiqueta: 'Acceso de soporte', icono: '🛟', roles: ['ADMIN_ORG', 'AUDITOR'], soporte: false },
    ],
  },
  {
    titulo: 'Ayuda',
    items: [
      { href: '/manual/organizacion', etiqueta: 'Manual de uso', icono: '📘', roles: TODOS, soporte: true },
      { href: '/manual/tienda', etiqueta: 'Manual de la tienda', icono: '📱', roles: TODOS, soporte: true },
    ],
  },
];

/** Menú de la plataforma (el negocio: organizaciones y quién las administra). */
const MENU_PLATAFORMA: Grupo[] = [
  {
    titulo: 'Plataforma',
    items: [
      { href: '/plataforma', etiqueta: 'Organizaciones', icono: '🏢', roles: [], soporte: false },
      { href: '/plataforma/usuarios', etiqueta: 'Administradores', icono: '👥', roles: [], soporte: false },
      { href: '/plataforma/auditoria', etiqueta: 'Auditoría de soporte', icono: '🧾', roles: [], soporte: false },
    ],
  },
  {
    titulo: 'Ayuda',
    items: [
      { href: '/manual', etiqueta: 'Manuales', icono: '📘', roles: [], soporte: false },
    ],
  },
];

/** Menú del área del centro de distribución. */
const MENU_CENTRO: Grupo[] = [
  {
    titulo: 'Centro de distribución',
    items: [
      { href: '/centro', etiqueta: 'Resumen', icono: '🏭', roles: [], soporte: true },
      { href: '/centro/traslados', etiqueta: 'Existencias y traslados', icono: '🚚', roles: [], soporte: true },
      { href: '/centro/contenedores', etiqueta: 'Producción por contenedor', icono: '🚢', roles: [], soporte: true },
      { href: '/centro/tiendas', etiqueta: 'Stock de las tiendas', icono: '🏬', roles: [], soporte: true },
      { href: '/centro/ventas', etiqueta: 'Ventas locales', icono: '🛒', roles: [], soporte: true },
      { href: '/centro/retornos', etiqueta: 'Retornos de saldo', icono: '↩️', roles: [], soporte: true },
      { href: '/centro/inventario', etiqueta: 'Inventario del centro', icono: '🔍', roles: [], soporte: true },
    ],
  },
  {
    titulo: 'Ayuda',
    items: [{ href: '/manual/organizacion', etiqueta: 'Manual de uso', icono: '📘', roles: [], soporte: true }],
  },
];

const etiquetaOpcion = (o: OpcionArea) =>
  o.modo === 'CENTRO'
    ? `🏭 ${o.nombre}`
    : o.modo === 'PLATAFORMA'
    ? '★ Mi plataforma'
    : o.modo === 'SOPORTE'
      ? `🛟 ${o.nombre} (soporte)`
      : o.modo === 'SIN_ACCESO'
        ? `🔒 ${o.nombre}`
        : `🏢 ${o.nombre}`;

export default function Navegacion({
  opciones,
  activa,
  nombre,
  rol,
}: {
  opciones: OpcionArea[];
  activa: OpcionArea | null;
  nombre: string;
  rol: string;
}) {
  const ruta = usePathname();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  useEffect(() => setAbierto(false), [ruta]);

  const enPlataforma = activa?.modo === 'PLATAFORMA';
  const enCentro = activa?.modo === 'CENTRO';
  const grupos = (enPlataforma ? MENU_PLATAFORMA : enCentro ? MENU_CENTRO : MENU_ORG)
    .map((g) => ({
      ...g,
      items: g.items.filter((i) =>
        enPlataforma || enCentro ? true : activa?.modo === 'SOPORTE' ? i.soporte : (activa?.roles ?? []).some((r) => i.roles.includes(r)),
      ),
    }))
    .filter((g) => g.items.length);

  const cambiarArea = (id: string) => {
    fijarAreaCliente(id);
    setAbierto(false);
    router.push(id === AREA_PLATAFORMA ? '/plataforma' : id.startsWith('centro:') ? '/centro' : '/');
    router.refresh();
  };

  const Marca = () => (
    <p className="text-lg font-black tracking-tight">
      Control de <span className="text-indigo-600">Costales</span>
    </p>
  );

  const SelectorArea = () =>
    opciones.length === 0 ? null : (
      <div className="px-4 pt-4">
        <p className="px-1 pb-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
          {enPlataforma ? 'Área: plataforma' : enCentro ? 'Área: centro de distribución' : 'Área: organización'}
        </p>
        {opciones.length > 1 ? (
          <select
            aria-label="Cambiar de área"
            value={activa?.id ?? ''}
            onChange={(e) => cambiarArea(e.target.value)}
            className={`w-full rounded-2xl border-2 p-2.5 text-sm font-bold outline-none ${enPlataforma ? 'border-amber-300 bg-amber-50' : enCentro ? 'border-emerald-300 bg-emerald-50' : 'border-indigo-100 bg-indigo-50'}`}
          >
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {etiquetaOpcion(o)}
              </option>
            ))}
          </select>
        ) : (
          activa && <p className="rounded-2xl bg-indigo-50 p-2.5 text-sm font-bold">{etiquetaOpcion(activa)}</p>
        )}
      </div>
    );

  const Menu = () => (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {grupos.map((g) => (
        <div key={g.titulo}>
          <p className="px-3 pb-1 text-[10px] font-black uppercase tracking-widest text-gray-400">{g.titulo}</p>
          <div className="space-y-1">
            {g.items.map((i) => {
              const activo = i.href === '/' || i.href === '/plataforma' || i.href === '/centro' ? ruta === i.href : ruta.startsWith(i.href);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition ${
                    activo ? (enPlataforma ? 'bg-amber-500 text-white shadow' : enCentro ? 'bg-emerald-600 text-white shadow' : 'bg-indigo-600 text-white shadow') : 'text-gray-600 hover:bg-gray-100'
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
      {activa?.modo === 'SIN_ACCESO' && (
        <p className="px-3 text-xs text-gray-400">Esta organización no te ha dado acceso de soporte.</p>
      )}
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
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-gray-100 bg-white lg:flex">
        <div className="px-5 pt-6">
          <Marca />
        </div>
        <SelectorArea />
        <Menu />
        <Usuario />
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <Marca />
        <button onClick={() => setAbierto(true)} aria-label="Abrir menú" className="rounded-xl bg-gray-100 px-3 py-2 text-lg font-black leading-none text-gray-700">
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
            <SelectorArea />
            <Menu />
            <Usuario />
          </div>
        </div>
      )}
    </>
  );
}
