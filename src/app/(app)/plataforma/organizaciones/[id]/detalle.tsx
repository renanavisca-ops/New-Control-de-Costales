'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseNavegador } from '@/lib/supabase/client';
import { traducirError } from '@/lib/datos';
import type { AsignacionRol, Organizacion, Tienda } from '@/lib/tipos';
import { Aviso, Boton, Campo, Entrada, Insignia, Tarjeta } from '@/components/ui';
import UsuariosCliente from '../../../admin/usuarios/cliente';

export default function DetalleOrgPlataforma({ org, roles, miId }: { org: Organizacion; roles: AsignacionRol[]; miId: string }) {
  const sb = supabaseNavegador();
  const [datos, setDatos] = useState({ nombre: org.nombre, activa: org.activa });
  const [guardado, setGuardado] = useState('');
  const [centros, setCentros] = useState<Tienda[]>([]);
  const [todas, setTodas] = useState<Organizacion[]>([]);
  const [abast, setAbast] = useState<{ centro_id: string; organizacion_id: string }[]>([]);

  const cargar = useCallback(async () => {
    const [c, o, a] = await Promise.all([
      sb.from('tiendas').select('*').eq('es_central', true).order('codigo'),
      sb.from('organizaciones').select('*').order('nombre'),
      sb.from('abastecimientos').select('centro_id, organizacion_id'),
    ]);
    setCentros((c.data as Tienda[]) || []);
    setTodas((o.data as Organizacion[]) || []);
    setAbast(a.data || []);
  }, [sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    setGuardado('');
    const { error } = await sb.from('organizaciones').update({ nombre: datos.nombre.trim(), activa: datos.activa }).eq('id', org.id);
    setGuardado(error ? traducirError(error.message) : 'Guardado.');
  };

  const alternar = async (centroId: string, activo: boolean) => {
    const { error } = activo
      ? await sb.from('abastecimientos').delete().eq('centro_id', centroId).eq('organizacion_id', org.id)
      : await sb.from('abastecimientos').insert({ centro_id: centroId, organizacion_id: org.id });
    if (error) alert(traducirError(error.message));
    cargar();
  };

  const propios = centros.filter((c) => c.organizacion_id === org.id);
  const ajenos = centros.filter((c) => c.organizacion_id !== org.id);
  const nombreOrg = (id: string) => todas.find((o) => o.id === id)?.nombre ?? '';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/plataforma" className="text-xs font-bold uppercase text-gray-400 hover:text-amber-600">
          ← Organizaciones
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight">{org.nombre}</h1>
          <Insignia>{org.prefijo_empleado}</Insignia>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Tarjeta className="space-y-3">
          <p className="font-black">Datos de la organización</p>
          <Campo etiqueta="Nombre">
            <Entrada value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
          </Campo>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={datos.activa} onChange={(e) => setDatos({ ...datos, activa: e.target.checked })} />
            Activa
          </label>
          {guardado && <Aviso tipo={guardado === 'Guardado.' ? 'exito' : 'error'}>{guardado}</Aviso>}
          <Boton onClick={guardar}>Guardar</Boton>
        </Tarjeta>

        <Tarjeta className="space-y-3">
          <p className="font-black">Abastecimiento</p>
          <p className="text-xs text-gray-500">
            Centros de distribución que despachan a esta organización. Su propio centro (si lo tiene) la abastece siempre; aquí agregas centros de otras organizaciones.
          </p>
          {propios.length > 0 && (
            <p className="text-sm">
              <b>Centros propios:</b> {propios.map((c) => `${c.codigo} · ${c.nombre}`).join(', ')}
            </p>
          )}
          <div className="space-y-1">
            {ajenos.length === 0 && <p className="text-sm text-gray-400">No hay centros de otras organizaciones.</p>}
            {ajenos.map((c) => {
              const activo = abast.some((a) => a.centro_id === c.id && a.organizacion_id === org.id);
              return (
                <label key={c.id} className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={activo} onChange={() => alternar(c.id, activo)} />
                  {c.codigo} · {c.nombre} <span className="text-gray-400">({nombreOrg(c.organizacion_id)})</span>
                </label>
              );
            })}
          </div>
        </Tarjeta>
      </div>

      <UsuariosCliente roles={roles} miId={miId} modoPlataforma orgFijaId={org.id} />
    </div>
  );
}
