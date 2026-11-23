'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cargarOrgsPropias, rpc } from '@/lib/datos';
import { esSuperadmin, puedeAdministrarOrg, type AsignacionRol, type Categoria, type Organizacion, type Tienda } from '@/lib/tipos';
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

  const tiendasSupervisables = useMemo(
    () =>
      tiendas.filter(
        (t) => esSuperadmin(roles) || puedeAdministrarOrg(roles, t.organizacion_id) || roles.some((r) => r.rol === 'SUPERVISOR' && r.tienda_id === t.id),
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
            <Boton onClick={() => { setNuevo({ tienda: tiendasSupervisables[0]?.id ?? '', tipo: 'COMPLETO', categorias: [] }); setError(''); }}>
              + Inventario
            </Boton>
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

      {abierto && (
        <Modal titulo={`Inventario · ${nombreTienda(abierto.tienda_id)}`} onCerrar={() => setAbierto(null)}>
          <div className="flex items-center justify-between rounded-2xl bg-indigo-50 p-3 text-sm">
            <span className="font-bold text-indigo-800">{abierto.estado === 'ABIERTO' ? 'En curso (se actualiza solo)' : 'Cerrado'}</span>
            <span className="font-black text-indigo-700">{leidos} leídos / {esperados} esperados</span>
          </div>
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
