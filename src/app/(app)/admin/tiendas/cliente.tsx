'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cargarOrgsPropias, traducirError } from '@/lib/datos';
import { puedeAdministrarOrg, type AsignacionRol, type Organizacion, type Tienda } from '@/lib/tipos';
import { SelectorOrg, useOrgActiva } from '@/components/selector-org';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Tarjeta, Titulo } from '@/components/ui';

type Form = { id?: string; codigo: string; bodega: string; nombre: string; direccion: string; es_central: boolean; activa: boolean };

export default function TiendasCliente({ roles, orgFijaId }: { roles: AsignacionRol[]; orgFijaId?: string }) {
  const sb = supabaseNavegador();
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [todasOrgs, setTodasOrgs] = useState<Organizacion[]>([]);
  const [orgActiva, setOrgId] = useOrgActiva(orgs);
  const orgId = orgFijaId ?? orgActiva;
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [abast, setAbast] = useState<{ centro_id: string; organizacion_id: string }[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const editable = puedeAdministrarOrg(roles, orgId);

  useEffect(() => {
    cargarOrgsPropias(roles).then(setOrgs);
    sb.from('organizaciones').select('*').order('nombre').then(({ data }: { data: unknown }) => setTodasOrgs((data as Organizacion[]) || []));
  }, [roles, sb]);

  const cargar = useCallback(async () => {
    if (!orgId) return;
    const [t, a] = await Promise.all([
      sb.from('tiendas').select('*').eq('organizacion_id', orgId).order('es_central', { ascending: false }).order('codigo'),
      sb.from('abastecimientos').select('centro_id, organizacion_id'),
    ]);
    setTiendas((t.data as Tienda[]) || []);
    setAbast(a.data || []);
  }, [orgId, sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    if (!form || !orgId) return;
    setError('');
    const fila = {
      codigo: form.codigo.trim().toUpperCase(),
      bodega: form.bodega.trim().toUpperCase() || null,
      nombre: form.nombre.trim(),
      direccion: form.direccion.trim() || null,
      es_central: form.es_central,
      activa: form.activa,
    };
    if (!fila.codigo || !fila.nombre) return setError('Código y nombre son obligatorios.');
    const { error } = form.id
      ? await sb.from('tiendas').update(fila).eq('id', form.id)
      : await sb.from('tiendas').insert({ ...fila, organizacion_id: orgId });
    if (error) return setError(error.message.includes('tiendas_bodega') ? 'Otra sucursal ya tiene esa bodega.' : traducirError(error.message));
    setForm(null);
    cargar();
  };


  return (
    <div>
      <Titulo
        accion={editable && <Boton onClick={() => { setForm({ codigo: '', bodega: '', nombre: '', direccion: '', es_central: false, activa: true }); setError(''); }}>+ Sucursal</Boton>}
      >
        Sucursales
      </Titulo>
      {!orgFijaId && <SelectorOrg orgs={orgs} valor={orgId} onCambio={setOrgId} />}
      <p className="mb-4 text-sm text-gray-500">
        La &quot;bodega en el sistema&quot; es la que aparece en el Excel de traslado: BODEGA DE ENTRADA para las tiendas (ej. B102) y SALIDA para el centro de distribución (ej. B090). Así cada traslado llega a la sucursal correcta.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {tiendas.length === 0 && <p className="text-sm text-gray-400">Sin tiendas todavía.</p>}
        {tiendas.map((t) => {
          const clientes = abast.filter((a) => a.centro_id === t.id).map((a) => a.organizacion_id);
          return (
            <Tarjeta key={t.id} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Insignia>{t.codigo}</Insignia>
                    <p className="font-black">{t.nombre}</p>
                    {t.bodega ? <Insignia color="gray">Bodega {t.bodega}</Insignia> : <Insignia color="red">Sin bodega</Insignia>}
                    {t.es_central && <Insignia color="green">Centro de distribución</Insignia>}
                    {!t.activa && <Insignia color="gray">Inactiva</Insignia>}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{t.direccion || 'Sin dirección'}</p>
                </div>
                {editable && (
                  <Boton variante="suave" onClick={() => { setForm({ id: t.id, codigo: t.codigo, bodega: t.bodega || '', nombre: t.nombre, direccion: t.direccion || '', es_central: t.es_central, activa: t.activa }); setError(''); }}>
                    Editar
                  </Boton>
                )}
              </div>
              {t.es_central && (
                <div className="rounded-2xl bg-gray-50 p-3">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">También abastece a</p>
                  <p className="text-sm text-gray-600">
                    {clientes.length ? clientes.map((id) => todasOrgs.find((o) => o.id === id)?.nombre ?? '—').join(', ') : 'Solo a su propia organización.'}
                  </p>
                </div>
              )}
            </Tarjeta>
          );
        })}
      </div>

      {form && (
        <Modal titulo={form.id ? 'Editar sucursal' : 'Nueva sucursal'} onCerrar={() => setForm(null)}>
          <Campo etiqueta="Código">
            <Entrada value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="T02" />
          </Campo>
          <Campo etiqueta="Bodega en el sistema (Excel de traslado)">
            <Entrada value={form.bodega} onChange={(e) => setForm({ ...form, bodega: e.target.value })} placeholder="B102" />
          </Campo>
          <Campo etiqueta="Nombre">
            <Entrada value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Tienda 5" />
          </Campo>
          <Campo etiqueta="Dirección">
            <Entrada value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
          </Campo>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={form.es_central} onChange={(e) => setForm({ ...form, es_central: e.target.checked })} />
            Es centro de distribución
          </label>
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
