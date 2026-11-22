'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { rpc, traducirError } from '@/lib/datos';
import type { Organizacion } from '@/lib/tipos';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Tarjeta, Titulo } from '@/components/ui';

type Form = { id?: string; nombre: string; prefijo_empleado: string; activa: boolean };

export default function OrganizacionesCliente() {
  const sb = supabaseNavegador();
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const { data } = await sb.from('organizaciones').select('*').order('nombre');
    setOrgs((data as Organizacion[]) || []);
  }, [sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    if (!form) return;
    setError('');
    if (!form.nombre.trim() || !form.prefijo_empleado.trim()) return setError('Nombre y prefijo son obligatorios.');
    if (form.id) {
      const { error } = await sb.from('organizaciones').update({ nombre: form.nombre.trim(), activa: form.activa }).eq('id', form.id);
      if (error) return setError(traducirError(error.message));
    } else {
      const r = await rpc('crear_organizacion', { p_nombre: form.nombre, p_prefijo: form.prefijo_empleado });
      if (r.error) return setError(r.error);
    }
    setForm(null);
    cargar();
  };

  return (
    <div>
      <Titulo accion={<Boton onClick={() => { setForm({ nombre: '', prefijo_empleado: '', activa: true }); setError(''); }}>+ Organización</Boton>}>
        Organizaciones
      </Titulo>
      <p className="mb-4 text-sm text-gray-500">Cada organización tiene sus tiendas, empleados y celulares. El prefijo se usa en el código de los empleados (ej. PTA-0001).</p>
      <div className="space-y-3">
        {orgs.map((o) => (
          <Tarjeta key={o.id} className="flex items-center justify-between">
            <div>
              <p className="font-black">{o.nombre}</p>
              <div className="mt-1 flex gap-1">
                <Insignia>{o.prefijo_empleado}</Insignia>
                <Insignia color={o.activa ? 'green' : 'gray'}>{o.activa ? 'Activa' : 'Inactiva'}</Insignia>
              </div>
            </div>
            <Boton variante="suave" onClick={() => { setForm({ id: o.id, nombre: o.nombre, prefijo_empleado: o.prefijo_empleado, activa: o.activa }); setError(''); }}>
              Editar
            </Boton>
          </Tarjeta>
        ))}
      </div>

      {form && (
        <Modal titulo={form.id ? 'Editar organización' : 'Nueva organización'} onCerrar={() => setForm(null)}>
          <Campo etiqueta="Nombre">
            <Entrada value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Campo>
          <Campo etiqueta="Prefijo de empleados (2 a 6 letras)">
            <Entrada
              value={form.prefijo_empleado}
              disabled={!!form.id}
              maxLength={6}
              onChange={(e) => setForm({ ...form, prefijo_empleado: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
              placeholder="PTA"
            />
          </Campo>
          {form.id && (
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} />
              Activa
            </label>
          )}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton className="w-full" onClick={guardar}>Guardar</Boton>
        </Modal>
      )}
    </div>
  );
}
