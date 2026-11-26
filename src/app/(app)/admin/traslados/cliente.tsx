'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cargarOrgsPropias, rpc } from '@/lib/datos';
import { descargarExcel, leerFilasExcel } from '@/lib/excel';
import {
  buscarProducto,
  leerExistenciaCC,
  leerTraslado,
  plantillaExistenciaCC,
  plantillaTraslado,
  tipoReporte,
  type ExistenciaCC,
  type Traslado,
} from '@/lib/traslado';
import type { AsignacionRol, Categoria, Organizacion, Tienda } from '@/lib/tipos';
import { useOrgActiva } from '@/components/selector-org';
import { CREAR, MapeoProductos, productoDe } from '@/components/mapeo-productos';
import { Aviso, Boton, Entrada, Insignia, Modal, Selector, Tarjeta, Titulo } from '@/components/ui';

type Resumen = {
  id: string; numero: string; fecha: string | null; referencia: string | null; created_at: string;
  centro: string; tienda: string; tienda_org: string;
  total_costales: number; total_piezas: number;
  recibidos: number; pendientes: number; piezas_pendientes: number;
  sin_existencia: string[]; revisado_at: string | null; nota_revision: string | null;
};
type Detalle = {
  codigo: string; producto: string | null; piezas: number | null; peso: number | null;
  estado: string; recibido_at: string | null; recibido_por: string | null;
};
type Carga =
  | { modo: 'TRASLADO'; archivo: string; t: Traslado; mapa: Record<string, string> }
  | { modo: 'EXISTENCIA'; archivo: string; e: ExistenciaCC; mapa: Record<string, string> };

const n = (x: number) => x.toLocaleString();

export default function TrasladosCliente({ roles, soloLectura }: { roles: AsignacionRol[]; soloLectura: boolean }) {
  const sb = supabaseNavegador();
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [orgId] = useOrgActiva(orgs);
  const [centros, setCentros] = useState<Tienda[]>([]);
  const [centroId, setCentroId] = useState('');
  const [productos, setProductos] = useState<Categoria[]>([]);
  const [lista, setLista] = useState<Resumen[]>([]);
  const [carga, setCarga] = useState<Carga | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [detalle, setDetalle] = useState<{ r: Resumen; filas: Detalle[] } | null>(null);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [nota, setNota] = useState('');
  const archivoRef = useRef<HTMLInputElement>(null);
  const existenciaRef = useRef<HTMLInputElement>(null);

  const puedeCargar =
    !soloLectura && !!orgId && roles.some((r) => r.organizacion_id === orgId && (r.rol === 'ADMIN_ORG' || r.rol === 'BODEGA'));
  const nombreOrg = orgs.find((o) => o.id === orgId)?.nombre ?? '';

  useEffect(() => {
    cargarOrgsPropias(roles).then(setOrgs);
  }, [roles]);

  const cargar = useCallback(async () => {
    if (!orgId) return;
    const [c, p, r] = await Promise.all([
      sb.from('tiendas').select('*').eq('organizacion_id', orgId).eq('es_central', true).eq('activa', true).order('codigo'),
      sb.from('categorias').select('*').eq('organizacion_id', orgId).order('nombre'),
      sb.rpc('traslados_lista', { p_org: orgId }),
    ]);
    const cs = (c.data as Tienda[]) || [];
    setCentros(cs);
    setCentroId((x) => (x && cs.some((k) => k.id === x) ? x : cs[0]?.id ?? ''));
    setProductos((p.data as Categoria[]) || []);
    setLista((r.data as Resumen[]) || []);
  }, [orgId, sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const mapear = (secciones: string[]) => {
    const nombres = productos.filter((p) => p.activa).map((p) => p.nombre);
    const mapa: Record<string, string> = {};
    new Set(secciones).forEach((s) => (mapa[s] = buscarProducto(s, nombres) ?? CREAR));
    return mapa;
  };

  const elegirArchivo = (modo: Carga['modo']) => async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = '';
    if (!archivo) return;
    setError('');
    setAviso('');
    try {
      const filas = await leerFilasExcel(archivo);
      const tipo = tipoReporte(filas);
      if (modo === 'EXISTENCIA') {
        if (tipo !== 'EXISTENCIA_CC')
          return setError('Este archivo no es el Reporte de Existencias de Costales (con EMBARQUE NO.). Para traslados usa "Cargar traslado".');
        const e = leerExistenciaCC(filas);
        if (!e.costales.length) return setError(e.avisos[0] ?? 'No se encontraron costales.');
        setCarga({ modo, archivo: archivo.name, e, mapa: mapear(e.costales.map((k) => k.seccion)) });
      } else {
        if (tipo !== 'TRASLADO') return setError('Este archivo no es un reporte de traslado (COSTAL # | PIEZAS | PESO).');
        const t = leerTraslado(filas);
        if (!t.costales.length) return setError('No se encontraron costales en el archivo.');
        const salida = centros.find((c) => (c.bodega || c.codigo).toUpperCase() === t.bodegaSalida.toUpperCase());
        if (salida) setCentroId(salida.id);
        setCarga({ modo, archivo: archivo.name, t, mapa: mapear(t.costales.map((k) => k.seccion)) });
      }
    } catch (err) {
      setError('No se pudo leer el archivo: ' + (err as Error).message);
    }
  };

  const confirmar = async () => {
    if (!carga || !centroId) return;
    setOcupado(true);
    setError('');
    if (carga.modo === 'EXISTENCIA') {
      const r = await rpc<{ cargados: number; ya_estaban: number; productos_nuevos: number; tienda: string }>('cargar_existencia', {
        p_tienda: centroId,
        p_costales: carga.e.costales.map((k) => ({
          codigo: k.codigo, producto: productoDe(k, carga.mapa), piezas: k.piezas, peso: k.peso, contenedor: k.contenedor, fecha: k.fecha,
        })),
      });
      setOcupado(false);
      if (r.error) return setError(r.error);
      setCarga(null);
      setAviso(
        `Existencia de ${r.data!.tienda}: ${n(r.data!.cargados)} costales agregados` +
          (r.data!.ya_estaban ? `, ${n(r.data!.ya_estaban)} ya estaban cargados` : '') +
          (r.data!.productos_nuevos ? `. Se crearon ${r.data!.productos_nuevos} productos nuevos.` : '.'),
      );
      return cargar();
    }
    const { t, mapa } = carga;
    const { data, error } = await rpc<{ tienda: string; costales: number; piezas: number; productos_nuevos: number; sin_existencia: string[] }>(
      'importar_traslado',
      {
        p_centro: centroId,
        p_numero: t.numero,
        p_fecha: t.fecha,
        p_referencia: t.referencia,
        p_bodega_entrada: t.bodegaEntrada,
        p_archivo: carga.archivo,
        p_costales: t.costales.map((k) => ({ codigo: k.codigo, producto: productoDe(k, mapa), piezas: k.piezas, peso: k.peso })),
        p_total_piezas: t.totalPiezas,
        p_total_precio: null,
      },
    );
    setOcupado(false);
    if (error) return setError(error);
    setCarga(null);
    setAviso(
      `Traslado ${t.numero} cargado: ${data!.costales} costales (${n(data!.piezas)} piezas) en camino a ${data!.tienda}.` +
        (data!.productos_nuevos ? ` Se crearon ${data!.productos_nuevos} productos nuevos.` : ''),
    );
    if (data!.sin_existencia?.length)
      setError(
        `Atención: ${data!.sin_existencia.length} costales de este traslado no estaban en el inventario del centro. ` +
          'Se enviaron igual; revísalos en el detalle del traslado.',
      );
    cargar();
  };

  const verDetalle = async (r: Resumen) => {
    const { data } = await sb.rpc('detalle_traslado', { p_id: r.id });
    setSoloPendientes(r.pendientes > 0 && r.recibidos > 0);
    setDetalle({ r, filas: (data as Detalle[]) || [] });
  };

  const anular = async (r: Resumen) => {
    if (!confirm(`¿Anular el traslado ${r.numero}? Sus costales regresan al inventario del centro.`)) return;
    const { error } = await rpc('anular_traslado', { p_id: r.id });
    if (error) return alert(error);
    setDetalle(null);
    cargar();
  };

  const marcarRevisado = async (r: Resumen) => {
    const { error } = await rpc('revisar_traslado', { p_id: r.id, p_nota: nota });
    if (error) return alert(error);
    setNota('');
    setDetalle(null);
    cargar();
  };
  const porRevisar = lista.filter((r) => r.sin_existencia.length > 0 && !r.revisado_at);

  const costalesCarga = carga ? (carga.modo === 'EXISTENCIA' ? carga.e.costales : carga.t.costales) : [];
  const sinMapear = carga ? Object.values(carga.mapa).some((v) => !v) : false;

  return (
    <div>
      <Titulo
        accion={
          puedeCargar &&
          centros.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <input ref={archivoRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={elegirArchivo('TRASLADO')} />
              <input ref={existenciaRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={elegirArchivo('EXISTENCIA')} />
              <Boton variante="secundario" onClick={() => existenciaRef.current?.click()}>📦 Existencias / producción del centro</Boton>
              <Boton onClick={() => archivoRef.current?.click()}>⬆ Cargar traslado</Boton>
            </div>
          )
        }
      >
        Traslados
      </Titulo>
      <div className="mb-4 space-y-2 text-sm text-gray-500">
        <p>
          <b>Existencias / producción del centro:</b> sube el <b>Reporte de Existencias de Costales</b> del sistema. Sirve para la existencia
          inicial del centro y para cargar la producción de cada contenedor (EMBARQUE NO.). Los costales que ya estaban no se duplican.
        </p>
        <p>
          <b>Traslado:</b> sube el reporte del traslado (COSTAL # · PIEZAS · PESO). Los costales salen de la existencia del centro y quedan{' '}
          <b>en tránsito</b> hasta que la tienda los escanea. Aquí ves cuántos costales y piezas faltan por llegar.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="font-bold text-gray-600">Plantillas:</span>
          <button className="font-bold text-indigo-600" onClick={() => descargarExcel('plantilla_existencias_cc.xlsx', { Existencias: plantillaExistenciaCC(nombreOrg) }, [8, 14, 2, 12, 16, 10, 8, 2, 8])}>
            ⬇ Existencias / producción del centro
          </button>
          <button className="font-bold text-indigo-600" onClick={() => descargarExcel('plantilla_traslado.xlsx', { Traslado: plantillaTraslado(nombreOrg) }, [40, 10, 10])}>
            ⬇ Traslado / existencia inicial de tienda
          </button>
        </p>
      </div>
      {porRevisar.length > 0 && (
        <div className="mb-4">
          <Aviso tipo="error">
            ⚠ {porRevisar.length} traslado{porRevisar.length > 1 ? 's tienen' : ' tiene'} costales que no estaban en el inventario del
            centro ({porRevisar.map((r) => '#' + r.numero).join(', ')}). Ábrelos para revisar y marcarlos como revisados.
          </Aviso>
        </div>
      )}
      {puedeCargar && centros.length === 0 && (
        <div className="mb-4">
          <Aviso tipo="info">Para cargar traslados, la organización necesita una sucursal marcada como centro de distribución.</Aviso>
        </div>
      )}
      {aviso && <div className="mb-4"><Aviso tipo="exito">{aviso}</Aviso></div>}
      {error && !carga && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}

      <div className="overflow-x-auto rounded-3xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead className="bg-gray-50 text-xs font-black uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Traslado</th>
              <th className="px-4 py-3">Destino</th>
              <th className="px-4 py-3 text-right">Costales</th>
              <th className="px-4 py-3 text-right">Piezas</th>
              <th className="px-4 py-3">Recepción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lista.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-gray-50" onClick={() => verDetalle(r)}>
                <td className="px-4 py-3">
                  <p className="font-black">#{r.numero}</p>
                  <p className="text-xs text-gray-400">{r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString() : ''} · {r.referencia ?? ''}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-bold">{r.tienda}</p>
                  <p className="text-xs text-gray-400">{r.tienda_org}</p>
                </td>
                <td className="px-4 py-3 text-right font-mono">{r.total_costales}</td>
                <td className="px-4 py-3 text-right font-mono">{n(r.total_piezas)}</td>
                <td className="px-4 py-3">
                  {r.pendientes === 0 ? (
                    <Insignia color="green">Completo</Insignia>
                  ) : r.recibidos === 0 ? (
                    <Insignia>En tránsito</Insignia>
                  ) : (
                    <Insignia color="red">Faltan {r.pendientes} · {n(r.piezas_pendientes)} pzs</Insignia>
                  )}
                  <p className="mt-1 text-xs text-gray-400">{r.recibidos} de {r.total_costales} recibidos</p>
                  {r.sin_existencia.length > 0 && (
                    <p className={`mt-1 text-xs font-bold ${r.revisado_at ? 'text-gray-400' : 'text-red-600'}`}>
                      ⚠ {r.sin_existencia.length} sin existencia en el centro{r.revisado_at ? ' (revisado)' : ''}
                    </p>
                  )}
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin traslados todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {carga && (
        <Modal
          ancho
          titulo={carga.modo === 'EXISTENCIA' ? 'Existencias / producción del centro' : `Traslado #${carga.t.numero || '?'}`}
          onCerrar={() => setCarga(null)}
        >
          {carga.modo === 'EXISTENCIA' ? (
            <>
              <Aviso tipo="info">
                Estos costales se agregan a la existencia del centro (no se envían a ninguna tienda). Los que ya estaban cargados se omiten.
                {carga.e.enviadosOmitidos > 0 && ` Se omitieron ${carga.e.enviadosOmitidos} costales que ya tienen fecha de envío.`}
              </Aviso>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Dato e="Fecha del reporte" v={carga.e.fecha ? new Date(carga.e.fecha + 'T12:00:00').toLocaleDateString() : '—'} />
                <Dato e="Contenedores" v={String(carga.e.contenedores.length)} />
                <Dato e="Costales" v={n(carga.e.costales.length)} />
                <Dato e="Piezas" v={n(carga.e.costales.reduce((s, k) => s + k.piezas, 0))} />
              </div>
              <details className="rounded-2xl bg-gray-50 p-3 text-sm">
                <summary className="cursor-pointer font-black">Por contenedor ({carga.e.contenedores.length})</summary>
                <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {carga.e.contenedores.map((c) => (
                    <div key={c.contenedor} className="flex justify-between rounded-xl bg-white px-3 py-1.5">
                      <span className="font-bold">{c.contenedor}</span>
                      <span className="font-mono text-gray-600">{n(c.costales)} costales · {n(c.piezas)} pzs</span>
                    </div>
                  ))}
                </div>
              </details>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Dato e="Fecha" v={carga.t.fecha ? new Date(carga.t.fecha + 'T12:00:00').toLocaleDateString() : '—'} />
                <Dato e="Bodega de entrada" v={carga.t.bodegaEntrada || '—'} />
                <Dato e="Costales" v={String(carga.t.costales.length)} />
                <Dato e="Piezas" v={n(carga.t.costales.reduce((s, k) => s + k.piezas, 0))} />
              </div>
              {carga.t.referencia && <p className="text-sm text-gray-500">Referencia: {carga.t.referencia}</p>}
            </>
          )}
          {centros.length > 1 && (
            <label className="block text-sm font-bold">
              {carga.modo === 'EXISTENCIA' ? 'Centro' : 'Sale de'}
              <Selector value={centroId} onChange={(e) => setCentroId(e.target.value)}>
                {centros.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}
              </Selector>
            </label>
          )}
          {(carga.modo === 'EXISTENCIA' ? carga.e.avisos : carga.t.avisos).slice(0, 8).map((a) => <Aviso key={a} tipo="error">{a}</Aviso>)}

          <MapeoProductos
            costales={costalesCarga}
            productos={productos}
            mapa={carga.mapa}
            onCambio={(mapa) => setCarga({ ...carga, mapa } as Carga)}
            permitirCrear
          />
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton className="w-full" disabled={ocupado || !centroId || sinMapear} onClick={confirmar}>
            {ocupado
              ? 'Cargando…'
              : carga.modo === 'EXISTENCIA'
                ? `Confirmar: agregar ${n(carga.e.costales.length)} costales a la existencia del centro`
                : `Confirmar: ${carga.t.costales.length} costales en camino a ${carga.t.bodegaEntrada}`}
          </Boton>
        </Modal>
      )}

      {detalle && (
        <Modal ancho titulo={`Traslado #${detalle.r.numero} → ${detalle.r.tienda}`} onCerrar={() => setDetalle(null)}>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Dato e="Recibidos" v={`${detalle.r.recibidos} de ${detalle.r.total_costales}`} />
            <Dato e="Costales que faltan" v={String(detalle.r.pendientes)} />
            <Dato e="Piezas que faltan" v={n(detalle.r.piezas_pendientes)} />
            <Dato e="Piezas del traslado" v={n(detalle.r.total_piezas)} />
          </div>
          {detalle.r.sin_existencia.length > 0 && (
            <div className={`space-y-2 rounded-2xl p-4 ${detalle.r.revisado_at ? 'bg-gray-50' : 'bg-red-50'}`}>
              <p className="text-sm font-black text-red-700">⚠ {detalle.r.sin_existencia.length} costales no estaban en el inventario del centro</p>
              <p className="font-mono text-xs text-gray-600">{detalle.r.sin_existencia.join(', ')}</p>
              {detalle.r.revisado_at ? (
                <p className="text-xs text-gray-500">
                  Revisado el {new Date(detalle.r.revisado_at).toLocaleString()}
                  {detalle.r.nota_revision ? `: ${detalle.r.nota_revision}` : ''}
                </p>
              ) : (
                puedeCargar && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Entrada placeholder="Nota (qué se encontró)" value={nota} onChange={(e) => setNota(e.target.value)} />
                    <Boton variante="secundario" onClick={() => marcarRevisado(detalle.r)}>Marcar revisado</Boton>
                  </div>
                )
              )}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
            Ver solo los que no han llegado
          </label>
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-black uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Costal</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Piezas</th>
                  <th className="px-3 py-2 text-right">Peso</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {detalle.filas
                  .filter((f) => !soloPendientes || f.estado === 'EN_TRANSITO')
                  .map((f) => (
                    <tr key={f.codigo}>
                      <td className="px-3 py-2 font-mono font-bold">{f.codigo}</td>
                      <td className="px-3 py-2">{f.producto}</td>
                      <td className="px-3 py-2 text-right font-mono">{f.piezas}</td>
                      <td className="px-3 py-2 text-right font-mono">{f.peso ?? '—'}</td>
                      <td className="px-3 py-2">
                        {f.estado === 'EN_TRANSITO' ? (
                          <Insignia color="red">No ha llegado</Insignia>
                        ) : (
                          <span className="text-xs text-gray-500">
                            <Insignia color="green">Recibido</Insignia> {f.recibido_at ? new Date(f.recibido_at).toLocaleString() : ''} {f.recibido_por ?? ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {puedeCargar && detalle.r.recibidos === 0 && (
            <Boton variante="secundario" className="w-full" onClick={() => anular(detalle.r)}>
              Anular traslado (cargado por error)
            </Boton>
          )}
        </Modal>
      )}
    </div>
  );
}

function Dato({ e, v }: { e: string; v: string }) {
  return (
    <Tarjeta className="p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-gray-400">{e}</p>
      <p className="font-black">{v}</p>
    </Tarjeta>
  );
}
