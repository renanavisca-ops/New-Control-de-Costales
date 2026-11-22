'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import Escaner from '@/components/escaner';
import { Aviso, Boton, Campo, Entrada, Modal, Selector } from '@/components/ui';

type Empleado = { id: string; codigo: string; nombre: string };
type Sesion = { token: string; empleado: Empleado };
type Vista = 'INICIO' | 'PRODUCCION' | 'RECIBIR' | 'INICIAL' | 'STOCK';
type EnProceso = { id: string; codigo: string; producto: string | null; empleado_id: string; empleado: string; iniciado_at: string };
type Categoria = { id: string; nombre: string };
type Registro = { codigo: string; texto: string; ok: boolean };

const INACTIVIDAD_MS = 3 * 60 * 1000;

const minutosDesde = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

export default function TiendaCliente({
  tienda,
  organizacion,
  dispositivo,
}: {
  tienda: { codigo: string; nombre: string; es_central: boolean };
  organizacion: { nombre: string };
  dispositivo: { nombre: string };
}) {
  const sb = supabaseNavegador();
  const [vista, setVista] = useState<Vista>('INICIO');
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [pendiente, setPendiente] = useState<Vista | null>(null);
  const [enProceso, setEnProceso] = useState<EnProceso[]>([]);
  const [stock, setStock] = useState<{ producto: string; costales: number }[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const ultimaActividad = useRef(Date.now());

  const cargarEnProceso = useCallback(async () => {
    const { data } = await sb.rpc('producciones_en_proceso');
    setEnProceso((data as EnProceso[]) || []);
  }, [sb]);

  const cargarStock = useCallback(async () => {
    const { data } = await sb.rpc('stock_tienda');
    setStock((data as { producto: string; costales: number }[]) || []);
  }, [sb]);

  useEffect(() => {
    cargarEnProceso();
    sb.from('categorias').select('id, nombre').eq('activa', true).order('nombre').then(({ data }: { data: unknown }) => setCategorias((data as Categoria[]) || []));
    const t = setInterval(cargarEnProceso, 20000);
    return () => clearInterval(t);
  }, [cargarEnProceso, sb]);

  // Cierra la sesión del empleado tras unos minutos sin actividad (celular compartido)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion]);

  const abrir = (v: Vista) => {
    if (v === 'STOCK') {
      cargarStock();
      return setVista('STOCK');
    }
    setPendiente(v);
  };

  const terminar = () => {
    setSesion(null);
    setVista('INICIO');
    cargarEnProceso();
  };

  return (
    <div className="mx-auto min-h-screen max-w-lg p-5">
      <header className="mb-5 flex items-center justify-between">
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

      {sesion && vista !== 'INICIO' && (
        <div className="mb-4 rounded-2xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-800">
          {sesion.empleado.nombre} <span className="font-mono text-indigo-500">({sesion.empleado.codigo})</span>
        </div>
      )}

      {vista === 'INICIO' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Mosaico icono="✂️" titulo="Producción" detalle="Iniciar y finalizar costales" principal onClick={() => abrir('PRODUCCION')} />
            <Mosaico icono="📥" titulo="Recibir" detalle="Costales que llegan" onClick={() => abrir('RECIBIR')} />
            <Mosaico icono="📋" titulo="Inventario inicial" detalle="Costales que ya estaban" onClick={() => abrir('INICIAL')} />
            <Mosaico icono="📦" titulo="Stock" detalle="Costales sin abrir" onClick={() => abrir('STOCK')} />
          </div>
          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-gray-400">En producción ahora ({enProceso.length})</p>
            {enProceso.length === 0 && <p className="text-sm text-gray-400">Nadie está produciendo en este momento.</p>}
            <div className="space-y-2">
              {enProceso.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-2xl bg-gray-50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-mono font-black">{p.codigo}</p>
                    <p className="text-xs text-gray-500">{p.producto ?? '—'} · {p.empleado}</p>
                  </div>
                  <span className="text-xs font-bold text-orange-600">{minutosDesde(p.iniciado_at)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {vista === 'PRODUCCION' && sesion && (
        <Produccion sesion={sesion} enProceso={enProceso} recargar={cargarEnProceso} />
      )}
      {(vista === 'RECIBIR' || vista === 'INICIAL') && sesion && (
        <Recepcion sesion={sesion} inicial={vista === 'INICIAL'} categorias={categorias} />
      )}
      {vista === 'STOCK' && (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="mb-3 text-lg font-black">Stock en tienda</p>
          {stock.length === 0 && <p className="text-sm text-gray-400">Sin costales en stock.</p>}
          {stock.map((s) => (
            <div key={s.producto} className="flex justify-between border-b border-gray-100 py-2 text-sm">
              <span className="font-bold">{s.producto}</span>
              <span className="font-black text-indigo-600">{s.costales}</span>
            </div>
          ))}
          <p className="mt-3 text-right text-sm font-black">Total: {stock.reduce((a, s) => a + Number(s.costales), 0)}</p>
        </section>
      )}

      {pendiente && (
        <Ingreso
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

function Mosaico({ icono, titulo, detalle, onClick, principal }: { icono: string; titulo: string; detalle: string; onClick: () => void; principal?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[28px] p-5 text-left shadow-sm transition active:scale-[0.98] ${principal ? 'col-span-2 bg-indigo-600 text-white shadow-xl' : 'bg-white'}`}
    >
      <p className="text-2xl">{icono}</p>
      <p className="mt-2 text-lg font-black">{titulo}</p>
      <p className={`text-xs ${principal ? 'opacity-80' : 'text-gray-400'}`}>{detalle}</p>
    </button>
  );
}

function Ingreso({ onCerrar, onOk }: { onCerrar: () => void; onOk: (s: Sesion) => void }) {
  const [codigo, setCodigo] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    const { data, error } = await supabaseNavegador().rpc('verificar_empleado', { p_codigo: codigo, p_pin: pin });
    setCargando(false);
    const r = data as { ok: boolean; error?: string; token?: string; empleado?: Empleado } | null;
    if (error || !r?.ok || !r.token || !r.empleado) return setError(r?.error || error?.message || 'No se pudo verificar.');
    onOk({ token: r.token, empleado: r.empleado });
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

function Produccion({ sesion, enProceso, recargar }: { sesion: Sesion; enProceso: EnProceso[]; recargar: () => Promise<void> }) {
  const sb = supabaseNavegador();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [finalizando, setFinalizando] = useState<EnProceso | null>(null);
  const [piezas, setPiezas] = useState('');
  const mios = enProceso.filter((p) => p.empleado_id === sesion.empleado.id);
  const otros = enProceso.filter((p) => p.empleado_id !== sesion.empleado.id);

  const iniciar = async (codigo: string) => {
    setOcupado(true);
    const { data, error } = await sb.rpc('iniciar_produccion', { p_token: sesion.token, p_codigo: codigo });
    setOcupado(false);
    const r = data as { ok: boolean; error?: string } | null;
    if (error || !r?.ok) return setMensaje({ ok: false, texto: r?.error || error?.message || 'Error' });
    setMensaje({ ok: true, texto: `Costal ${codigo} iniciado.` });
    recargar();
  };

  const finalizar = async () => {
    if (!finalizando) return;
    const n = Number(piezas);
    if (!Number.isInteger(n) || n < 0) return setMensaje({ ok: false, texto: 'Ingresa un número de piezas válido.' });
    setOcupado(true);
    const { data, error } = await sb.rpc('finalizar_produccion', { p_token: sesion.token, p_produccion: finalizando.id, p_piezas: n });
    setOcupado(false);
    const r = data as { ok: boolean; error?: string } | null;
    if (error || !r?.ok) return setMensaje({ ok: false, texto: r?.error || error?.message || 'Error' });
    setMensaje({ ok: true, texto: `Costal ${finalizando.codigo} finalizado con ${n} piezas.` });
    setFinalizando(null);
    setPiezas('');
    recargar();
  };

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <p className="mb-3 text-lg font-black">Iniciar costal</p>
        <Escaner onCodigo={iniciar} deshabilitado={ocupado || !!finalizando} textoAyuda="Escanea el costal a abrir" />
        {mensaje && <div className="mt-3"><Aviso tipo={mensaje.ok ? 'exito' : 'error'}>{mensaje.texto}</Aviso></div>}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <p className="mb-3 text-lg font-black">Mis costales en proceso ({mios.length})</p>
        {mios.length === 0 && <p className="text-sm text-gray-400">No tienes costales en proceso.</p>}
        <div className="space-y-2">
          {mios.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-2xl bg-orange-50 px-3 py-3">
              <div>
                <p className="font-mono font-black">{p.codigo}</p>
                <p className="text-xs text-gray-500">{p.producto ?? '—'} · hace {minutosDesde(p.iniciado_at)}</p>
              </div>
              <Boton onClick={() => { setFinalizando(p); setPiezas(''); setMensaje(null); }}>Finalizar</Boton>
            </div>
          ))}
        </div>
        {otros.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-bold uppercase text-gray-400">Costales de otros compañeros ({otros.length})</summary>
            <div className="mt-2 space-y-2">
              {otros.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-2xl bg-gray-50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-mono font-bold">{p.codigo}</p>
                    <p className="text-xs text-gray-500">{p.empleado}</p>
                  </div>
                  <Boton variante="suave" className="px-3 py-2 text-xs" onClick={() => { setFinalizando(p); setPiezas(''); setMensaje(null); }}>
                    Finalizar
                  </Boton>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {finalizando && (
        <Modal titulo={`Finalizar ${finalizando.codigo}`} onCerrar={() => setFinalizando(null)}>
          <p className="text-sm text-gray-500">
            {finalizando.producto ?? ''} {finalizando.empleado_id !== sesion.empleado.id && `· iniciado por ${finalizando.empleado}`}
          </p>
          <Campo etiqueta="Piezas preparadas">
            <Entrada
              inputMode="numeric"
              value={piezas}
              onChange={(e) => setPiezas(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="text-center text-4xl font-black"
              autoFocus
            />
          </Campo>
          <Boton className="w-full py-4" disabled={ocupado || piezas === ''} onClick={finalizar}>
            {ocupado ? 'Guardando…' : 'Guardar y finalizar'}
          </Boton>
        </Modal>
      )}
    </div>
  );
}

function Recepcion({ sesion, inicial, categorias }: { sesion: Sesion; inicial: boolean; categorias: Categoria[] }) {
  const sb = supabaseNavegador();
  const [categoria, setCategoria] = useState('');
  const [piezas, setPiezas] = useState('');
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [pidiendo, setPidiendo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (codigo: string, cat: string | null, pz: string) => {
    setOcupado(true);
    const { data, error } = await sb.rpc('recibir_costal', {
      p_token: sesion.token,
      p_codigo: codigo,
      p_categoria: cat || null,
      p_piezas: pz ? Number(pz) : null,
      p_inicial: inicial,
    });
    setOcupado(false);
    const r = data as { ok: boolean; error?: string; resultado?: string; requiere_categoria?: boolean } | null;
    if (r?.requiere_categoria) return setPidiendo(codigo);
    const texto =
      error?.message ||
      (r?.ok
        ? r.resultado === 'YA_RECIBIDO'
          ? 'Ya estaba recibido'
          : r.resultado === 'RECIBIDO'
            ? 'Recibido (venía en traslado)'
            : 'Registrado'
        : r?.error || 'Error');
    setRegistros((prev) => [{ codigo, texto, ok: !!r?.ok }, ...prev].slice(0, 50));
  };

  const recibidos = registros.filter((r) => r.ok).length;

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
        <p className="text-lg font-black">{inicial ? 'Inventario inicial' : 'Recibir costales'}</p>
        <p className="text-xs text-gray-500">
          {inicial
            ? 'Escanea los costales que ya estaban en la tienda antes de usar el sistema.'
            : 'Escanea cada costal que llega. Si venía en un traslado cargado por la bodega, se marca solo.'}
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
        <Escaner onCodigo={(c) => enviar(c, categoria, piezas)} deshabilitado={ocupado || !!pidiendo} />
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <p className="mb-2 text-sm font-black">Escaneados en esta sesión: {recibidos}</p>
        <div className="space-y-1">
          {registros.map((r, i) => (
            <div key={i} className={`flex justify-between rounded-xl px-3 py-2 text-sm ${r.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
              <span className="font-mono font-bold">{r.codigo}</span>
              <span className="text-xs font-semibold">{r.texto}</span>
            </div>
          ))}
        </div>
      </section>

      {pidiendo && (
        <PedirProducto
          codigo={pidiendo}
          categorias={categorias}
          onCerrar={() => setPidiendo(null)}
          onOk={(cat, pz) => {
            const codigo = pidiendo;
            setPidiendo(null);
            setCategoria(cat);
            enviar(codigo, cat, pz);
          }}
        />
      )}
    </div>
  );
}

function PedirProducto({ codigo, categorias, onCerrar, onOk }: { codigo: string; categorias: Categoria[]; onCerrar: () => void; onOk: (cat: string, piezas: string) => void }) {
  const [cat, setCat] = useState('');
  const [pz, setPz] = useState('');
  return (
    <Modal titulo={`Costal nuevo ${codigo}`} onCerrar={onCerrar}>
      <p className="text-sm text-gray-500">Este costal no viene en ningún traslado. Elige el producto para registrarlo.</p>
      <Selector value={cat} onChange={(e) => setCat(e.target.value)}>
        <option value="">Selecciona el producto…</option>
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </Selector>
      <Entrada inputMode="numeric" placeholder="Piezas según etiqueta (opcional)" value={pz} onChange={(e) => setPz(e.target.value.replace(/\D/g, ''))} />
      <Boton className="w-full" disabled={!cat} onClick={() => onOk(cat, pz)}>Registrar</Boton>
    </Modal>
  );
}
