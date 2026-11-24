'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import Escaner from '@/components/escaner';
import { Aviso, Boton, Campo, Entrada, Modal, Selector } from '@/components/ui';
import { nuevoId, type Categoria, type EnProceso, type Operacion, type TipoOp } from '@/lib/offline/almacen';
import { verificadorPin } from '@/lib/offline/pin';
import { useSincronizacion } from '@/lib/offline/sincronizacion';

type Empleado = { id: string; codigo: string; nombre: string };
type Sesion = { token: string; empleado: Empleado };
type Vista = 'INICIO' | 'PRODUCCION' | 'RECIBIR' | 'INICIAL' | 'STOCK' | 'RETORNO' | 'INVENTARIO';
type Sinc = ReturnType<typeof useSincronizacion>;

const INACTIVIDAD_MS = 3 * 60 * 1000;

const minutosDesde = (iso: string) => {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

const TEXTO_OP: Record<TipoOp, string> = { RECIBIR: 'Recibido', INICIAR: 'Iniciado', FINALIZAR: 'Finalizado', RETORNO: 'Retorno enviado', INVENTARIO: 'Contado' };

export default function TiendaCliente({
  tienda,
  organizacion,
  dispositivo,
}: {
  tienda: { codigo: string; nombre: string; es_central: boolean };
  organizacion: { nombre: string };
  dispositivo: { id: string; nombre: string };
}) {
  const sinc = useSincronizacion(dispositivo.id);
  const [vista, setVista] = useState<Vista>('INICIO');
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [pendiente, setPendiente] = useState<Vista | null>(null);
  const ultimaActividad = useRef(Date.now());

  // App instalable y disponible sin internet
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    void import('html5-qrcode').catch(() => undefined); // deja la cámara lista en caché
  }, []);

  useEffect(() => {
    const marcar = () => (ultimaActividad.current = Date.now());
    window.addEventListener('pointerdown', marcar);
    window.addEventListener('keydown', marcar);
    const t = setInterval(() => {
      if (sesion && Date.now() - ultimaActividad.current > INACTIVIDAD_MS) terminar();
    }, 15000);
    return () => {
      window.removeEventListener('pointerdown', marcar);
      window.removeEventListener('keydown', marcar);
      clearInterval(t);
    };
  }, [sesion]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = (v: Vista) => (v === 'STOCK' ? setVista('STOCK') : setPendiente(v));
  const terminar = () => {
    setSesion(null);
    setVista('INICIO');
  };

  const stock = useMemo(() => {
    const m = new Map<string, number>();
    sinc.datos.costales.filter((c) => c.estado === 'EN_TIENDA').forEach((c) => m.set(c.producto ?? 'SIN PRODUCTO', (m.get(c.producto ?? 'SIN PRODUCTO') ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [sinc.datos]);

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl p-4 sm:p-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black">
            {tienda.codigo} · <span className="text-indigo-600">{tienda.nombre}</span>
          </p>
          <p className="text-xs font-semibold text-gray-400">
            {organizacion.nombre} · {dispositivo.nombre}
          </p>
        </div>
        {vista !== 'INICIO' && (
          <button onClick={terminar} className="rounded-full bg-gray-900 px-4 py-2 text-xs font-black uppercase text-white">
            Terminar
          </button>
        )}
      </header>

      <IndicadorSync sinc={sinc} />

      {sesion && vista !== 'INICIO' && (
        <div className="mb-4 rounded-2xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-800">
          {sesion.empleado.nombre} <span className="font-mono text-indigo-500">({sesion.empleado.codigo})</span>
        </div>
      )}

      {vista === 'INICIO' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Mosaico icono="✂️" titulo="Producción" detalle="Iniciar y finalizar costales" principal onClick={() => abrir('PRODUCCION')} />
            <Mosaico icono="📥" titulo="Recibir" detalle="Costales que llegan" onClick={() => abrir('RECIBIR')} />
            <Mosaico icono="📋" titulo="Inventario inicial" detalle="Costales que ya estaban" onClick={() => abrir('INICIAL')} />
            <Mosaico icono="📦" titulo="Stock" detalle="Costales sin abrir" onClick={() => abrir('STOCK')} />
            <Mosaico icono="↩️" titulo="Retorno de saldo" detalle="Enviar saldo al centro" onClick={() => abrir('RETORNO')} />
            {sinc.datos.inventario && (
              <Mosaico
                icono="🔍"
                titulo="Inventario"
                detalle={`${sinc.datos.inventario.leidos.length} de ${sinc.datos.inventario.esperados} contados`}
                onClick={() => abrir('INVENTARIO')}
              />
            )}
          </div>
          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-gray-400">En producción ahora ({sinc.datos.en_proceso.length})</p>
            {sinc.datos.en_proceso.length === 0 && <p className="text-sm text-gray-400">Nadie está produciendo en este momento.</p>}
            <div className="space-y-2">
              {sinc.datos.en_proceso.map((p) => (
                <div key={p.codigo} className="flex items-center justify-between rounded-2xl bg-gray-50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-mono font-black">{p.codigo}</p>
                    <p className="text-xs text-gray-500">{p.producto ?? '—'} · {p.empleado}</p>
                  </div>
                  <span className="text-xs font-bold text-orange-600">{minutosDesde(p.iniciado_at)}</span>
                </div>
              ))}
            </div>
          </section>
          <a href="/manual/tienda" className="block rounded-3xl bg-white p-4 text-center text-sm font-black text-indigo-600 shadow-sm">
            📘 Manual de uso del celular
          </a>
        </div>
      )}

      {vista === 'PRODUCCION' && sesion && <Produccion sesion={sesion} sinc={sinc} />}
      {(vista === 'RECIBIR' || vista === 'INICIAL') && sesion && <Recepcion sesion={sesion} inicial={vista === 'INICIAL'} sinc={sinc} />}
      {vista === 'RETORNO' && sesion && <Retorno sesion={sesion} sinc={sinc} tiendaCodigo={tienda.codigo} />}
      {vista === 'INVENTARIO' && sesion && <Inventario sesion={sesion} sinc={sinc} />}
      {vista === 'STOCK' && (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="mb-3 text-lg font-black">Stock en tienda</p>
          {stock.length === 0 && <p className="text-sm text-gray-400">Sin costales en stock.</p>}
          {stock.map(([producto, n]) => (
            <div key={producto} className="flex justify-between border-b border-gray-100 py-2 text-sm">
              <span className="font-bold">{producto}</span>
              <span className="font-black text-indigo-600">{n}</span>
            </div>
          ))}
          <p className="mt-3 text-right text-sm font-black">Total: {stock.reduce((a, [, n]) => a + n, 0)}</p>
          {sinc.datos.generado_at && (
            <p className="mt-2 text-right text-[11px] text-gray-400">Datos del servidor: {new Date(sinc.datos.generado_at).toLocaleString()}</p>
          )}
        </section>
      )}

      {pendiente && (
        <Ingreso
          dispositivoId={dispositivo.id}
          sinc={sinc}
          onCerrar={() => setPendiente(null)}
          onOk={(s) => {
            setSesion(s);
            setVista(pendiente);
            setPendiente(null);
            ultimaActividad.current = Date.now();
          }}
        />
      )}
    </div>
  );
}

function IndicadorSync({ sinc }: { sinc: Sinc }) {
  const [verErrores, setVerErrores] = useState(false);
  const color = !sinc.enLinea ? 'bg-red-50 text-red-700' : sinc.pendientes ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700';
  const texto = !sinc.enLinea
    ? `Sin conexión${sinc.pendientes ? ` · ${sinc.pendientes} pendientes por enviar` : ' · trabajando con datos guardados'}`
    : sinc.pendientes
      ? `${sinc.sincronizando ? 'Enviando' : 'Pendientes'}: ${sinc.pendientes}`
      : 'Todo sincronizado';
  return (
    <div className="mb-4 space-y-2">
      <div className={`flex items-center justify-between rounded-2xl px-4 py-2 text-xs font-bold ${color}`}>
        <span>{!sinc.enLinea ? '🔴' : sinc.pendientes ? '🟠' : '🟢'} {texto}</span>
        {sinc.errores.length > 0 && (
          <button onClick={() => setVerErrores(!verErrores)} className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] text-white">
            {sinc.errores.length} rechazados
          </button>
        )}
      </div>
      {verErrores && (
        <div className="space-y-1 rounded-2xl bg-white p-3 shadow-sm">
          <p className="text-xs font-black uppercase text-gray-400">Rechazados al sincronizar</p>
          {sinc.errores.slice(-15).reverse().map((o) => (
            <div key={o.id} className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">
              <span className="font-mono font-bold">{String(o.datos.codigo)}</span> · {TEXTO_OP[o.tipo]} por {o.empleado.nombre} · {o.error}
            </div>
          ))}
          <p className="text-[11px] text-gray-400">Avisa a tu supervisor para revisar estos costales.</p>
        </div>
      )}
    </div>
  );
}

function Mosaico({ icono, titulo, detalle, onClick, principal }: { icono: string; titulo: string; detalle: string; onClick: () => void; principal?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[28px] p-5 text-left shadow-sm transition active:scale-[0.98] ${principal ? 'col-span-2 bg-indigo-600 text-white shadow-xl md:col-span-3' : 'bg-white'}`}
    >
      <p className="text-2xl">{icono}</p>
      <p className="mt-2 text-lg font-black">{titulo}</p>
      <p className={`text-xs ${principal ? 'opacity-80' : 'text-gray-400'}`}>{detalle}</p>
    </button>
  );
}

function Ingreso({ dispositivoId, sinc, onCerrar, onOk }: { dispositivoId: string; sinc: Sinc; onCerrar: () => void; onOk: (s: Sesion) => void }) {
  const [codigo, setCodigo] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const ingresoLocal = async () => {
    const cred = sinc.tienda.credenciales()[codigo.trim().toUpperCase()];
    if (!cred || new Date(cred.expira) <= new Date()) {
      return setError('Sin internet: este empleado debe ingresar una vez con internet en este celular (vale por 7 días).');
    }
    if ((await verificadorPin(pin, cred.empleado.id, dispositivoId)) !== cred.verificador) return setError('PIN incorrecto.');
    onOk({ token: cred.token, empleado: cred.empleado });
  };

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      if (!navigator.onLine) return await ingresoLocal();
      const { data, error } = await supabaseNavegador().rpc('verificar_empleado', { p_codigo: codigo, p_pin: pin });
      if (error) return await ingresoLocal(); // sin conexión real: se intenta con los datos guardados
      const r = data as { ok: boolean; error?: string; token?: string; expira?: string; empleado?: Empleado } | null;
      if (!r?.ok || !r.token || !r.empleado || !r.expira) return setError(r?.error || 'No se pudo verificar.');
      sinc.tienda.guardarCredencial({
        empleado: r.empleado,
        token: r.token,
        expira: r.expira,
        verificador: await verificadorPin(pin, r.empleado.id, dispositivoId),
      });
      onOk({ token: r.token, empleado: r.empleado });
    } finally {
      setCargando(false);
    }
  };

  return (
    <Modal titulo="Ingresa tu código y PIN" onCerrar={onCerrar}>
      <form onSubmit={entrar} className="space-y-4">
        <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Código (ej. PTA-0001)" autoCapitalize="characters" autoComplete="off" autoFocus />
        <Entrada type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN" autoComplete="off" />
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton type="submit" disabled={cargando || !codigo || pin.length < 4} className="w-full py-4">
          {cargando ? 'Verificando…' : 'Entrar'}
        </Boton>
      </form>
    </Modal>
  );
}

function crearOp(sesion: Sesion, tipo: TipoOp, datos: Record<string, unknown>): Operacion {
  return {
    id: nuevoId(),
    tipo,
    token: sesion.token,
    empleado: { id: sesion.empleado.id, nombre: sesion.empleado.nombre },
    datos,
    ocurrido_at: new Date().toISOString(),
    estado: 'PENDIENTE',
  };
}

function Actividad({ sesion, sinc, desde }: { sesion: Sesion; sinc: Sinc; desde: string }) {
  const mias = sinc.ops.filter((o) => o.empleado.id === sesion.empleado.id && o.ocurrido_at >= desde).slice(-30).reverse();
  if (!mias.length) return null;
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <p className="mb-2 text-sm font-black">Tu actividad</p>
      <div className="space-y-1">
        {mias.map((o) => (
          <div
            key={o.id}
            className={`flex justify-between rounded-xl px-3 py-2 text-sm ${o.estado === 'OK' ? 'bg-green-50 text-green-800' : o.estado === 'ERROR' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-800'}`}
          >
            <span className="font-mono font-bold">{String(o.datos.codigo)}</span>
            <span className="text-xs font-semibold">
              {o.estado === 'PENDIENTE' ? '⏳ ' : o.estado === 'OK' ? '✓ ' : '✗ '}
              {o.estado === 'ERROR' ? o.error : o.resultado === 'YA_RECIBIDO' ? 'Ya estaba recibido' : o.resultado === 'YA_LEIDO' ? 'Ya estaba contado' : TEXTO_OP[o.tipo]}
              {o.tipo === 'FINALIZAR' && o.estado !== 'ERROR' ? ` · ${o.datos.piezas} pzs` : ''}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Produccion({ sesion, sinc }: { sesion: Sesion; sinc: Sinc }) {
  const [desde] = useState(() => new Date().toISOString());
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [finalizando, setFinalizando] = useState<EnProceso | null>(null);
  const [piezas, setPiezas] = useState('');
  const mios = sinc.datos.en_proceso.filter((p) => p.empleado_id === sesion.empleado.id);
  const otros = sinc.datos.en_proceso.filter((p) => p.empleado_id !== sesion.empleado.id);

  const iniciar = (codigo: string) => {
    const local = sinc.datos.costales.find((c) => c.codigo === codigo);
    if (local?.estado === 'EN_PRODUCCION') return setAviso({ ok: false, texto: `El costal ${codigo} ya está en producción.` });
    if (local?.estado === 'EN_TRANSITO') return setAviso({ ok: false, texto: `El costal ${codigo} aún no ha sido recibido.` });
    if (!local && sinc.datos.generado_at && sinc.enLinea) {
      return setAviso({ ok: false, texto: `El costal ${codigo} no está en el stock de esta tienda. Recíbelo primero.` });
    }
    sinc.agregar(crearOp(sesion, 'INICIAR', { codigo }), local?.producto ?? null);
    setAviso({
      ok: true,
      texto: local ? `Costal ${codigo} iniciado.` : `Costal ${codigo} iniciado sin conexión; se validará al sincronizar.`,
    });
  };

  const finalizar = () => {
    if (!finalizando) return;
    const n = Number(piezas);
    if (!Number.isInteger(n) || n < 0) return;
    sinc.agregar(crearOp(sesion, 'FINALIZAR', { codigo: finalizando.codigo, piezas: n }), finalizando.producto);
    setAviso({ ok: true, texto: `Costal ${finalizando.codigo} finalizado con ${n} piezas.` });
    setFinalizando(null);
    setPiezas('');
  };

  const Fila = ({ p, propio }: { p: EnProceso; propio: boolean }) => (
    <div className={`flex items-center justify-between rounded-2xl px-3 py-3 ${propio ? 'bg-orange-50' : 'bg-gray-50'}`}>
      <div>
        <p className="font-mono font-black">{p.codigo}</p>
        <p className="text-xs text-gray-500">
          {p.producto ?? '—'} · {propio ? `hace ${minutosDesde(p.iniciado_at)}` : p.empleado}
        </p>
      </div>
      <Boton variante={propio ? 'primario' : 'suave'} className={propio ? '' : 'px-3 py-2 text-xs'} onClick={() => { setFinalizando(p); setPiezas(''); }}>
        Finalizar
      </Boton>
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <p className="mb-3 text-lg font-black">Iniciar costal</p>
        <Escaner onCodigo={iniciar} deshabilitado={!!finalizando} textoAyuda="Escanea el costal a abrir" />
        {aviso && <div className="mt-3"><Aviso tipo={aviso.ok ? 'exito' : 'error'}>{aviso.texto}</Aviso></div>}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <p className="mb-3 text-lg font-black">Mis costales en proceso ({mios.length})</p>
        {mios.length === 0 && <p className="text-sm text-gray-400">No tienes costales en proceso.</p>}
        <div className="space-y-2">{mios.map((p) => <Fila key={p.codigo} p={p} propio />)}</div>
        {otros.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-bold uppercase text-gray-400">Costales de otros compañeros ({otros.length})</summary>
            <div className="mt-2 space-y-2">{otros.map((p) => <Fila key={p.codigo} p={p} propio={false} />)}</div>
          </details>
        )}
      </section>

      <Actividad sesion={sesion} sinc={sinc} desde={desde} />

      {finalizando && (
        <Modal titulo={`Finalizar ${finalizando.codigo}`} onCerrar={() => setFinalizando(null)}>
          <p className="text-sm text-gray-500">
            {finalizando.producto ?? ''} {finalizando.empleado_id !== sesion.empleado.id && `· iniciado por ${finalizando.empleado}`}
          </p>
          <Campo etiqueta="Piezas preparadas">
            <Entrada inputMode="numeric" value={piezas} onChange={(e) => setPiezas(e.target.value.replace(/\D/g, ''))} placeholder="0" className="text-center text-4xl font-black" autoFocus />
          </Campo>
          <Boton className="w-full py-4" disabled={piezas === ''} onClick={finalizar}>Guardar y finalizar</Boton>
        </Modal>
      )}
    </div>
  );
}

function Recepcion({ sesion, inicial, sinc }: { sesion: Sesion; inicial: boolean; sinc: Sinc }) {
  const [desde] = useState(() => new Date().toISOString());
  const [categoria, setCategoria] = useState('');
  const [piezas, setPiezas] = useState('');
  const [pidiendo, setPidiendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const categorias: Categoria[] = sinc.datos.categorias;
  const nombreCat = (id: string) => categorias.find((c) => c.id === id)?.nombre ?? null;

  const registrar = (codigo: string, cat: string | null, pz: string) => {
    sinc.agregar(
      crearOp(sesion, 'RECIBIR', { codigo, categoria_id: cat, piezas: pz ? Number(pz) : null, inicial, producto: cat ? nombreCat(cat) : null }),
      cat ? nombreCat(cat) : null,
    );
    setAviso({ ok: true, texto: `Costal ${codigo} ${inicial ? 'registrado' : 'recibido'}.` });
  };

  const alEscanear = (codigo: string) => {
    const local = sinc.datos.costales.find((c) => c.codigo === codigo);
    if (local?.estado === 'EN_TIENDA') return setAviso({ ok: true, texto: `El costal ${codigo} ya está en stock.` });
    if (local?.estado === 'EN_PRODUCCION') return setAviso({ ok: false, texto: `El costal ${codigo} está en producción.` });
    if (local?.estado === 'EN_TRANSITO') return registrar(codigo, null, '');
    if (!categoria) return setPidiendo(codigo);
    registrar(codigo, categoria, piezas);
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
        <p className="text-lg font-black">{inicial ? 'Inventario inicial' : 'Recibir costales'}</p>
        <p className="text-xs text-gray-500">
          {inicial
            ? 'Escanea los costales que ya estaban en la tienda antes de usar el sistema.'
            : 'Escanea cada costal que llega. Si venía en un traslado de la bodega, se marca solo.'}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Selector value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Producto (para costales nuevos)</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Selector>
          </div>
          <Entrada inputMode="numeric" placeholder="Piezas" value={piezas} onChange={(e) => setPiezas(e.target.value.replace(/\D/g, ''))} />
        </div>
        <Escaner onCodigo={alEscanear} deshabilitado={!!pidiendo} />
        {aviso && <Aviso tipo={aviso.ok ? 'exito' : 'error'}>{aviso.texto}</Aviso>}
      </section>

      <Actividad sesion={sesion} sinc={sinc} desde={desde} />

      {pidiendo && (
        <Modal titulo={`Costal nuevo ${pidiendo}`} onCerrar={() => setPidiendo(null)}>
          <PedirProducto
            categorias={categorias}
            onOk={(cat, pz) => {
              const codigo = pidiendo;
              setPidiendo(null);
              setCategoria(cat);
              registrar(codigo, cat, pz);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function PedirProducto({ categorias, onOk }: { categorias: Categoria[]; onOk: (cat: string, piezas: string) => void }) {
  const [cat, setCat] = useState('');
  const [pz, setPz] = useState('');
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Este costal no viene en ningún traslado. Elige el producto para registrarlo.</p>
      <Selector value={cat} onChange={(e) => setCat(e.target.value)}>
        <option value="">Selecciona el producto…</option>
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </Selector>
      <Entrada inputMode="numeric" placeholder="Piezas según etiqueta (opcional)" value={pz} onChange={(e) => setPz(e.target.value.replace(/\D/g, ''))} />
      <Boton className="w-full" disabled={!cat} onClick={() => onOk(cat, pz)}>Registrar</Boton>
    </div>
  );
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codigoSaldo = (tienda: string) =>
  `SAL-${tienda.toUpperCase()}-${Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => ALFABETO[b % ALFABETO.length]).join('')}`;

function Retorno({ sesion, sinc, tiendaCodigo }: { sesion: Sesion; sinc: Sinc; tiendaCodigo: string }) {
  const [desde] = useState(() => new Date().toISOString());
  const [lineas, setLineas] = useState<{ categoria_id: string; piezas: string }[]>([{ categoria_id: '', piezas: '' }]);
  const [generado, setGenerado] = useState<string | null>(null);
  const [error, setError] = useState('');
  const categorias = sinc.datos.categorias;
  const total = lineas.reduce((a, l) => a + (Number(l.piezas) || 0), 0);

  const cambiar = (i: number, c: Partial<{ categoria_id: string; piezas: string }>) =>
    setLineas(lineas.map((l, j) => (j === i ? { ...l, ...c } : l)));

  const generar = () => {
    setError('');
    const validas = lineas.filter((l) => l.categoria_id && Number(l.piezas) > 0);
    if (!validas.length) return setError('Agrega al menos un producto con sus piezas.');
    if (validas.length !== lineas.filter((l) => l.categoria_id || l.piezas).length) return setError('Revisa las líneas: cada una necesita producto y piezas.');
    // Se agrupan líneas del mismo producto
    const agrupadas = new Map<string, number>();
    validas.forEach((l) => agrupadas.set(l.categoria_id, (agrupadas.get(l.categoria_id) ?? 0) + Number(l.piezas)));
    const codigo = codigoSaldo(tiendaCodigo);
    sinc.agregar(
      crearOp(sesion, 'RETORNO', { codigo, lineas: Array.from(agrupadas, ([categoria_id, piezas]) => ({ categoria_id, piezas })) }),
      null,
    );
    setGenerado(codigo);
    setLineas([{ categoria_id: '', piezas: '' }]);
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
        <p className="text-lg font-black">Retorno de saldo</p>
        <p className="text-xs text-gray-500">
          Registra lo que va en el saco (puede ir mezclado). Destino: <b>{sinc.datos.destino_saldo?.nombre ?? 'centro de distribución'}</b>.
        </p>
        {lineas.map((l, i) => (
          <div key={i} className="grid grid-cols-6 gap-2">
            <div className="col-span-4">
              <Selector value={l.categoria_id} onChange={(e) => cambiar(i, { categoria_id: e.target.value })}>
                <option value="">Producto…</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Selector>
            </div>
            <Entrada className="col-span-2" inputMode="numeric" placeholder="Piezas" value={l.piezas} onChange={(e) => cambiar(i, { piezas: e.target.value.replace(/\D/g, '') })} />
          </div>
        ))}
        <Boton variante="suave" className="w-full" onClick={() => setLineas([...lineas, { categoria_id: '', piezas: '' }])}>+ Otro producto</Boton>
        <p className="text-right text-sm font-black">Total: {total} piezas</p>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton className="w-full py-4" onClick={generar}>Generar código del saco</Boton>
      </section>

      <Actividad sesion={sesion} sinc={sinc} desde={desde} />

      {generado && (
        <Modal titulo="Escribe este código en el saco" onCerrar={() => setGenerado(null)}>
          <p className="select-all rounded-2xl bg-indigo-50 p-5 text-center font-mono text-3xl font-black tracking-wider text-indigo-900">{generado}</p>
          <p className="text-sm text-gray-500">Escríbelo grande con marcador. El centro de distribución lo usará para recibir y contar el saldo.</p>
          <Boton className="w-full" onClick={() => setGenerado(null)}>Listo</Boton>
        </Modal>
      )}
    </div>
  );
}

function Inventario({ sesion, sinc }: { sesion: Sesion; sinc: Sinc }) {
  const [desde] = useState(() => new Date().toISOString());
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const inv = sinc.datos.inventario;
  if (!inv) return <Aviso tipo="info">No hay un inventario abierto en esta tienda.</Aviso>;

  const leer = (codigo: string) => {
    if (inv.leidos.includes(codigo)) return setAviso({ ok: true, texto: `${codigo} ya estaba contado.` });
    sinc.agregar(crearOp(sesion, 'INVENTARIO', { codigo, inventario_id: inv.id }), null);
    setAviso({ ok: true, texto: `${codigo} contado.` });
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-black">Inventario {inv.tipo === 'COMPLETO' ? 'completo' : 'selectivo'}</p>
            {inv.tipo === 'SELECTIVO' && <p className="text-xs text-gray-500">Solo: {inv.productos.join(', ')}</p>}
          </div>
          <div className="rounded-2xl bg-indigo-50 px-4 py-2 text-center">
            <p className="text-[10px] font-black uppercase text-indigo-500">Contados</p>
            <p className="text-xl font-black text-indigo-700">{inv.leidos.length}/{inv.esperados}</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">Escanea cada costal que encuentres físicamente. El supervisor cierra el inventario desde el panel.</p>
        <Escaner onCodigo={leer} textoAyuda="Escanea cada costal" />
        {aviso && <Aviso tipo={aviso.ok ? 'exito' : 'error'}>{aviso.texto}</Aviso>}
      </section>
      <Actividad sesion={sesion} sinc={sinc} desde={desde} />
    </div>
  );
}
