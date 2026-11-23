'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AsignacionRol, Organizacion } from '@/lib/tipos';
import { fijarOrgActiva } from '@/components/selector-org';
import { Insignia } from '@/components/ui';
import TiendasCliente from '../../tiendas/cliente';

const ACCESOS = [
  { href: '/admin/categorias', titulo: 'Productos', detalle: 'Lista de productos y carga desde Excel', icono: '🏷️' },
  { href: '/admin/empleados', titulo: 'Empleados', detalle: 'Código + PIN para el celular de tienda', icono: '👷' },
  { href: '/admin/celulares', titulo: 'Celulares', detalle: 'Activar el celular de cada sucursal', icono: '📱' },
  { href: '/admin/usuarios', titulo: 'Usuarios', detalle: 'Administradores, supervisores, bodega', icono: '👥' },
];

export default function DetalleOrganizacion({ roles, org }: { roles: AsignacionRol[]; org: Organizacion }) {
  const router = useRouter();

  // Todas las pantallas del panel quedan trabajando sobre esta organización
  useEffect(() => fijarOrgActiva(org.id), [org.id]);

  const ir = (href: string) => {
    fijarOrgActiva(org.id);
    router.push(href);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/organizaciones" className="text-xs font-bold uppercase text-gray-400 hover:text-indigo-600">
          ← Organizaciones
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight">{org.nombre}</h1>
          <Insignia>{org.prefijo_empleado}</Insignia>
          {!org.activa && <Insignia color="gray">Inactiva</Insignia>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ACCESOS.map((a) => (
          <button key={a.href} onClick={() => ir(a.href)} className="rounded-3xl bg-white p-4 text-left shadow-sm transition hover:shadow-md active:scale-[0.98]">
            <p className="text-xl">{a.icono}</p>
            <p className="mt-1 font-black">{a.titulo}</p>
            <p className="text-[11px] text-gray-400">{a.detalle}</p>
          </button>
        ))}
      </div>

      <TiendasCliente roles={roles} orgFijaId={org.id} />
    </div>
  );
}
