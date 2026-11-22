'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Categoria } from '@/lib/tipos';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Tarjeta, Titulo, mensajeError } from '@/components/ui';

export default function CategoriasCliente({ puedeEditar, centroId }: { puedeEditar: boolean; centroId: string | null }) {
  const sb = supabaseNavegador();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [form, setForm] = useState<{ id?: string; nombre: string; activa: boolean } | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const { data } = await sb.from('categorias').select('*').order('nombre');
    setCategorias((data as Categoria[]) || []);
  }, [sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    if (!form) return;
    setError('');
    const nombre = form.nombre.trim().toUpperCase();
    if (!nombre) return setError('Escribe un nombre.');
    const { error } = form.id
      ? await sb.from('categorias').update({ nombre, activa: form.activa }).eq('id', form.id)
      : await sb.from('categorias').insert({ nombre, activa: form.activa, centro_id: centroId });
    if (error) return setError(mensajeError(error));
    setForm(null);
    cargar();
  };

  return (
    <div>
      <Titulo accion={puedeEditar && <Boton onClick={() => { setForm({ nombre: '', activa: true }); setError(''); }}>+ Categoría</Boton>}>
        Categorías
      </Titulo>
      <p className="mb-4 text-sm text-gray-500">
        Las define el centro de distribución y aplican a todas las tiendas que abastece. Si un Excel de traslado trae una categoría nueva, se creará sola.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {categorias.map((c) => (
          <Tarjeta key={c.id} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <p className="font-black">{c.nombre}</p>
              {!c.activa && <Insignia color="gray">Inactiva</Insignia>}
            </div>
            {puedeEditar && (
              <Boton variante="suave" className="px-3 py-2" onClick={() => { setForm({ id: c.id, nombre: c.nombre, activa: c.activa }); setError(''); }}>
                Editar
              </Boton>
            )}
          </Tarjeta>
        ))}
      </div>

      {form && (
        <Modal titulo={form.id ? 'Editar categoría' : 'Nueva categoría'} onCerrar={() => setForm(null)}>
          <Campo etiqueta="Nombre">
            <Entrada value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="ROPA B" />
          </Campo>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} />
            Activa
          </label>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton className="w-full" onClick={guardar}>Guardar</Boton>
        </Modal>
      )}
    </div>
  );
}
