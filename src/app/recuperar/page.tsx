'use client';
import { useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { Aviso, Boton, Entrada } from '@/components/ui';

export default function RecuperarPage() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    const { error } = await supabaseNavegador().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/confirmar?siguiente=/nueva-password`,
    });
    setCargando(false);
    if (error) {
      return setError(
        error.message.toLowerCase().includes('rate')
          ? 'Ya se envió un correo hace poco. Espera unos minutos e inténtalo de nuevo.'
          : error.message,
      );
    }
    setEnviado(true);
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-5 rounded-[32px] bg-white p-8 shadow-xl">
        <div className="text-center">
          <h1 className="text-2xl font-black">Recuperar contraseña</h1>
          <p className="mt-1 text-sm text-gray-400">Te enviaremos un enlace para crear una contraseña nueva.</p>
        </div>
        {enviado ? (
          <Aviso tipo="exito">
            Si el correo está registrado, te llegará un enlace en unos minutos. Ábrelo en este mismo navegador. Revisa también la carpeta de spam.
          </Aviso>
        ) : (
          <>
            <Entrada type="email" placeholder="correo@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            {error && <Aviso tipo="error">{error}</Aviso>}
            <Boton type="submit" disabled={cargando || !email} className="w-full py-4">
              {cargando ? 'Enviando…' : 'Enviar enlace'}
            </Boton>
          </>
        )}
        <a href="/login" className="block text-center text-sm font-bold text-gray-400">
          Volver al inicio de sesión
        </a>
      </form>
    </main>
  );
}
