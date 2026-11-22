'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase/client';
import { Aviso, Boton, Entrada } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    const { error } = await supabaseNavegador().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setCargando(false);
    if (error) {
      setError(error.message.includes('Invalid login') ? 'Correo o contraseña incorrectos.' : error.message);
      return;
    }
    router.replace('/');
    router.refresh();
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={entrar} className="w-full max-w-sm space-y-5 rounded-[32px] bg-white p-8 shadow-xl">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl">📦</div>
          <h1 className="text-3xl font-black tracking-tight">Control de Costales</h1>
          <p className="mt-1 text-sm font-medium text-gray-400">Del centro de distribución a la tienda</p>
        </div>
        <Entrada type="email" placeholder="correo@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <Entrada type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton type="submit" disabled={cargando} className="w-full py-4">
          {cargando ? 'Entrando…' : 'Iniciar sesión'}
        </Boton>
        <p className="text-center text-xs text-gray-400">¿Olvidaste tu contraseña? Pide a tu administrador que la restablezca.</p>
        <a href="/dispositivo/activar" className="block text-center text-xs font-bold text-indigo-600">¿Es el celular de una tienda? Actívalo aquí</a>
      </form>
    </main>
  );
}
