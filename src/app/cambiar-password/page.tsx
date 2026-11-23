'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase/client';
import { Aviso, Boton, Entrada } from '@/components/ui';

export default function CambiarPasswordPage() {
  const router = useRouter();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (p1.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (p1 !== p2) return setError('Las contraseñas no coinciden.');
    setCargando(true);
    const sb = supabaseNavegador();
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) {
      setCargando(false);
      return setError(error.message);
    }
    await sb.rpc('marcar_password_cambiada');
    setCargando(false);
    router.replace('/');
    router.refresh();
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={guardar} className="w-full max-w-sm space-y-5 rounded-[32px] bg-white p-8 shadow-xl">
        <div className="text-center">
          <h1 className="text-2xl font-black">Crea tu contraseña</h1>
          <p className="mt-1 text-sm text-gray-400">Reemplaza la contraseña temporal por una personal.</p>
        </div>
        <Entrada type="password" placeholder="Nueva contraseña (mín. 8)" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" />
        <Entrada type="password" placeholder="Confirmar contraseña" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" />
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton type="submit" disabled={cargando} className="w-full py-4">
          {cargando ? 'Guardando…' : 'Guardar contraseña'}
        </Boton>
        <a href="/auth/salir" className="block text-center text-sm font-bold text-gray-400">
          Salir
        </a>
      </form>
    </main>
  );
}
