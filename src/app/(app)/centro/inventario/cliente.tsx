'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { rpc } from '@/lib/datos';
import type { Categoria } from '@/lib/tipos';
import Escaner from '@/components/escaner';
import { Aviso, Boton, Campo, Insignia, Modal, Selector, Tarjeta, Titulo } from '@/components/ui';

type Inventario = { id: string; tipo: 'COMPLETO' | 'SELECTIVO'; categorias: string[]; estado: 'ABIERTO' | 'CERRADO'; creado_at: string; resumen: Record<string, number> | null; bajas_aplicadas: boolean };
type Detalle = { codigo: string; producto: string | null; resultado: string; leido_at: string | null };
type Lectura = { codigo: string; resultado: string };

const claseDe = (nombre: string) => {
  const ult = nombre.trim().split(/\s+/).pop() ?? '';
  return /^[A-E]{1,2}$/.test(ult) ? ult : '';
};
const COLOR: Record<string, string> = { ENCONTRADO: 'text-green-700', SOBRANTE: 'text-orange-600', YA_LEIDO: 'text-gray-400' };
const TEXTO: Record<string, string> = { ENCONTRADO: 'Encontrado', SOBRANTE: 'No esperado (sobrante)', YA_LEIDO: 'Ya estaba contado' };

export default function InventarioCentro({ centro, puedeBaja }: { centro: { id: string; codigo: string; nombre: string; organizacion_id: string }; puedeBaja: boolean }) {
  const sb = supabaseNavegador();
  const [inventarios, setInventarios] = useState<Inventario[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nuevo, setNuevo] = useState<{ tipo: 'COMPLETO' | 'SELECTIVO'; categorias: string[] } | null>(null);
  const [detalle, setDetalle] = useState<Detalle[]>([]);
  const [lecturas, setLecturas] = useState<Lectura[]>([]);
  const [error, setError] = useState('');
  const ocupado = useRef(false);

  const abierto = inventarios.find((i) => i.estado === 'ABIERTO') ?? null;

  const cargar = useCallback(async () => {
    const [i, c] = await Promise.all([
      sb.from('inventarios').select('*').eq('tienda_id', centro.id).order('creado_at', { ascending: false }).limit(50),
      sb.from('categorias').select('*').eq('organizacion_id', centro.organizacion_id).eq('activa', true).order('nombre'),
    ]);
    setInventarios((i.data as Inventario[]) || []);
    setCategorias((c.data as Categoria[]) || []);
  }, [centro, sb]);

  const cargarDetalle = useCallback(async (id: string) => {
    const { data } = await sb.rpc('detalle_inventario', { p_id: id });
    setDetalle((data as Detalle[]) || []);
  }, [sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);
  useEffect(() => {
    if (abierto) cargarDetalle(abierto.id);
  }, [abierto, cargarDetalle]);

  const clases = useMemo(() => Array.from(new Set(categorias.map((c) => claseDe(c.nombre)).filter(Boolean))).sort(), [categorias]);

  const crear = async () => {
    if (!nuevo) return;
    setError('');
    const r = await rpc<string>('crear_inventario', { p_tienda: centro.id, p_tipo: nuevo.tipo, p_categorias: nuevo.tipo === 'SELECTIVO' ? nuevo.categorias : [] });
    if (r.error) return setError(r.error);
    setNuevo(null);
    setLecturas([]);
    cargar();
  };

  const leer = async (codigo: string) => {
    if (!abierto || ocupado.current) return;
    ocupado.current = true;
    const r = await rpc<{ ok: boolean; error?: string; codigo: string; resultado: string }>('leer_inventario_centro', { p_inventario: abierto.id, p_codigo: codigo });
    ocupado.current = false;
    if (r.error || !r.data?.ok) return setError(r.error ?? r.data?.error ?? 'No se pudo leer');
    setError('');
    setLecturas((l) => [{ codigo: r.data!.codigo, resultado: r.data!.resultado }, ...l].slice(0, 50));
    cargarDetalle(abierto.id);
  };

  const cerrar = async () => {
    if (!abierto || !confirm('¿Cerrar el inventario del centro? Ya no se podrán escanear más costales.')) return;
    const r = await rpc('cerrar_inventario', { p_id: abierto.id });
    if (r.error) return alert(r.error);
    cargar();
  };

  const darBaja = async (id: string) => {
    if (!confirm('Los costales faltantes saldrán de la existencia del centro. ¿Continuar?')) return;
    const r = await rpc<number>('dar_baja_faltantes', { p_id: id });
    if (r.error) return alert(r.error);
    alert(`${r.data} costales dados de baja.`);
    cargar();
  };

  const porProducto = useMemo(() => {
    const m = new Map<string, { esperados: number; encontrados: number }>();
    detalle.forEach((d) => {
      if (d.resultado.startsWith('SOBRANTE')) return;
      const k = d.producto ?? 'Sin producto';
      const x = m.get(k) ?? { esperados: 0, encontrados: 0 };
      x.esperados++;
      if (d.resultado === 'ENCONTRADO') x.encontrados++;
      m.set(k, x);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [detalle]);
  const esperados = detalle.filter((d) => !d.resultado.startsWith('SOBRANTE')).length;
  const encontrados = detalle.filter((d) => d.resultado === 'ENCONTRADO').length;
  const sobrantes = detalle.filter((d) => d.resultado.startsWith('SOBRANTE')).length;

  return (
    <div>
      <Titulo accion={!abierto && <Boton onClick={() => { setNuevo({ tipo: 'COMPLETO', categorias: [] }); setError(''); }}>+ Inventario del centro</Boton>}>
        Inventario del centro
      </Titulo>
      <p className="mb-4 text-sm text-gray-500">
        Escanea desde esta computadora (lector USB o Bluetooth, o escribiendo el código) los costales que están físicamente en el centro. El
        sistema compara contra la existencia cargada al abrir el inventario.
      </p>

      {abierto ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Tarjeta className="space-y-4 xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-black">
                {abierto.tipo === 'COMPLETO' ? 'Inventario completo' : `Inventario selectivo (${abierto.categorias.length} productos)`}
              </p>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-black text-emerald-700">
                {encontrados} / {esperados} encontrados{sobrantes ? ` · ${sobrantes} sobrantes` : ''}
              </span>
            </div>
            <Escaner onCodigo={leer} textoAyuda="Escanea cada costal del centro" />
            {error && <Aviso tipo="error">{error}</Aviso>}
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {lecturas.map((l, i) => (
                <div key={l.codigo + i} className="flex justify-between rounded-xl bg-gray-50 px-3 py-1.5 text-sm">
                  <span className="font-mono font-bold">{l.codigo}</span>
                  <span className={`font-bold ${COLOR[l.resultado] ?? ''}`}>{TEXTO[l.resultado] ?? l.resultado}</span>
                </div>
              ))}
            </div>
            <Boton variante="secundario" className="w-full" onClick={cerrar}>Cerrar inventario</Boton>
          </Tarjeta>
          <Tarjeta className="space-y-2">
            <p className="text-xs font-black uppercase tracking-wide text-gray-400">Avance por producto</p>
            {porProducto.map(([p, x]) => (
              <div key={p} className="text-sm">
                <div className="flex justify-between font-bold">
                  <span>{p}</span>
                  <span className={x.encontrados === x.esperados ? 'text-green-700' : 'text-gray-600'}>{x.encontrados} / {x.esperados}</span>
                </div>
                <div className="mt-0.5 h-1.5 rounded-full bg-gray-200">
                  <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${x.esperados ? (100 * x.encontrados) / x.esperados : 0}%` }} />
                </div>
              </div>
            ))}
            {porProducto.length === 0 && <p className="text-sm text-gray-400">No hay costales esperados.</p>}
          </Tarjeta>
        </div>
      ) : (
        <div className="space-y-2">
          {inventarios.length === 0 && <p className="text-sm text-gray-400">Sin inventarios del centro todavía.</p>}
          {inventarios.map((i) => (
            <Tarjeta key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-black">{i.tipo === 'COMPLETO' ? 'Completo' : `Selectivo (${i.categorias.length} productos)`}</p>
                <p className="text-xs text-gray-500">{new Date(i.creado_at).toLocaleString()}</p>
                {i.resumen && (
                  <p className="mt-1 text-xs">
                    <span className="font-bold text-green-700">{i.resumen.ENCONTRADO ?? 0} encontrados</span> ·{' '}
                    <span className="font-bold text-red-700">{i.resumen.FALTANTE ?? 0} faltantes</span> ·{' '}
                    <span className="font-bold text-orange-700">{(i.resumen.SOBRANTE ?? 0) + (i.resumen.SOBRANTE_NO_REGISTRADO ?? 0)} sobrantes</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Insignia color="gray">Cerrado</Insignia>
                {puedeBaja && !i.bajas_aplicadas && (i.resumen?.FALTANTE ?? 0) > 0 && (
                  <Boton variante="peligro" className="px-3 py-1 text-xs" onClick={() => darBaja(i.id)}>Dar de baja faltantes</Boton>
                )}
              </div>
            </Tarjeta>
          ))}
        </div>
      )}

      {nuevo && (
        <Modal titulo="Nuevo inventario del centro" onCerrar={() => setNuevo(null)}>
          <Campo etiqueta="Tipo">
            <Selector value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as 'COMPLETO' | 'SELECTIVO' })}>
              <option value="COMPLETO">Completo (toda la existencia)</option>
              <option value="SELECTIVO">Selectivo (por clase o producto)</option>
            </Selector>
          </Campo>
          {nuevo.tipo === 'SELECTIVO' && (
            <Campo etiqueta="Productos a contar">
              <div className="mb-2 flex flex-wrap gap-2">
                {clases.map((cl) => {
                  const ids = categorias.filter((c) => claseDe(c.nombre) === cl).map((c) => c.id);
                  const activa = ids.every((id) => nuevo.categorias.includes(id));
                  return (
                    <button
                      key={cl}
                      type="button"
                      onClick={() =>
                        setNuevo({ ...nuevo, categorias: activa ? nuevo.categorias.filter((x) => !ids.includes(x)) : Array.from(new Set([...nuevo.categorias, ...ids])) })
                      }
                      className={`rounded-full px-4 py-1.5 text-sm font-black ${activa ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}
                    >
                      Toda la {cl}
                    </button>
                  );
                })}
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl bg-gray-50 p-3">
                {categorias.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={nuevo.categorias.includes(c.id)}
                      onChange={() => setNuevo({ ...nuevo, categorias: nuevo.categorias.includes(c.id) ? nuevo.categorias.filter((x) => x !== c.id) : [...nuevo.categorias, c.id] })}
                    />
                    {c.nombre}
                  </label>
                ))}
              </div>
            </Campo>
          )}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton className="w-full" onClick={crear}>Abrir inventario</Boton>
        </Modal>
      )}
    </div>
  );
}
