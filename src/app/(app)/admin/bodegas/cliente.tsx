'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Bodega, Empresa } from '@/lib/tipos';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Selector, Tarjeta, Titulo, mensajeError } from '@/components/ui';

type Form = Omit<Bodega, 'id' | 'centro_id'> & { id?: string };

const VACIA: Form = { codigo: '', nombre: '', direccion: '', tipo: 'TIENDA', empresa_id: null, activa: true };

export default function BodegasCliente({ puedeEditar, centroId }: { puedeEditar: boolean; centroId: string | null }) {
  const sb = supabaseNavegador();
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const [b, e] = await Promise.all([
      sb.from('bodegas').select('*').order('codigo'),
      sb.from('empresas').select('*').order('nombre'),
    ]);
    setBodegas((b.data as Bodega[]) || []);
    setEmpresas((e.data as Empresa[]) || []);
  }, [sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const grupos = useMemo(() => {
    const centrales = bodegas.filter((b) => b.tipo === 'CENTRAL');
    const porEmpresa = empresas.map((e) => ({ empresa: e, bodegas: bodegas.filter((b) => b.empresa_id === e.id) }));
    return { centrales, porEmpresa };
  }, [bodegas, empresas]);

  const guardar = async () => {
    if (!form) return;
    setError('');
    const fila = {
      codigo: form.codigo.trim().toUpperCase(),
      nombre: form.nombre.trim(),
      direccion: form.direccion?.trim() || null,
      tipo: form.tipo,
      empresa_id: form.tipo === 'CENTRAL' ? null : form.empresa_id,
      activa: form.activa,
    };
    if (!fila.codigo || !fila.nombre) return setError('Código y nombre son obligatorios.');
    if (fila.tipo === 'TIENDA' && !fila.empresa_id) return setError('Selecciona la empresa de la tienda.');
    const { error } = form.id
      ? await sb.from('bodegas').update(fila).eq('id', form.id)
      : await sb.from('bodegas').insert({ ...fila, centro_id: centroId });
    if (error) return setError(mensajeError(error));
    setForm(null);
    cargar();
  };

  const Fila = ({ b }: { b: Bodega }) => (
    <Tarjeta className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <Insignia>{b.codigo}</Insignia>
          <p className="font-black">{b.nombre}</p>
        </div>
        <p className="mt-1 text-xs text-gray-400">{b.direccion || 'Sin dirección'}</p>
        {!b.activa && <Insignia color="gray">Inactiva</Insignia>}
      </div>
      {puedeEditar && (
        <Boton variante="suave" onClick={() => { setForm({ ...b }); setError(''); }}>Editar</Boton>
      )}
    </Tarjeta>
  );

  return (
    <div>
      <Titulo accion={puedeEditar && <Boton onClick={() => { setForm({ ...VACIA, empresa_id: empresas[0]?.id ?? null }); setError(''); }}>+ Bodega</Boton>}>
        Bodegas
      </Titulo>
      <p className="mb-4 text-sm text-gray-500">
        El código debe coincidir con la &quot;BODEGA DE ENTRADA&quot; del Excel de traslado (ej. B105).
      </p>

      {grupos.centrales.length > 0 && (
        <section className="mb-6 space-y-3">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500">Centro de distribución</h2>
          {grupos.centrales.map((b) => <Fila key={b.id} b={b} />)}
        </section>
      )}

      {grupos.porEmpresa.map(({ empresa, bodegas }) => (
        <section key={empresa.id} className="mb-6 space-y-3">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500">{empresa.nombre}</h2>
          {bodegas.length === 0 && <p className="text-sm text-gray-400">Sin bodegas todavía.</p>}
          {bodegas.map((b) => <Fila key={b.id} b={b} />)}
        </section>
      ))}

      {form && (
        <Modal titulo={form.id ? 'Editar bodega' : 'Nueva bodega'} onCerrar={() => setForm(null)}>
          <Campo etiqueta="Tipo">
            <Selector value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Form['tipo'] })}>
              <option value="TIENDA">Tienda (bodega de sucursal)</option>
              <option value="CENTRAL">Centro de distribución</option>
            </Selector>
          </Campo>
          {form.tipo === 'TIENDA' && (
            <Campo etiqueta="Empresa">
              <Selector value={form.empresa_id ?? ''} onChange={(e) => setForm({ ...form, empresa_id: e.target.value || null })}>
                <option value="">Selecciona…</option>
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </Selector>
            </Campo>
          )}
          <Campo etiqueta="Código">
            <Entrada value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="B105" />
          </Campo>
          <Campo etiqueta="Nombre">
            <Entrada value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Tienda 5" />
          </Campo>
          <Campo etiqueta="Dirección">
            <Entrada value={form.direccion ?? ''} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
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
