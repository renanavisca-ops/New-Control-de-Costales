'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cargarOrgsPropias, rpc } from '@/lib/datos';
import { leerFilasExcel } from '@/lib/excel';
import { buscarProducto, leerTraslado, type Traslado } from '@/lib/traslado';
import type { AsignacionRol, Categoria, Organizacion, Tienda } from '@/lib/tipos';
import { useOrgActiva } from '@/components/selector-org';
import { Aviso, Boton, Insignia, Modal, Selector, Tarjeta, Titulo } from '@/components/ui';

type Resumen = {
  id: string; numero: string; fecha: string | null; referencia: string | null; created_at: string;
  centro: string; tienda: string; tienda_org: string;
  total_costales: number; total_piezas: number; total_precio: number;
  recibidos: number; pendientes: number; valor_pendiente: number;
};
type Detalle = {
  codigo: string; producto: string | null; piezas: number | null; precio: number | null; peso: number | null;
  estado: string; recibido_at: string | null; recibido_por: string | null;
};
type Carga = { archivo: string; t: Traslado; mapa: Record<string, string> };

const q = (n: number | null | undefined) =>
  'Q' + Number(n ?? 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CREAR = '__crear__';

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
  const archivoRef = useRef<HTMLInputElement>(null);

  const puedeCargar =
    !soloLectura && !!orgId && roles.some((r) => r.organizacion_id === orgId && (r.rol === 'ADMIN_ORG' || r.rol === 'BODEGA'));

  useEffect(() => {
    cargarOrgsPropias(roles).then(setOrgs);
  }, [roles]);

  const cargar = useCallback(async () => {
    if (!orgId) return;
    const [c, p, r] = await Promise.all([
      sb.from('tiendas').select('*').eq('organizacion_id', orgId).eq('es_central', true).eq('activa', true).order('codigo'),
      sb.from('categorias').select('*').eq('organizacion_id', orgId).order('nombre'),
      sb.rpc('resumen_traslados', { p_org: orgId }),
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

  const elegirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (archivoRef.current) archivoRef.current.value = '';
    if (!archivo) return;
    setError('');
    setAviso('');
    try {
      const t = leerTraslado(await leerFilasExcel(archivo));
      if (!t.costales.length) return setError('No se encontraron costales en el archivo. ¿Es el reporte de traslado?');
      const nombres = productos.filter((p) => p.activa).map((p) => p.nombre);
      const mapa: Record<string, string> = {};
      new Set(t.costales.map((k) => k.seccion)).forEach((s) => (mapa[s] = buscarProducto(s, nombres) ?? CREAR));
      const centroSalida = centros.find((c) => (c.bodega || c.codigo).toUpperCase() === t.bodegaSalida.toUpperCase());
      if (centroSalida) setCentroId(centroSalida.id);
      setCarga({ archivo: archivo.name, t, mapa });
    } catch (err) {
      setError('No se pudo leer el archivo: ' + (err as Error).message);
    }
  };

  const secciones = useMemo(() => {
    if (!carga) return [];
    const m = new Map<string, { costales: number; piezas: number; precio: number }>();
    carga.t.costales.forEach((k) => {
      const x = m.get(k.seccion) ?? { costales: 0, piezas: 0, precio: 0 };
      x.costales++;
      x.piezas += k.piezas;
      x.precio += k.precio;
      m.set(k.seccion, x);
    });
    return Array.from(m.entries());
  }, [carga]);

  const confirmar = async () => {
    if (!carga || !centroId) return;
    setOcupado(true);
    setError('');
    const { t, mapa } = carga;
    const { data, error } = await rpc<{ tienda: string; costales: number; piezas: number; precio: number; productos_nuevos: number }>(
      'importar_traslado',
      {
        p_centro: centroId,
        p_numero: t.numero,
        p_fecha: t.fecha,
        p_referencia: t.referencia,
        p_bodega_entrada: t.bodegaEntrada,
        p_archivo: carga.archivo,
        p_costales: t.costales.map((k) => ({
          codigo: k.codigo,
          producto: mapa[k.seccion] === CREAR ? k.seccion : mapa[k.seccion],
          piezas: k.piezas,
          precio: k.precio,
          peso: k.peso,
        })),
        p_total_piezas: t.totalPiezas,
        p_total_precio: t.totalPrecio,
      },
    );
    setOcupado(false);
    if (error) return setError(error);
    setCarga(null);
    setAviso(
      `Traslado ${t.numero} cargado: ${data!.costales} costales (${data!.piezas} piezas, ${q(data!.precio)}) en camino a ${data!.tienda}.` +
        (data!.productos_nuevos ? ` Se crearon ${data!.productos_nuevos} productos nuevos.` : ''),
    );
    cargar();
  };

  const verDetalle = async (r: Resumen) => {
    const { data } = await sb.rpc('detalle_traslado', { p_id: r.id });
    setSoloPendientes(r.pendientes > 0 && r.recibidos > 0);
    setDetalle({ r, filas: (data as Detalle[]) || [] });
  };

  const anular = async (r: Resumen) => {
    if (!confirm(`¿Anular el traslado ${r.numero}? Se borrarán sus ${r.total_costales} costales en tránsito.`)) return;
    const { error } = await rpc('anular_traslado', { p_id: r.id });
    if (error) return alert(error);
    setDetalle(null);
    cargar();
  };

  return (
    <div>
      <Titulo
        accion={
          puedeCargar &&
          centros.length > 0 && (
            <>
              <input ref={archivoRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={elegirArchivo} />
              <Boton onClick={() => archivoRef.current?.click()}>⬆ Cargar traslado (Excel)</Boton>
            </>
          )
        }
      >
        Traslados
      </Titulo>
      <p className="mb-4 text-sm text-gray-500">
        El centro de distribución sube el Excel del traslado. Los costales quedan <b>en tránsito</b> hasta que la tienda los escanea al
        recibirlos. Aquí ves cuántos faltan por llegar y su valor.
      </p>
      {puedeCargar && centros.length === 0 && (
        <div className="mb-4">
          <Aviso tipo="info">Para cargar traslados, la organización necesita una sucursal marcada como centro de distribución.</Aviso>
        </div>
      )}
      {aviso && <div className="mb-4"><Aviso tipo="exito">{aviso}</Aviso></div>}
      {error && !carga && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}

      <div className="overflow-x-auto rounded-3xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="bg-gray-50 text-xs font-black uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Traslado</th>
              <th className="px-4 py-3">Destino</th>
              <th className="px-4 py-3 text-right">Costales</th>
              <th className="px-4 py-3 text-right">Piezas</th>
              <th className="px-4 py-3 text-right">Valor</th>
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
                <td className="px-4 py-3 text-right font-mono">{r.total_piezas.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-mono">{q(r.total_precio)}</td>
                <td className="px-4 py-3">
                  {r.pendientes === 0 ? (
                    <Insignia color="green">Completo</Insignia>
                  ) : r.recibidos === 0 ? (
                    <Insignia>En tránsito</Insignia>
                  ) : (
                    <Insignia color="red">Faltan {r.pendientes} · {q(r.valor_pendiente)}</Insignia>
                  )}
                  <p className="mt-1 text-xs text-gray-400">{r.recibidos} de {r.total_costales} recibidos</p>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin traslados todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {carga && (
        <Modal ancho titulo={`Traslado #${carga.t.numero || '?'}`} onCerrar={() => setCarga(null)}>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Dato e="Fecha" v={carga.t.fecha ? new Date(carga.t.fecha + 'T12:00:00').toLocaleDateString() : '—'} />
            <Dato e="Bodega de entrada" v={carga.t.bodegaEntrada || '—'} />
            <Dato e="Costales" v={String(carga.t.costales.length)} />
            <Dato e="Piezas · valor" v={`${carga.t.costales.reduce((s, k) => s + k.piezas, 0).toLocaleString()} · ${q(carga.t.costales.reduce((s, k) => s + k.precio, 0))}`} />
          </div>
          {carga.t.referencia && <p className="text-sm text-gray-500">Referencia: {carga.t.referencia}</p>}
          {centros.length > 1 && (
            <label className="block text-sm font-bold">
              Sale de
              <Selector value={centroId} onChange={(e) => setCentroId(e.target.value)}>
                {centros.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}
              </Selector>
            </label>
          )}
          {carga.t.avisos.map((a) => <Aviso key={a} tipo="error">{a}</Aviso>)}

          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-black uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">En el Excel</th>
                  <th className="px-3 py-2">Producto en el sistema</th>
                  <th className="px-3 py-2 text-right">Costales</th>
                  <th className="px-3 py-2 text-right">Piezas</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {secciones.map(([s, x]) => {
                  const prod = productos.find((p) => p.nombre === carga.mapa[s]);
                  const promedio = x.piezas / x.costales;
                  return (
                    <tr key={s}>
                      <td className="px-3 py-2 font-bold">{s}</td>
                      <td className="px-3 py-2">
                        <Selector value={carga.mapa[s]} onChange={(e) => setCarga({ ...carga, mapa: { ...carga.mapa, [s]: e.target.value } })}>
                          <option value={CREAR}>➕ Crear producto &quot;{s}&quot;</option>
                          {productos.filter((p) => p.activa).map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                        </Selector>
                        {prod?.piezas_estandar != null && Math.round(promedio) !== prod.piezas_estandar && (
                          <p className="mt-1 text-xs font-bold text-amber-600">
                            Estándar {prod.piezas_estandar} pzs; este traslado trae {Number.isInteger(promedio) ? promedio : promedio.toFixed(1)} por costal.
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{x.costales}</td>
                      <td className="px-3 py-2 text-right font-mono">{x.piezas.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono">{q(x.precio)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton className="w-full" disabled={ocupado || !centroId} onClick={confirmar}>
            {ocupado ? 'Cargando…' : `Confirmar: ${carga.t.costales.length} costales en camino a ${carga.t.bodegaEntrada}`}
          </Boton>
        </Modal>
      )}

      {detalle && (
        <Modal ancho titulo={`Traslado #${detalle.r.numero} → ${detalle.r.tienda}`} onCerrar={() => setDetalle(null)}>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Dato e="Recibidos" v={`${detalle.r.recibidos} de ${detalle.r.total_costales}`} />
            <Dato e="Faltan" v={String(detalle.r.pendientes)} />
            <Dato e="Valor que falta" v={q(detalle.r.valor_pendiente)} />
            <Dato e="Valor total" v={q(detalle.r.total_precio)} />
          </div>
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
                  <th className="px-3 py-2 text-right">Valor</th>
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
                      <td className="px-3 py-2 text-right font-mono">{q(f.precio)}</td>
                      <td className="px-3 py-2">
                        {f.estado === 'EN_TRANSITO' ? (
                          <Insignia color="red">No ha llegado</Insignia>
                        ) : (
                          <span className="text-xs text-gray-500">
                            <Insignia color="green">Recibido</Insignia>{' '}
                            {f.recibido_at ? new Date(f.recibido_at).toLocaleString() : ''} {f.recibido_por ?? ''}
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
