'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase/client';
import { Aviso, Boton, Campo, Entrada } from '@/components/ui';

export default function RegistroPage() {
  const router = useRouter();
  const [f, setF] = useState({ empresa: '', nombre: '', email: '', password: '', confirmar: '', sitio_web: '' });
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const cambiar = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (f.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (f.password !== f.confirmar) return setError('Las contraseñas no coinciden.');
    setCargando(true);
    const sb = supabaseNavegador();
    const email = f.email.trim().toLowerCase();
    const { data, error } = await sb.functions.invoke('registrar-organizacion', {
      body: { empresa: f.empresa, nombre: f.nombre, email, password: f.password, sitio_web: f.sitio_web },
    });
    let respuesta = data as { ok: boolean; error?: string } | null;
    if (error && 'context' in error) {
      try {
        respuesta = await (error as { context: Response }).context.json();
      } catch {
        /* sin cuerpo */
      }
    }
    if (!respuesta?.ok) {
      setCargando(false);
      return setError(respuesta?.error || 'No se pudo registrar. Intenta de nuevo.');
    }
    const { error: e2 } = await sb.auth.signInWithPassword({ email, password: f.password });
    if (e2) {
      setCargando(false);
      return setError('La empresa se creó, pero no se pudo iniciar sesión. Entra desde la pantalla de inicio.');
    }
    router.replace('/admin/tiendas');
    router.refresh();
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={registrar} className="w-full max-w-md space-y-4 rounded-[32px] bg-white p-8 shadow-xl">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl">🏢</div>
          <h1 className="text-2xl font-black tracking-tight">Registra tu empresa</h1>
          <p className="mt-1 text-sm font-medium text-gray-400">Crea tu organización y empieza a controlar tus costales</p>
        </div>
        <Campo etiqueta="Nombre de la empresa">
          <Entrada value={f.empresa} onChange={cambiar('empresa')} placeholder="Mi Empresa, S.A." required />
        </Campo>
        <Campo etiqueta="Tu nombre">
          <Entrada value={f.nombre} onChange={cambiar('nombre')} autoComplete="name" required />
        </Campo>
        <Campo etiqueta="Correo">
          <Entrada type="email" value={f.email} onChange={cambiar('email')} autoComplete="email" placeholder="correo@empresa.com" required />
        </Campo>
        <Campo etiqueta="Contraseña (mínimo 8 caracteres)">
          <Entrada type="password" value={f.password} onChange={cambiar('password')} autoComplete="new-password" required />
        </Campo>
        <Campo etiqueta="Repite la contraseña">
          <Entrada type="password" value={f.confirmar} onChange={cambiar('confirmar')} autoComplete="new-password" required />
        </Campo>
        <input type="text" name="sitio_web" value={f.sitio_web} onChange={cambiar('sitio_web')} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton type="submit" disabled={cargando} className="w-full py-4">
          {cargando ? 'Creando…' : 'Crear mi organización'}
        </Boton>
        <a href="/login" className="block text-center text-sm font-bold text-indigo-600">Ya tengo cuenta · Iniciar sesión</a>
      </form>
    </main>
  );
}
