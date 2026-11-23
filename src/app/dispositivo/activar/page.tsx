'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase/client';
import { Aviso, Boton, Entrada } from '@/components/ui';

export default function ActivarDispositivoPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const activar = async (e: React.FormEvent) => {
    e.preventDefault();
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
      return setError(respuesta?.error || 'No se pudo activar.');
    }
    const { error: e2 } = await sb.auth.signInWithPassword(respuesta.data);
    setCargando(false);
    if (e2) return setError(e2.message);
    router.replace('/tienda');
    router.refresh();
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
        <Boton type="submit" disabled={cargando || codigo.length !== 8} className="w-full py-4">
          {cargando ? 'Activando…' : 'Activar'}
        </Boton>
      </form>
    </main>
  );
}
