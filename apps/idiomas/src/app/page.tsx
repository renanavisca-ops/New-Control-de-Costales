'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Marco } from '@/components/marco';
import { mensajeError, useApp } from '@/components/contexto';
import { supabaseNavegador } from '@/lib/supabase/client';

function Bienvenida() {
  const { t } = useApp();
  return (
    <div className="pila">
      <h1>Aprende inglés paso a paso, a tu ritmo.</h1>
      <p className="suave">{t('app.lema')} Ejercicios cortos, repasos en el momento justo y explicaciones claras en español.</p>
      <div className="tarjeta pila">
        <Link className="boton ancho" href="/registro">{t('acc.registro')}</Link>
        <Link className="boton sec ancho" href="/entrar">Ya tengo cuenta</Link>
      </div>
      <p className="suave peq">Piloto con acceso por invitación.</p>
    </div>
  );
}

function Unirme() {
  const { recargar } = useApp();
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const { error } = await supabaseNavegador().rpc('unirme', {
      p_codigo: codigo, p_nombre: nombre, p_zona: Intl.DateTimeFormat().resolvedOptions().timeZone,
      p_idioma_interfaz: 'es-419',
    });
    if (error) setError(mensajeError(error)); else recargar();
  };
  return (
    <form className="tarjeta pila" onSubmit={enviar}>
      <h1>Únete al piloto de idiomas</h1>
      <p className="suave">Tu cuenta existe, pero aún no participa en el piloto. Necesitas un código de invitación.</p>
      <label className="campo"><span>Tu nombre</span><input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={60} /></label>
      <label className="campo"><span>Código de invitación</span><input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} required autoCapitalize="characters" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="boton ancho">Unirme</button>
      <button type="button" className="boton borde ancho" onClick={async () => { await supabaseNavegador().auth.signOut(); location.href = '/'; }}>Usar otra cuenta</button>
    </form>
  );
}

function Inicio() {
  const { perfil, t } = useApp();
  const cursos = (perfil?.inscripciones || []).filter((i) => i.estado === 'activa');
  return (
    <div className="pila">
      <h1>¡Hola, {perfil?.nombre}!</h1>
      <h2>{t('inicio.cursos')}</h2>
      {cursos.length === 0 && <p className="suave">Todavía no tienes cursos. Empieza por inglés desde español.</p>}
      <ul className="ruta">
        {cursos.map((c) => (
          <li key={c.id}>
            <Link className="nodo" href={`/curso/${c.id}`}>
              <span className="icono" aria-hidden>{c.idioma_meta.toUpperCase()}</span>
              <span><h3>{c.titulo}</h3><span className="suave peq">Desde {c.idioma_base === 'es' ? 'español' : c.idioma_base}{c.completado ? ' · terminado' : ''}</span></span>
            </Link>
          </li>
        ))}
      </ul>
      <Link className="boton sec ancho" href="/catalogo">+ {t('inicio.anadir')}</Link>
    </div>
  );
}

function Contenido() {
  const { cargando, sesion, perfil } = useApp();
  if (cargando) return <p className="suave">Cargando…</p>;
  if (!sesion) return <Bienvenida />;
  if (!perfil?.miembro) return <Unirme />;
  return <Inicio />;
}

export default function Pagina() {
  return <Marco><Contenido /></Marco>;
}
