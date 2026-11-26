'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cargarOrgsPropias } from '@/lib/datos';
import type { AsignacionRol, Organizacion, Tienda } from '@/lib/tipos';
import { SelectorOrg, useOrgActiva } from '@/components/selector-org';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Selector, Tarjeta, Titulo } from '@/components/ui';

type Fila = {
  id: string;
  codigo: string;
  estado: string;
  origen: string;
  piezas_empaque: number | null;
  recibido_at: string | null;
  tienda_id: string;
  categoria_id: string | null;
  categorias: { nombre: string; organizacion_id: string } | null;
};
type Cat = { id: string; nombre: string; organizacion_id: string };
const CORREGIBLE_CODIGO = ['INVENTARIO_INICIAL', 'RECEPCION_MANUAL'];

const ESTADOS = ['EN_TIENDA', 'EN_PRODUCCION', 'PRODUCIDO', 'EN_TRANSITO', 'VENDIDO'];
const NOMBRE_ESTADO: Record<string, string> = {
  EN_TIENDA: 'En stock',
  EN_PRODUCCION: 'En producción',
  PRODUCIDO: 'Producido',
  EN_TRANSITO: 'En tránsito',
  ANULADO: 'Anulado',
  VENDIDO: 'Vendido (venta local)',
};
const COLOR: Record<string, 'green' | 'indigo' | 'gray' | 'red'> = { EN_TIENDA: 'green', EN_PRODUCCION: 'indigo', PRODUCIDO: 'gray', EN_TRANSITO: 'indigo', ANULADO: 'red', VENDIDO: 'gray' };

export default function CostalesCliente({ roles }: { roles: AsignacionRol[] }) {
  const sb = supabaseNavegador();
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [orgId, setOrgId] = useOrgActiva(orgs);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [tienda, setTienda] = useState('');
  const [estado, setEstado] = useState('EN_TIENDA');
  const [busqueda, setBusqueda] = useState('');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [editando, setEditando] = useState<Fila | null>(null);

  useEffect(() => {
    cargarOrgsPropias(roles).then(setOrgs);
    sb.from('categorias').select('id, nombre, organizacion_id').eq('activa', true).order('nombre').then(({ data }: { data: unknown }) => setCats((data as Cat[]) || []));
  }, [roles]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(async () => {
    if (!orgId) return;
    const { data: t } = await sb.from('tiendas').select('*').eq('organizacion_id', orgId).order('codigo');
    setTiendas((t as Tienda[]) || []);
    let q = sb
      .from('costales')
      .select('id, codigo, estado, origen, piezas_empaque, recibido_at, tienda_id, categoria_id, categorias(nombre, organizacion_id)')
      .eq('organizacion_id', orgId)
      .order('recibido_at', { ascending: false })
      .limit(1000);
    if (tienda) q = q.eq('tienda_id', tienda);
    if (estado) q = q.eq('estado', estado);
    const { data } = await q;
    setFilas((data as unknown as Fila[]) || []);
  }, [orgId, tienda, estado, sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = filas.filter((f) => f.codigo.includes(busqueda.toUpperCase()));
  const resumen = useMemo(() => {
    const m = new Map<string, number>();
    visibles.forEach((f) => m.set(f.categorias?.nombre ?? 'SIN PRODUCTO', (m.get(f.categorias?.nombre ?? 'SIN PRODUCTO') ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibles]);
  const nombreTienda = (id: string) => tiendas.find((t) => t.id === id)?.codigo ?? '';

  return (
    <div>
      <Titulo>Costales</Titulo>
      <SelectorOrg orgs={orgs} valor={orgId} onCambio={setOrgId} />
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Selector value={tienda} onChange={(e) => setTienda(e.target.value)}>
          <option value="">Todas las tiendas</option>
          {tiendas.map((t) => <option key={t.id} value={t.id}>{t.codigo} · {t.nombre}</option>)}
        </Selector>
        <Selector value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => <option key={e} value={e}>{NOMBRE_ESTADO[e]}</option>)}
        </Selector>
        <Entrada placeholder="Buscar código" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      <Tarjeta className="mb-4">
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-gray-400">Resumen por producto · {visibles.length} costales</p>
        <div className="flex flex-wrap gap-2">
          {resumen.map(([p, n]) => (
            <span key={p} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold">
              {p}: <span className="text-indigo-600">{n}</span>
            </span>
          ))}
          {resumen.length === 0 && <span className="text-sm text-gray-400">Sin costales.</span>}
        </div>
      </Tarjeta>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {visibles.map((f) => (
          <Tarjeta key={f.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-mono font-black">{f.codigo}</p>
              <p className="text-xs text-gray-500">
                {f.categorias?.nombre ?? 'Sin producto'} · {f.piezas_empaque ?? '—'} pzs · {nombreTienda(f.tienda_id)}
                {f.origen === 'INVENTARIO_INICIAL' && ' · inventario inicial'}
              </p>
            </div>
            <div className="text-right">
              <Insignia color={COLOR[f.estado] ?? 'gray'}>{NOMBRE_ESTADO[f.estado] ?? f.estado}</Insignia>
              <p className="mt-1 text-[11px] text-gray-400">{f.recibido_at ? new Date(f.recibido_at).toLocaleDateString() : ''}</p>
              {f.estado !== 'ANULADO' && f.estado !== 'VENDIDO' && (
                <button onClick={() => setEditando(f)} className="mt-1 text-xs font-bold text-indigo-600 hover:underline">Corregir</button>
              )}
            </div>
          </Tarjeta>
        ))}
      </div>

      {editando && (
        <Corregir
          costal={editando}
          cats={cats.filter((c) => !editando.categorias || c.organizacion_id === editando.categorias.organizacion_id)}
          onCerrar={() => setEditando(null)}
          onListo={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function Corregir({ costal, cats, onCerrar, onListo }: { costal: Fila; cats: Cat[]; onCerrar: () => void; onListo: () => void }) {
  const sb = supabaseNavegador();
  const [codigo, setCodigo] = useState(costal.codigo);
  const [cat, setCat] = useState(costal.categoria_id ?? '');
  const [piezas, setPiezas] = useState(costal.piezas_empaque ? String(costal.piezas_empaque) : '');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const puedeCodigo = CORREGIBLE_CODIGO.includes(costal.origen);
  const puedeEliminar = puedeCodigo && costal.estado === 'EN_TIENDA';

  const ejecutar = async (fn: 'corregir_costal' | 'eliminar_costal') => {
    setOcupado(true);
    setError('');
    const args =
      fn === 'corregir_costal'
        ? { p_costal: costal.id, p_codigo: codigo, p_categoria: cat || null, p_piezas: piezas ? Number(piezas) : null, p_motivo: motivo }
        : { p_costal: costal.id, p_motivo: motivo };
    const { data, error: e } = await sb.rpc(fn, args);
    setOcupado(false);
    const r = data as { ok: boolean; error?: string } | null;
    if (e || !r?.ok) return setError(r?.error ?? e?.message ?? 'No se pudo guardar.');
    onListo();
  };

  return (
    <Modal titulo={`Corregir costal ${costal.codigo}`} onCerrar={onCerrar}>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">Úsalo cuando la cámara leyó mal el código o se eligió un producto equivocado. El cambio queda registrado.</p>
        <Campo etiqueta="Código (como dice la etiqueta)">
          <Entrada value={codigo} disabled={!puedeCodigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} className="font-mono font-bold" />
        </Campo>
        {!puedeCodigo && <p className="text-[11px] text-gray-400">El código de costales enviados por el centro no se cambia aquí.</p>}
        <Campo etiqueta="Producto">
          <Selector value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Sin producto</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="Piezas de empaque">
          <Entrada inputMode="numeric" value={piezas} onChange={(e) => setPiezas(e.target.value.replace(/\D/g, ''))} />
        </Campo>
        <Campo etiqueta="Motivo (opcional)">
          <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. la cámara leyó mal el código" />
        </Campo>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton className="w-full" disabled={ocupado} onClick={() => ejecutar('corregir_costal')}>Guardar corrección</Boton>
        {puedeEliminar && (
          <button
            disabled={ocupado}
            onClick={() => confirm(`¿Eliminar el costal ${costal.codigo}? Úsalo solo si se registró por error.`) && ejecutar('eliminar_costal')}
            className="w-full rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-600"
          >
            Eliminar registro equivocado
          </button>
        )}
      </div>
    </Modal>
  );
}
