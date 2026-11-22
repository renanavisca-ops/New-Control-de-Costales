'use client';
import { useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { Aviso, Boton, Entrada, Modal } from '@/components/ui';

type Empleado = { id: string; codigo: string; nombre: string };

export default function TiendaCliente({
  tienda,
  organizacion,
  dispositivo,
}: {
  tienda: { codigo: string; nombre: string; es_central: boolean };
  organizacion: { nombre: string };
  dispositivo: { nombre: string };
}) {
  const [pidiendo, setPidiendo] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [empleado, setEmpleado] = useState<Empleado | null>(null);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    const { data, error } = await supabaseNavegador().rpc('verificar_empleado', { p_codigo: codigo, p_pin: pin });
    setCargando(false);
    const r = data as { ok: boolean; error?: string; empleado?: Empleado } | null;
    if (error || !r?.ok || !r.empleado) return setError(r?.error || error?.message || 'No se pudo verificar.');
    setEmpleado(r.empleado);
    setPidiendo(false);
    setCodigo('');
    setPin('');
  };

  return (
    <div className="mx-auto min-h-screen max-w-lg p-5">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-lg font-black">
            {tienda.codigo} · <span className="text-indigo-600">{tienda.nombre}</span>
          </p>
          <p className="text-xs font-semibold text-gray-400">
            {organizacion.nombre} · {dispositivo.nombre}
          </p>
        </div>
        {empleado && (
          <button onClick={() => setEmpleado(null)} className="text-xs font-bold uppercase text-gray-400 hover:text-red-500">
            Salir
          </button>
        )}
      </header>

      {!empleado ? (
        <div className="space-y-4">
          <button
            onClick={() => { setPidiendo(true); setError(''); }}
            className="w-full rounded-[32px] bg-indigo-600 p-8 text-left text-white shadow-xl active:scale-[0.99]"
          >
            <p className="text-3xl">✂️</p>
            <p className="mt-2 text-2xl font-black">Producción</p>
            <p className="text-sm opacity-80">Abrir costales y registrar piezas preparadas</p>
          </button>
          <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-5 text-sm text-gray-400">
            Recepción de traslados e inventarios llegan en las próximas fases.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-gray-400">Produciendo</p>
            <p className="text-xl font-black">{empleado.nombre}</p>
            <p className="font-mono text-sm text-indigo-600">{empleado.codigo}</p>
          </div>
          <div className="rounded-3xl border border-dashed border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-800">
            <p className="font-black">Próximo paso (fase 2)</p>
            <p className="mt-1">
              Aquí vas a escanear un costal para <b>iniciarlo</b> y luego <b>finalizarlo</b> con las piezas preparadas. Varias personas podrán tener costales en proceso al mismo tiempo.
            </p>
          </div>
        </div>
      )}

      {pidiendo && (
        <Modal titulo="Entrar a Producción" onCerrar={() => setPidiendo(false)}>
          <form onSubmit={entrar} className="space-y-4">
            <Entrada
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="Código (ej. PTA-0001)"
              autoCapitalize="characters"
              autoComplete="off"
            />
            <Entrada
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="PIN"
              autoComplete="off"
            />
            {error && <Aviso tipo="error">{error}</Aviso>}
            <Boton type="submit" disabled={cargando || !codigo || pin.length < 4} className="w-full py-4">
              {cargando ? 'Verificando…' : 'Entrar'}
            </Boton>
          </form>
        </Modal>
      )}
    </div>
  );
}
