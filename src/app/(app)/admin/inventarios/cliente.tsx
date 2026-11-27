'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cargarOrgsPropias, rpc } from '@/lib/datos';
import { descargarExcel, leerFilasExcel } from '@/lib/excel';
import { buscarProducto, leerTraslado, plantillaTraslado, tipoReporte, type Traslado } from '@/lib/traslado';
import { MapeoProductos } from '@/components/mapeo-productos';
import { puedeAdministrarOrg, type AsignacionRol, type Categoria, type Organizacion, type Tienda } from '@/lib/tipos';
import { Aviso, Boton, Campo, Insignia, Modal, Selector, Tarjeta, Titulo } from '@/components/ui';

type Inventario = {
  id: string;
  organizacion_id: string;
  tienda_id: string;
  tipo: 'COMPLETO' | 'SELECTIVO';
  categorias: string[];
  estado: 'ABIERTO' | 'CERRADO';
  creado_at: string;
  cerrado_at: string | null;
  resumen: Record<string, number> | null;
  bajas_aplicadas: boolean;
};
type Detalle = { codigo: string; producto: string | null; resultado: string; leido_at: string | null; empleado: string | null };

/** Clase del producto: última palabra del nombre si es A, B, C, D, AB… ("ROPA GRANDE C" → C). */
const claseDe = (nombre: string) => {
  const ult = nombre.trim().split(/\s+/).pop() ?? '';
  return /^[A-E]{1,2}$/.test(ult) ? ult : '';
};

const RESULTADOS: Record<string, { texto: string; color: string }> = {
  ENCONTRADO: { texto: 'Encontrados', color: 'bg-green-50 text-green-800' },
  FALTANTE: { texto: 'Faltantes', color: 'bg-red-50 text-red-800' },
  SOBRANTE: { texto: 'Sobrantes (registrados en otro estado/tienda)', color: 'bg-orange-50 text-orange-800' },
  SOBRANTE_NO_REGISTRADO: { texto: 'Sobrantes no registrados', color: 'bg-orange-50 text-orange-800' },
  PRODUCIDO_DURANTE_CONTEO: { texto: 'Producidos durante el conteo', color: 'bg-gray-50 text-gray-700' },
  DADO_DE_BAJA: { texto: 'Dados de baja', color: 'bg-gray-100 text-gray-600' },
};

export default function InventariosCliente({ roles }: { roles: AsignacionRol[] }) {
  const sb = supabaseNavegador();
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [inventarios, setInventarios] = useState<Inventario[]>([]);
  const [nuevo, setNuevo] = useState<{ tienda: string; tipo: 'COMPLETO' | 'SELECTIVO'; categorias: string[] } | null>(null);
  const [abierto, setAbierto] = useState<Inventario | null>(null);
  const [detalle, setDetalle] = useState<Detalle[]>([]);
  const [error, setError] = useState('');
  const [inicial, setInicial] = useState<{
    tienda: string; archivo?: string; t?: Traslado; mapa?: Record<string, string>; ocupado?: boolean;
    resultado?: string; error?: string; aceptoBodega?: boolean;
  } | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  const tiendasSupervisables = useMemo(
    () =>
      tiendas.filter(
        (t) => puedeAdministrarOrg(roles, t.organizacion_id) || roles.some((r) => r.rol === 'SUPERVISOR' && r.tienda_id === t.id),
      ),
    [tiendas, roles],
  );

  const cargar = useCallback(async () => {
    const os = await cargarOrgsPropias(roles);
    setOrgs(os);
    const [t, c, i] = await Promise.all([
      sb.from('tiendas').select('*').in('organizacion_id', os.map((o) => o.id)).eq('activa', true).order('codigo'),
      sb.from('categorias').select('*').eq('activa', true).order('nombre'),
      sb.from('inventarios').select('*').order('creado_at', { ascending: false }).limit(200),
    ]);
    setTiendas((t.data as Tienda[]) || []);
    setCategorias((c.data as Categoria[]) || []);
    setInventarios((i.data as Inventario[]) || []);
  }, [roles, sb]);

  // Abrir el inventario inicial de una sucursal desde Sucursales (?inicial=<id>)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('inicial');
    if (id && tiendas.some((t) => t.id === id)) {
      setInicial({ tienda: id });
      window.history.replaceState(null, '', '/admin/inventarios');
    }
  }, [tiendas]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cargarDetalle = useCallback(
    async (inv: Inventario) => {
      const { data } = await sb.rpc('detalle_inventario', { p_id: inv.id });
      setDetalle((data as Detalle[]) || []);
    },
    [sb],
  );

  useEffect(() => {
    if (!abierto) return;
    cargarDetalle(abierto);
    if (abierto.estado !== 'ABIERTO') return;
    const t = setInterval(() => cargarDetalle(abierto), 15000);
    return () => clearInterval(t);
  }, [abierto, cargarDetalle]);

  const nombreTienda = (id: string) => {
    const t = tiendas.find((x) => x.id === id);
    return t ? `${t.codigo} · ${t.nombre}` : '';
  };

  const crear = async () => {
    if (!nuevo) return;
    setError('');
    if (!nuevo.tienda) return setError('Elige la tienda.');
    const r = await rpc<string>('crear_inventario', { p_tienda: nuevo.tienda, p_tipo: nuevo.tipo, p_categorias: nuevo.tipo === 'SELECTIVO' ? nuevo.categorias : [] });
    if (r.error) return setError(r.error);
    setNuevo(null);
    await cargar();
  };

  const cerrar = async () => {
    if (!abierto || !confirm('¿Cerrar el inventario? Ya no se podrán escanear más costales.')) return;
    const r = await rpc('cerrar_inventario', { p_id: abierto.id });
    if (r.error) return alert(r.error);
    setAbierto({ ...abierto, estado: 'CERRADO' });
    cargar();
  };

  const darBaja = async () => {
    if (!abierto || !confirm('Los costales faltantes quedarán dados de baja (ya no aparecerán en el stock). ¿Continuar?')) return;
    const r = await rpc<number>('dar_baja_faltantes', { p_id: abierto.id });
    if (r.error) return alert(r.error);
    alert(`${r.data} costales dados de baja.`);
    setAbierto({ ...abierto, bajas_aplicadas: true });
    cargar();
  };

  const clases = useMemo(() => Array.from(new Set(categorias.map((c) => claseDe(c.nombre)).filter(Boolean))).sort(), [categorias]);
  const marcarClase = (clase: string) => {
    if (!nuevo) return;
    const ids = categorias.filter((c) => claseDe(c.nombre) === clase).map((c) => c.id);
    const todas = ids.every((id) => nuevo.categorias.includes(id));
    setNuevo({
      ...nuevo,
      categorias: todas ? nuevo.categorias.filter((x) => !ids.includes(x)) : Array.from(new Set([...nuevo.categorias, ...ids])),
    });
  };

  const tiendaInicial = tiendas.find((x) => x.id === inicial?.tienda);
  const descargarPlantilla = () =>
    descargarExcel(
      `inventario_inicial_${tiendaInicial?.codigo ?? 'sucursal'}.xlsx`,
      { Traslado: plantillaTraslado(orgs.find((o) => o.id === tiendaInicial?.organizacion_id)?.nombre ?? '') },
      [40, 10, 10],
    );

  const leerInicial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo || !inicial) return;
    try {
      const celdas = await leerFilasExcel(archivo);
      if (tipoReporte(celdas) !== 'TRASLADO')
        return setInicial({ tienda: inicial.tienda, archivo: archivo.name, error: 'El archivo no tiene el formato de traslado (COSTAL # | PIEZAS | PESO).' });
      const t = leerTraslado(celdas);
      const nombres = categorias.map((c) => c.nombre);
      const mapa: Record<string, string> = {};
      new Set(t.costales.map((k) => k.seccion)).forEach((sec) => (mapa[sec] = buscarProducto(sec, nombres) ?? ''));
      setInicial({ tienda: inicial.tienda, archivo: archivo.name, t, mapa });
    } catch (err) {
      setInicial({ tienda: inicial.tienda, archivo: archivo.name, error: 'No se pudo leer el archivo: ' + (err as Error).message });
    }
  };

  const bodegaDistinta =
    !!inicial?.t && !!tiendaInicial && (tiendaInicial.bodega ?? '').toUpperCase() !== inicial.t.bodegaEntrada.toUpperCase();

  const confirmarInicial = async () => {
    if (!inicial?.t || !inicial.mapa) return;
    const { t, mapa } = inicial;
    setInicial({ ...inicial, ocupado: true, error: undefined });
    const r = await rpc<{ cargados: number; ya_estaban: number; tienda: string }>('cargar_existencia', {
      p_tienda: inicial.tienda,
      p_costales: t.costales.map((k) => ({ codigo: k.codigo, producto: mapa[k.seccion], piezas: k.piezas, peso: k.peso })),
    });
    if (r.error) return setInicial({ ...inicial, ocupado: false, error: r.error });
    setInicial({
      tienda: inicial.tienda,
      resultado: `${r.data!.tienda}: ${r.data!.cargados} costales agregados al stock` + (r.data!.ya_estaban ? `, ${r.data!.ya_estaban} ya estaban cargados.` : '.'),
    });
  };

  const avancePorProducto = useMemo(() => {
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

  const grupos = useMemo(() => {
    const m = new Map<string, Detalle[]>();
    detalle.forEach((d) => m.set(d.resultado, [...(m.get(d.resultado) ?? []), d]));
    return Array.from(m.entries());
  }, [detalle]);
  const esperados = detalle.filter((d) => !d.resultado.startsWith('SOBRANTE')).length;
  const leidos = detalle.filter((d) => d.leido_at).length;

  return (
    <div>
      <Titulo
        accion={
          tiendasSupervisables.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Boton variante="secundario" onClick={() => setInicial({ tienda: tiendasSupervisables.find((t) => !t.es_central)?.id ?? tiendasSupervisables[0].id })}>
                📄 Inventario inicial (Excel)
              </Boton>
              <Boton onClick={() => { setNuevo({ tienda: tiendasSupervisables[0]?.id ?? '', tipo: 'COMPLETO', categorias: [] }); setError(''); }}>
                + Inventario
              </Boton>
            </div>
          )
        }
      >
        Inventarios
      </Titulo>
      <p className="mb-4 text-sm text-gray-500">
        Al abrir un inventario, el celular de la tienda muestra el botón &quot;Inventario&quot; y los empleados escanean los costales que encuentran. El sistema compara contra el stock que había al abrirlo.
      </p>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {inventarios.length === 0 && <p className="text-sm text-gray-400">Sin inventarios.</p>}
        {inventarios.map((i) => (
          <Tarjeta key={i.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="font-black">{nombreTienda(i.tienda_id)}</p>
              <p className="text-xs text-gray-500">
                {i.tipo === 'COMPLETO' ? 'Completo' : `Selectivo (${i.categorias.length} productos)`} · {new Date(i.creado_at).toLocaleString()}
              </p>
              {i.resumen && (
                <p className="mt-1 text-xs">
                  <span className="font-bold text-green-700">{i.resumen.ENCONTRADO ?? 0} encontrados</span> ·{' '}
                  <span className="font-bold text-red-700">{i.resumen.FALTANTE ?? 0} faltantes</span> ·{' '}
                  <span className="font-bold text-orange-700">{(i.resumen.SOBRANTE ?? 0) + (i.resumen.SOBRANTE_NO_REGISTRADO ?? 0)} sobrantes</span>
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Insignia color={i.estado === 'ABIERTO' ? 'indigo' : 'gray'}>{i.estado === 'ABIERTO' ? 'Abierto' : 'Cerrado'}</Insignia>
              <Boton variante="suave" className="px-3 py-1 text-xs" onClick={() => { setDetalle([]); setAbierto(i); }}>Ver</Boton>
            </div>
          </Tarjeta>
        ))}
      </div>

      {nuevo && (
        <Modal titulo="Nuevo inventario" onCerrar={() => setNuevo(null)}>
          <Campo etiqueta="Tienda">
            <Selector value={nuevo.tienda} onChange={(e) => setNuevo({ ...nuevo, tienda: e.target.value })}>
              {tiendasSupervisables.map((t) => <option key={t.id} value={t.id}>{t.codigo} · {t.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Tipo">
            <Selector value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as 'COMPLETO' | 'SELECTIVO' })}>
              <option value="COMPLETO">Completo (todo el stock)</option>
              <option value="SELECTIVO">Selectivo (solo algunos productos)</option>
            </Selector>
          </Campo>
          {nuevo.tipo === 'SELECTIVO' && (
            <Campo etiqueta="Productos a contar">
              {clases.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {clases.map((cl) => {
                    const ids = categorias.filter((c) => claseDe(c.nombre) === cl).map((c) => c.id);
                    const activa = ids.every((id) => nuevo.categorias.includes(id));
                    return (
                      <button
                        key={cl}
                        type="button"
                        onClick={() => marcarClase(cl)}
                        className={`rounded-full px-4 py-1.5 text-sm font-black ${activa ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700'}`}
                      >
                        Toda la {cl}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl bg-gray-50 p-3">
                {categorias.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={nuevo.categorias.includes(c.id)}
                        onChange={() =>
                          setNuevo({
                            ...nuevo,
                            categorias: nuevo.categorias.includes(c.id) ? nuevo.categorias.filter((x) => x !== c.id) : [...nuevo.categorias, c.id],
                          })
                        }
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

      {inicial && (
        <Modal ancho titulo="Inventario inicial desde Excel" onCerrar={() => setInicial(null)}>
          <p className="text-sm text-gray-500">
            Carga de una sola vez los costales que ya tiene la tienda. Usa el <b>mismo formato del traslado</b> (reporte del sistema o la
            plantilla): COSTAL # · PIEZAS · PESO, agrupado por clasificación y producto. La <b>BODEGA DE ENTRADA</b> debe ser la de esta tienda.
          </p>
          {tiendaInicial?.inicial_cerrado_at && (
            <Aviso tipo="error">El inventario inicial de esta tienda ya está cerrado. Solo la plataforma puede reabrirlo.</Aviso>
          )}
          <Campo etiqueta="Número de tienda">
            <Selector value={inicial.tienda} onChange={(e) => setInicial({ tienda: e.target.value })}>
              {tiendasSupervisables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.codigo} · {t.nombre}
                  {t.bodega ? ` (bodega ${t.bodega})` : ''}
                  {t.inicial_cerrado_at ? ' — inicial cerrado' : ''}
                </option>
              ))}
            </Selector>
          </Campo>
          <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" onClick={descargarPlantilla}>⬇ Descargar plantilla</Boton>
            <input ref={archivoRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={leerInicial} />
            <Boton onClick={() => archivoRef.current?.click()}>⬆ Subir Excel</Boton>
          </div>
          {inicial.resultado && <Aviso tipo="exito">{inicial.resultado}</Aviso>}
          {inicial.error && <Aviso tipo="error">{inicial.error}</Aviso>}
          {inicial.t && inicial.mapa && (
            <>
              <p className="text-sm font-bold">
                {inicial.archivo}: {inicial.t.costales.length} costales · {inicial.t.costales.reduce((s, k) => s + k.piezas, 0).toLocaleString()} piezas ·
                bodega de entrada {inicial.t.bodegaEntrada || '—'}
              </p>
              {inicial.t.avisos.slice(0, 6).map((a) => <Aviso key={a} tipo="error">{a}</Aviso>)}
              {bodegaDistinta && (
                <div className="space-y-2 rounded-2xl border-l-4 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-black">
                    La bodega de entrada del archivo ({inicial.t.bodegaEntrada || 'vacía'}) no coincide con la tienda seleccionada (
                    {tiendaInicial?.codigo}, bodega {tiendaInicial?.bodega || 'sin asignar'}).
                  </p>
                  <label className="flex items-center gap-2 font-bold">
                    <input type="checkbox" checked={!!inicial.aceptoBodega} onChange={(e) => setInicial({ ...inicial, aceptoBodega: e.target.checked })} />
                    Revisé el archivo y sí es de esta tienda
                  </label>
                </div>
              )}
              <MapeoProductos
                costales={inicial.t.costales}
                productos={categorias}
                mapa={inicial.mapa}
                onCambio={(mapa) => setInicial({ ...inicial, mapa })}
                permitirCrear={false}
              />
              <Boton
                className="w-full"
                disabled={inicial.ocupado || Object.values(inicial.mapa).some((v) => !v) || (bodegaDistinta && !inicial.aceptoBodega)}
                onClick={confirmarInicial}
              >
                {inicial.ocupado
                  ? 'Cargando…'
                  : Object.values(inicial.mapa).some((v) => !v)
                    ? 'Elige el producto de cada sección'
                    : `Confirmar: agregar ${inicial.t.costales.length} costales al stock de ${tiendaInicial?.codigo ?? ''}`}
              </Boton>
            </>
          )}
        </Modal>
      )}

      {abierto && (
        <Modal titulo={`Inventario · ${nombreTienda(abierto.tienda_id)}`} onCerrar={() => setAbierto(null)}>
          <div className="flex items-center justify-between rounded-2xl bg-indigo-50 p-3 text-sm">
            <span className="font-bold text-indigo-800">{abierto.estado === 'ABIERTO' ? 'En curso (se actualiza solo)' : 'Cerrado'}</span>
            <span className="font-black text-indigo-700">{leidos} leídos / {esperados} esperados</span>
          </div>
          {avancePorProducto.length > 0 && (
            <div className="space-y-1 rounded-2xl bg-gray-50 p-3">
              <p className="text-xs font-black uppercase tracking-wide text-gray-400">Avance por producto</p>
              {avancePorProducto.map(([p, x]) => (
                <div key={p} className="text-sm">
                  <div className="flex justify-between font-bold">
                    <span>{p}</span>
                    <span className={x.encontrados === x.esperados ? 'text-green-700' : 'text-gray-600'}>
                      {x.encontrados} / {x.esperados}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-gray-200">
                    <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${x.esperados ? (100 * x.encontrados) / x.esperados : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {grupos.map(([resultado, filas]) => (
            <details key={resultado} open={resultado === 'FALTANTE'} className={`rounded-2xl p-3 ${RESULTADOS[resultado]?.color ?? 'bg-gray-50'}`}>
              <summary className="cursor-pointer text-sm font-black">
                {RESULTADOS[resultado]?.texto ?? resultado}: {filas.length}
              </summary>
              <div className="mt-2 space-y-1 text-xs">
                {filas.map((d) => (
                  <div key={d.codigo} className="flex justify-between">
                    <span className="font-mono font-bold">{d.codigo}</span>
                    <span>{d.producto ?? '—'}{d.empleado ? ` · ${d.empleado}` : ''}</span>
                  </div>
                ))}
              </div>
            </details>
          ))}
          {grupos.length === 0 && <p className="text-sm text-gray-400">Sin datos todavía.</p>}
          {abierto.estado === 'ABIERTO' && <Boton className="w-full" variante="secundario" onClick={cerrar}>Cerrar inventario</Boton>}
          {abierto.estado === 'CERRADO' && !abierto.bajas_aplicadas && puedeAdministrarOrg(roles, abierto.organizacion_id) && (detalle.some((d) => d.resultado === 'FALTANTE')) && (
            <Boton className="w-full" variante="peligro" onClick={darBaja}>Dar de baja los faltantes</Boton>
          )}
        </Modal>
      )}
    </div>
  );
}
