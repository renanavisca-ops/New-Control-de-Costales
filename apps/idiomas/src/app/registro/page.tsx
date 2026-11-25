'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Marco } from '@/components/marco';
import { mensajeError } from '@/components/contexto';
import { supabaseNavegador } from '@/lib/supabase/client';

export default function Registro() {
  const [f, setF] = useState({ nombre: '', email: '', password: '', codigo: '', sitio_web: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      const r = await fetch('/api/registro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      const sb = supabaseNavegador();
      const { error: e1 } = await sb.auth.signInWithPassword({ email: f.email, password: f.password });
      if (e1) throw e1;
      const { error: e2 } = await sb.rpc('unirme', {
        p_codigo: f.codigo, p_nombre: f.nombre, p_zona: Intl.DateTimeFormat().resolvedOptions().timeZone, p_idioma_interfaz: 'es-419',
      });
      if (e2) throw e2;
      location.href = '/catalogo';
    } catch (err) {
      const m = (err as Error).message;
      setError(m && !m.includes('_') && m.length < 140 ? m : mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Marco>
      <form className="tarjeta pila" onSubmit={enviar}>
        <h1>Crear cuenta</h1>
        <p className="suave peq">El piloto es por invitación. Tu cuenta solo da acceso a la app de idiomas.</p>
        <label className="campo"><span>Nombre</span><input type="text" value={f.nombre} onChange={set('nombre')} required maxLength={60} /></label>
        <label className="campo"><span>Correo</span><input type="email" autoComplete="email" value={f.email} onChange={set('email')} required /></label>
        <label className="campo"><span>Contraseña (mínimo 8)</span><input type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={set('password')} required /></label>
        <label className="campo"><span>Código de invitación</span><input type="text" value={f.codigo} onChange={set('codigo')} required /></label>
        <input type="text" name="sitio_web" value={f.sitio_web} onChange={set('sitio_web')} tabIndex={-1} autoComplete="off" className="solo-lector" aria-hidden />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="boton ancho" disabled={enviando}>{enviando ? 'Creando…' : 'Crear cuenta'}</button>
        <p className="suave peq">¿Ya tienes una cuenta (incluso de otra app del mismo servicio)? <Link href="/entrar">Entra</Link> y únete con tu código.</p>
      </form>
    </Marco>
  );
}
