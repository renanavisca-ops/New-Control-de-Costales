'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Marco } from '@/components/marco';
import { mensajeError, useApp } from '@/components/contexto';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Dominio, Ruta } from '@/lib/tipos';

const MOD: Record<string, string> = { escuchar: 'Escuchar', hablar: 'Hablar', leer: 'Leer', escribir: 'Escribir' };

function VistaRuta({ insc }: { insc: string }) {
  const { t } = useApp();
  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [dominio, setDominio] = useState<Dominio[]>([]);
  const [error, setError] = useState('');
  const [guia, setGuia] = useState(false);
  useEffect(() => {
    const sb = supabaseNavegador();
    sb.rpc('ruta', { p_insc: insc }).then(({ data, error }) => (error ? setError(mensajeError(error)) : setRuta(data as Ruta)));
    sb.rpc('mi_dominio', { p_insc: insc }).then(({ data }) => setDominio((data as Dominio[]) || []));
  }, [insc]);
  if (error) return <p className="error">{error}</p>;
  if (!ruta) return <p className="suave">Cargando…</p>;

  const porModalidad = ['escuchar', 'hablar', 'leer', 'escribir'].map((m) => {
    const filas = dominio.filter((d) => d.modalidad === m);
    return { m, n: filas.length, nivel: filas.length ? filas.reduce((s, d) => s + Number(d.nivel), 0) / filas.length : null };
  });

  return (
    <div className="pila">
      <div>
        <span className="chip">{ruta.idioma_meta.toUpperCase()} desde {ruta.idioma_base.toUpperCase()} · v{ruta.version}</span>
        <h1>{ruta.titulo}</h1>
        <div className="progreso" role="progressbar" aria-valuenow={ruta.avance.porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del curso">
          <div style={{ width: `${ruta.avance.porcentaje}%` }} />
        </div>
        <p className="suave peq">{ruta.avance.hechas} de {ruta.avance.total} actividades obligatorias</p>
      </div>

      {ruta.completado && (
        <div className="tarjeta pila" style={{ borderColor: 'var(--ok)' }}>
          <h2>🎉 {t('ruta.completo')}</h2>
          <p>{t('ruta.mantenimiento')}</p>
          <div className="cuadricula">
            {porModalidad.map((x) => (
              <div key={x.m}><div className="suave peq">{MOD[x.m]}</div><div className="cifra">{x.nivel === null ? '—' : `${Math.round(x.nivel * 100)}%`}</div></div>
            ))}
          </div>
        </div>
      )}

      <div className="tarjeta pila">
        <h2>{ruta.completado ? 'Práctica de mantenimiento' : t('ruta.practica')}</h2>
        <p className="suave">{ruta.repasos_pendientes > 0 ? `Tienes ${ruta.repasos_pendientes} ${t('ruta.pendientes')}.` : 'Elegimos ejercicios según tus errores, tus repasos y lo que te falta dominar.'}</p>
        <Link className="boton sec ancho" href={`/curso/${insc}/practica`}>{t('acc.practicar')}</Link>
        {ruta.siguiente && !ruta.completado && (
          <Link className="boton ancho" href={`/curso/${insc}/leccion/${ruta.siguiente.actividad_id}`}>{t('ruta.siguiente')}: {ruta.siguiente.titulo}</Link>
        )}
      </div>

      {ruta.unidades.map((u) => (
        <section key={u.id} className="pila">
          <div>
            <span className="chip">{u.cefr} · Unidad {u.orden}</span>
            <h2 style={{ marginTop: 8 }}>{u.titulo}</h2>
            <p className="suave">{u.objetivo}</p>
            <button className="boton borde" onClick={() => setGuia(!guia)} aria-expanded={guia}>{t('ruta.guia')}</button>
          </div>
          {guia && (
            <div className="tarjeta">
              <table><tbody>
                {u.guia.map((g, i) => g.nota
                  ? <tr key={i}><td colSpan={2} className="suave">{g.nota}</td></tr>
                  : <tr key={i}><th lang={ruta.idioma_meta}>{g.frase}</th><td>{g.significado}</td></tr>)}
              </tbody></table>
            </div>
          )}
          <ol className="ruta">
            {u.actividades.map((a, i) => {
              const actual = ruta.siguiente?.actividad_id === a.id;
              const bloqueada = a.estado === 'bloqueada';
              const cont = (
                <>
                  <span className="icono" aria-hidden>{a.estado === 'completada' ? '✓' : a.tipo === 'prueba_unidad' ? '★' : i + 1}</span>
                  <span>
                    <h3>{a.titulo}</h3>
                    <span className="suave peq">{t(`estado.${a.estado}`)}{a.mejor_precision !== null ? ` · mejor ${Math.round(Number(a.mejor_precision) * 100)}%` : ''}{a.tipo === 'prueba_unidad' ? ' · sin pistas' : ''}</span>
                  </span>
                </>
              );
              const clase = `nodo ${a.estado}${actual ? ' actual' : ''}`;
              return (
                <li key={a.id}>
                  {bloqueada
                    ? <div className={clase} aria-disabled>{cont}</div>
                    : <Link className={clase} href={`/curso/${insc}/leccion/${a.id}`} aria-current={actual ? 'step' : undefined}>{cont}</Link>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {dominio.length > 0 && (
        <details className="tarjeta">
          <summary><strong>Tu dominio por habilidad</strong></summary>
          <table>
            <thead><tr><th>Habilidad</th><th>Modalidad</th><th>Dominio</th><th>Repaso</th></tr></thead>
            <tbody>
              {dominio.map((d) => (
                <tr key={d.habilidad_id + d.modalidad}>
                  <td>{d.habilidad}</td><td>{MOD[d.modalidad]}</td><td>{Math.round(Number(d.nivel) * 100)}%</td>
                  <td className="peq">{d.pendiente ? 'pendiente' : d.proximo_repaso ? new Date(d.proximo_repaso).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <Link href="/" className="suave">← Mis cursos</Link>
    </div>
  );
}

export default function Pagina({ params }: { params: Promise<{ insc: string }> }) {
  const { insc } = use(params);
  return <Marco><VistaRuta insc={insc} /></Marco>;
}
