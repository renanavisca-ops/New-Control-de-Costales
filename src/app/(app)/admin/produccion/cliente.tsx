'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cargarOrgsPropias } from '@/lib/datos';
import { tieneRol, type AsignacionRol, type Organizacion, type Tienda } from '@/lib/tipos';
import { SelectorOrg, useOrgActiva } from '@/components/selector-org';
import { Entrada, Selector, Tarjeta, Titulo } from '@/components/ui';

const UMBRAL_ALERTA = 5;

type Fila = {
  id: string;
  tienda_id: string;
  piezas_empaque: number | null;
  piezas_producidas: number | null;
  diferencia: number | null;
  finalizado_at: string | null;
  costales: { codigo: string; categorias: { nombre: string } | null } | null;
  empleado: { codigo: string; nombre: string; apellidos: string | null } | null;
};

const hoy = () => new Date().toISOString().slice(0, 10);
const haceDias = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export default function ProduccionCliente({ roles }: { roles: AsignacionRol[] }) {
  const sb = supabaseNavegador();
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [orgId, setOrgId] = useOrgActiva(orgs);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [tienda, setTienda] = useState('');
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(hoy());
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);

  useEffect(() => {
    cargarOrgsPropias(roles).then((o) => setOrgs(o.filter((x) => tieneRol(roles, x.id, ['ADMIN_ORG', 'AUDITOR']))));
  }, [roles]);

  const cargar = useCallback(async () => {
    if (!orgId) return;
    const { data: t } = await sb.from('tiendas').select('*').eq('organizacion_id', orgId).order('codigo');
    setTiendas((t as Tienda[]) || []);
    let q = sb
      .from('producciones')
      .select('id, tienda_id, piezas_empaque, piezas_producidas, diferencia, finalizado_at, costales(codigo, categorias(nombre)), empleado:empleados!producciones_finalizado_por_fkey(codigo, nombre, apellidos)')
      .eq('organizacion_id', orgId)
      .eq('estado', 'FINALIZADO')
      .gte('finalizado_at', `${desde}T00:00:00`)
      .lte('finalizado_at', `${hasta}T23:59:59`)
      .order('finalizado_at', { ascending: false })
      .limit(2000);
    if (tienda) q = q.eq('tienda_id', tienda);
    const { data } = await q;
    setFilas((data as unknown as Fila[]) || []);
  }, [orgId, tienda, desde, hasta, sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const conEmpaque = filas.filter((f) => f.diferencia !== null);
  const alertas = conEmpaque.filter((f) => Math.abs(f.diferencia!) >= UMBRAL_ALERTA);
  const visibles = soloAlertas ? alertas : filas;
  const totalEmpaque = conEmpaque.reduce((a, f) => a + (f.piezas_empaque ?? 0), 0);
  const totalProducido = conEmpaque.reduce((a, f) => a + (f.piezas_producidas ?? 0), 0);

  const agrupar = (clave: (f: Fila) => string) => {
    const m = new Map<string, { costales: number; dif: number; alertas: number }>();
    conEmpaque.forEach((f) => {
      const k = clave(f);
      const v = m.get(k) ?? { costales: 0, dif: 0, alertas: 0 };
      v.costales += 1;
      v.dif += f.diferencia!;
      if (Math.abs(f.diferencia!) >= UMBRAL_ALERTA) v.alertas += 1;
      m.set(k, v);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].dif - b[1].dif);
  };
  const porEmpleado = useMemo(() => agrupar((f) => (f.empleado ? `${f.empleado.codigo} · ${f.empleado.nombre}` : '—')), [conEmpaque]); // eslint-disable-line react-hooks/exhaustive-deps
  const porProducto = useMemo(() => agrupar((f) => f.costales?.categorias?.nombre ?? 'SIN PRODUCTO'), [conEmpaque]); // eslint-disable-line react-hooks/exhaustive-deps
  const nombreTienda = (id: string) => tiendas.find((t) => t.id === id)?.codigo ?? '';
  const colorDif = (d: number | null) => (d === null ? 'text-gray-400' : Math.abs(d) >= UMBRAL_ALERTA ? 'text-red-600' : d === 0 ? 'text-gray-700' : 'text-orange-600');
  const signo = (d: number) => (d > 0 ? `+${d}` : `${d}`);

  const Tabla = ({ titulo, datos }: { titulo: string; datos: [string, { costales: number; dif: number; alertas: number }][] }) => (
    <Tarjeta>
      <p className="mb-2 text-xs font-black uppercase tracking-wide text-gray-400">{titulo}</p>
      {datos.length === 0 && <p className="text-sm text-gray-400">Sin datos.</p>}
      {datos.map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-gray-50 py-1.5 text-sm">
          <span className="font-semibold">{k}</span>
          <span className="space-x-3 text-xs">
            <span className="text-gray-400">{v.costales} costales</span>
            <span className={`font-black ${colorDif(v.dif)}`}>{signo(v.dif)} pzs</span>
            {v.alertas > 0 && <span className="font-black text-red-600">⚠ {v.alertas}</span>}
          </span>
        </div>
      ))}
    </Tarjeta>
  );

  return (
    <div className="space-y-4">
      <Titulo>Empaque vs. producción</Titulo>
      <SelectorOrg orgs={orgs} valor={orgId} onCambio={setOrgId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Selector value={tienda} onChange={(e) => setTienda(e.target.value)}>
          <option value="">Todas las tiendas</option>
          {tiendas.map((t) => <option key={t.id} value={t.id}>{t.codigo} · {t.nombre}</option>)}
        </Selector>
        <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi etiqueta="Costales producidos" valor={String(filas.length)} />
        <Kpi etiqueta="Piezas empaque" valor={String(totalEmpaque)} />
        <Kpi etiqueta="Diferencia total" valor={signo(totalProducido - totalEmpaque)} rojo={totalProducido - totalEmpaque < 0} />
        <Kpi etiqueta={`Alertas (±${UMBRAL_ALERTA}+)`} valor={String(alertas.length)} rojo={alertas.length > 0} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Tabla titulo="Por empleado" datos={porEmpleado} />
        <Tabla titulo="Por producto" datos={porProducto} />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-black">Detalle por costal</p>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} />
          Solo alertas
        </label>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {visibles.map((f) => (
          <Tarjeta key={f.id} className={`flex items-center justify-between py-3 ${f.diferencia !== null && Math.abs(f.diferencia) >= UMBRAL_ALERTA ? 'border-red-200 bg-red-50' : ''}`}>
            <div>
              <p className="font-mono font-black">{f.costales?.codigo}</p>
              <p className="text-xs text-gray-500">
                {f.costales?.categorias?.nombre ?? '—'} · {nombreTienda(f.tienda_id)} · {f.empleado ? `${f.empleado.nombre}` : '—'} ·{' '}
                {f.finalizado_at ? new Date(f.finalizado_at).toLocaleString() : ''}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="text-xs text-gray-400">
                {f.piezas_empaque ?? '?'} → {f.piezas_producidas}
              </p>
              <p className={`font-black ${colorDif(f.diferencia)}`}>{f.diferencia === null ? 'sin empaque' : signo(f.diferencia)}</p>
            </div>
          </Tarjeta>
        ))}
        {visibles.length === 0 && <p className="text-sm text-gray-400">Sin producciones en el rango seleccionado.</p>}
      </div>
    </div>
  );
}

function Kpi({ etiqueta, valor, rojo }: { etiqueta: string; valor: string; rojo?: boolean }) {
  return (
    <div className={`rounded-3xl p-4 text-center ${rojo ? 'bg-red-50 text-red-700' : 'bg-white text-gray-900 shadow-sm'}`}>
      <p className="text-[10px] font-black uppercase tracking-wide opacity-70">{etiqueta}</p>
      <p className="mt-1 text-2xl font-black">{valor}</p>
    </div>
  );
}
