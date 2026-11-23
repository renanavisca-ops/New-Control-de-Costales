'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseNavegador } from '@/lib/supabase/client';
import { rpc } from '@/lib/datos';
import { fijarAreaCliente } from '@/lib/area';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Titulo } from '@/components/ui';

type Fila = {
  id: string;
  nombre: string;
  prefijo_empleado: string;
  activa: boolean;
  sucursales: number;
  centros: number;
  empleados: number;
  celulares: number;
  administradores: number;
  soporte_hasta: string | null;
  created_at: string;
};

export default function PlataformaCliente() {
  const sb = supabaseNavegador();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [nueva, setNueva] = useState<{ nombre: string; prefijo: string } | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const { data } = await sb.rpc('plataforma_resumen');
    setFilas((data as Fila[]) || []);
  }, [sb]);

  useEffect(() => {
    fijarAreaCliente('plataforma');
    cargar();
  }, [cargar]);

  const crear = async () => {
    if (!nueva) return;
    setError('');
    if (!nueva.nombre.trim() || !nueva.prefijo.trim()) return setError('Nombre y prefijo son obligatorios.');
    const r = await rpc('crear_organizacion', { p_nombre: nueva.nombre, p_prefijo: nueva.prefijo });
    if (r.error) return setError(r.error);
    setNueva(null);
    cargar();
  };

  const tot = (k: keyof Fila) => filas.reduce((a, f) => a + Number(f[k] || 0), 0);

  return (
    <div className="space-y-5">
      <Titulo accion={<Boton onClick={() => { setNueva({ nombre: '', prefijo: '' }); setError(''); }}>+ Organización</Boton>}>
        Organizaciones
      </Titulo>
      <p className="text-sm text-gray-500">
        Administración global. Aquí creas cada organización y su primer administrador; desde ahí, ellos configuran sus sucursales, empleados y celulares. No ves los datos internos de una organización salvo que te dé acceso de soporte.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Organizaciones', filas.length],
          ['Sucursales', tot('sucursales')],
          ['Empleados activos', tot('empleados')],
          ['Celulares activos', tot('celulares')],
        ].map(([t, v]) => (
          <div key={t as string} className="rounded-3xl bg-amber-50 p-4 text-center text-amber-800">
            <p className="text-[10px] font-black uppercase tracking-wide">{t}</p>
            <p className="mt-1 text-3xl font-black">{v}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-3xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full min-w-[44rem] text-left">
          <thead className="bg-gray-50 text-xs font-black uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3">Organización</th>
              <th className="px-3 py-3 text-center">Sucursales</th>
              <th className="px-3 py-3 text-center">Empleados</th>
              <th className="px-3 py-3 text-center">Celulares</th>
              <th className="px-3 py-3 text-center">Admins</th>
              <th className="px-3 py-3">Soporte</th>
              <th className="px-5 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map((f) => (
              <tr key={f.id} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <p className="font-black">{f.nombre}</p>
                  <div className="mt-1 flex gap-1">
                    <Insignia>{f.prefijo_empleado}</Insignia>
                    {!f.activa && <Insignia color="gray">Inactiva</Insignia>}
                    {f.centros > 0 && <Insignia color="green">{f.centros} centro{f.centros > 1 ? 's' : ''}</Insignia>}
                  </div>
                </td>
                <td className="px-3 py-3 text-center font-bold">{f.sucursales}</td>
                <td className="px-3 py-3 text-center font-bold">{f.empleados}</td>
                <td className="px-3 py-3 text-center font-bold">{f.celulares}</td>
                <td className="px-3 py-3 text-center font-bold">{f.administradores}</td>
                <td className="px-3 py-3 text-xs">
                  {f.soporte_hasta ? <span className="font-bold text-sky-700">🛟 hasta {new Date(f.soporte_hasta).toLocaleString()}</span> : <span className="text-gray-400">Sin acceso</span>}
                </td>
                <td className="px-5 py-3 text-right">
                  <Link href={`/plataforma/organizaciones/${f.id}`} className="rounded-2xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600">
                    Gestionar →
                  </Link>
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-gray-400">Sin organizaciones.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {nueva && (
        <Modal titulo="Nueva organización" onCerrar={() => setNueva(null)}>
          <Campo etiqueta="Nombre">
            <Entrada value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
          </Campo>
          <Campo etiqueta="Prefijo de empleados (2 a 6 letras)">
            <Entrada value={nueva.prefijo} maxLength={6} placeholder="PTA" onChange={(e) => setNueva({ ...nueva, prefijo: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
          </Campo>
          <p className="text-xs text-gray-400">Después de crearla, entra a Gestionar para crear su primer administrador.</p>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton className="w-full" onClick={crear}>Crear organización</Boton>
        </Modal>
      )}
    </div>
  );
}
