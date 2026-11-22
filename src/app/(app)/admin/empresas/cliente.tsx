'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Empresa } from '@/lib/tipos';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Tarjeta, Titulo, mensajeError } from '@/components/ui';

export default function EmpresasCliente() {
  const sb = supabaseNavegador();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [nueva, setNueva] = useState(false);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const { data } = await sb.from('empresas').select('*').order('nombre');
    setEmpresas((data as Empresa[]) || []);
  }, [sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async () => {
    setError('');
    const { error } = await sb.rpc('crear_empresa', { p_nombre: nombre });
    if (error) return setError(mensajeError(error));
    setNueva(false);
    setNombre('');
    cargar();
  };

  const guardar = async () => {
    if (!editando) return;
    setError('');
    const { error } = await sb.from('empresas').update({ nombre: editando.nombre.trim(), activa: editando.activa }).eq('id', editando.id);
    if (error) return setError(mensajeError(error));
    setEditando(null);
    cargar();
  };

  return (
    <div>
      <Titulo accion={<Boton onClick={() => { setNueva(true); setError(''); }}>+ Empresa</Boton>}>Empresas</Titulo>
      <p className="mb-4 text-sm text-gray-500">Empresas que abastece tu centro de distribución.</p>
      <div className="space-y-3">
        {empresas.map((e) => (
          <Tarjeta key={e.id} className="flex items-center justify-between">
            <div>
              <p className="font-black">{e.nombre}</p>
              <Insignia color={e.activa ? 'green' : 'gray'}>{e.activa ? 'Activa' : 'Inactiva'}</Insignia>
            </div>
            <Boton variante="suave" onClick={() => { setEditando({ ...e }); setError(''); }}>Editar</Boton>
          </Tarjeta>
        ))}
      </div>

      {nueva && (
        <Modal titulo="Nueva empresa" onCerrar={() => setNueva(false)}>
          <Campo etiqueta="Nombre">
            <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la empresa" />
          </Campo>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton className="w-full" onClick={crear} disabled={!nombre.trim()}>Crear empresa</Boton>
        </Modal>
      )}

      {editando && (
        <Modal titulo="Editar empresa" onCerrar={() => setEditando(null)}>
          <Campo etiqueta="Nombre">
            <Entrada value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
          </Campo>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={editando.activa} onChange={(e) => setEditando({ ...editando, activa: e.target.checked })} />
            Activa
          </label>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton className="w-full" onClick={guardar}>Guardar</Boton>
        </Modal>
      )}
    </div>
  );
}
