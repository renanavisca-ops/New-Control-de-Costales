'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Marco } from '@/components/marco';
import { mensajeError } from '@/components/contexto';
import { supabaseNavegador } from '@/lib/supabase/client';

export default function Entrar() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true); setError('');
    const { error } = await supabaseNavegador().auth.signInWithPassword({ email, password });
    setEnviando(false);
    if (error) setError(mensajeError(error)); else location.href = '/';
  };
  return (
    <Marco>
      <form className="tarjeta pila" onSubmit={enviar}>
        <h1>Entrar</h1>
        <label className="campo"><span>Correo</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="campo"><span>Contraseña</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="boton ancho" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <p className="suave peq">¿No tienes cuenta? <Link href="/registro">Crea una</Link></p>
      </form>
    </Marco>
  );
}
