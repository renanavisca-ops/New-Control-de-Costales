'use client';
import Link from 'next/link';
import { ProveedorApp, useApp } from './contexto';

function Barra() {
  const { perfil, sesion, t } = useApp();
  return (
    <header className="barra">
      <div className="fila">
        <Link href="/" className="logo" aria-label="Puente, inicio"><span aria-hidden>P</span>Puente</Link>
        <div className="espacio" />
        {perfil?.miembro && (
          <>
            <span className="chip" title={t('inicio.racha')}>🔥 {perfil.racha ?? 0}<span className="solo-lector"> días de racha</span></span>
            <span className="chip" title="XP">{perfil.xp_total ?? 0} XP</span>
          </>
        )}
        {sesion && <Link href="/perfil" className="chip" aria-label={t('perfil.titulo')}>⚙︎</Link>}
      </div>
    </header>
  );
}

export function Marco({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorApp>
      <Barra />
      <main className="contenedor">{children}</main>
    </ProveedorApp>
  );
}
