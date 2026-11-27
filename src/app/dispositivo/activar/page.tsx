'use client';
import { useEffect, useRef, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { Aviso, Boton, Entrada } from '@/components/ui';

export default function ActivarDispositivoPage() {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);
  const enCurso = useRef(false);

  // Si este celular ya tiene una sesión de dispositivo activa, entra directo (no se debe activar dos veces)
  useEffect(() => {
    const sb = supabaseNavegador();
    sb.rpc('mi_contexto').then(({ data }: { data: unknown }) => {
      const c = data as { tipo?: string; dispositivo?: { estado?: string } } | null;
      if (c?.tipo === 'DISPOSITIVO' && c.dispositivo?.estado === 'ACTIVO') window.location.replace('/tienda');
    });
  }, []);

  const activar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enCurso.current || listo) return; // evita un segundo toque mientras se activa o se abre la tienda
    enCurso.current = true;
    setError('');
    setCargando(true);
    const sb = supabaseNavegador();
    await sb.auth.signOut();
    const { data, error } = await sb.functions.invoke('activar-dispositivo', { body: { codigo } });
    let respuesta = data as { ok: boolean; error?: string; data?: { email: string; password: string } } | null;
    if (error) {
      try {
        respuesta = await (error as { context?: Response }).context?.json();
      } catch {
        respuesta = { ok: false, error: 'No se pudo conectar. Revisa el internet.' };
      }
    }
    if (!respuesta?.ok || !respuesta.data) {
      setCargando(false);
      enCurso.current = false;
      return setError(respuesta?.error || 'No se pudo activar.');
    }
    const { error: e2 } = await sb.auth.signInWithPassword(respuesta.data);
    if (e2) {
      setCargando(false);
      enCurso.current = false;
      return setError(e2.message);
    }
    // Activado: el botón queda bloqueado y se abre la tienda (carga completa para que el servidor vea la sesión nueva)
    setListo(true);
    window.location.replace('/tienda');
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={activar} className="w-full max-w-sm space-y-5 rounded-[32px] bg-white p-8 shadow-xl">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl">📱</div>
          <h1 className="text-2xl font-black">Activar celular de tienda</h1>
          <p className="mt-1 text-sm text-gray-400">Ingresa el código de 8 caracteres que te dio tu administrador.</p>
        </div>
        <Entrada
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
          placeholder="ABCD2345"
          className="text-center font-mono text-2xl tracking-widest"
          autoCapitalize="characters"
          autoComplete="off"
        />
        {error && <Aviso tipo="error">{error}</Aviso>}
        {listo && <Aviso tipo="exito">✓ Celular activado. Abriendo la tienda…</Aviso>}
        <Boton type="submit" disabled={cargando || listo || codigo.length !== 8} className="w-full py-4">
          {listo ? 'Abriendo…' : cargando ? 'Activando…' : 'Activar'}
        </Boton>
      </form>
    </main>
  );
}
