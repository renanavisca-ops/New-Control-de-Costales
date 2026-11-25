'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { encolar, enLinea, guardarPaquete, sincronizarCola } from '@/lib/offline';
import { decir, escucharUnaVez, puedeHablar, puedeReconocer } from '@/lib/voz';
import { mensajeError, useApp } from './contexto';
import type { ItemSesion, Paquete, Recibo, ResultadoSesion } from '@/lib/tipos';

const MOD: Record<string, string> = { escuchar: 'Escuchar', hablar: 'Hablar', leer: 'Leer', escribir: 'Escribir' };
const ORIGEN: Record<string, string> = { repaso: 'Repaso', error: 'Repaso de un error', transferencia: 'Mismo concepto, otro enunciado', refuerzo: 'Refuerzo', nuevo: '' };

function idSesion(clave: string) {
  // Reanudar la misma sesión si se recarga la página (el servidor devuelve el mismo paquete)
  try {
    const v = sessionStorage.getItem(clave);
    if (v) return v;
    const n = crypto.randomUUID();
    sessionStorage.setItem(clave, n);
    return n;
  } catch {
    return crypto.randomUUID();
  }
}

export function Reproductor({ insc, actividad }: { insc: string; actividad?: string }) {
  const { t, recargar } = useApp();
  const sb = supabaseNavegador();
  const clave = `idiomas.sesion.${insc}.${actividad || 'practica'}`;
  const [paquete, setPaquete] = useState<Paquete | null>(null);
  const [error, setError] = useState('');
  const [cola, setCola] = useState<number[]>([]);
  const [indice, setIndice] = useState(0);
  const [respuesta, setRespuesta] = useState('');
  const [fichas, setFichas] = useState<number[]>([]);
  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const [pista, setPista] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoSesion | null>(null);
  const [offlineFin, setOfflineFin] = useState(false);
  const [reporte, setReporte] = useState(false);
  const [vozEstado, setVozEstado] = useState('');
  const [hechos, setHechos] = useState(0);
  const intentosPorPos = useRef<Record<number, number>>({});
  const fiabilidad = useRef<number | undefined>(undefined);

  useEffect(() => {
    const id = idSesion(clave);
    const llamada = actividad
      ? sb.rpc('iniciar_leccion', { p_sesion: id, p_insc: insc, p_actividad: actividad })
      : sb.rpc('armar_practica', { p_sesion: id, p_insc: insc });
    llamada.then(({ data, error }) => {
      if (error) { setError(mensajeError(error)); return; }
      const p = data as Paquete;
      if (p.estado !== 'abierta') { try { sessionStorage.removeItem(clave); } catch { /* */ } location.reload(); return; }
      guardarPaquete(p);
      setPaquete(p);
      setCola(p.items.map((i) => i.posicion));
    });
  }, [clave, insc, actividad, sb]);

  const item: ItemSesion | undefined = useMemo(
    () => paquete?.items.find((i) => i.posicion === cola[indice]), [paquete, cola, indice]);

  useEffect(() => {
    setRespuesta(''); setFichas([]); setRecibo(null); setPendiente(false); setPista(null); setVozEstado('');
    fiabilidad.current = undefined;
    if (item?.contenido.audio_texto && paquete?.voz) decir(item.contenido.audio_texto, paquete.voz);
  }, [item, paquete?.voz]);

  const valor = item?.tipo === 'fichas' ? fichas.map((i) => item.contenido.fichas![i]).join(' ') : respuesta;

  const terminar = useCallback(async () => {
    if (!paquete) return;
    const evento = crypto.randomUUID();
    if (!enLinea()) {
      encolar(paquete.sesion_id, { tipo: 'cierre', evento_id: evento, ocurrido_at: new Date().toISOString() });
      setOfflineFin(true);
      return;
    }
    await sincronizarCola();
    const { data, error } = await sb.rpc('completar_sesion', { p_sesion: paquete.sesion_id, p_evento: evento });
    if (error) {
      encolar(paquete.sesion_id, { tipo: 'cierre', evento_id: evento, ocurrido_at: new Date().toISOString() });
      setOfflineFin(true);
      return;
    }
    try { sessionStorage.removeItem(clave); } catch { /* */ }
    setResultado(data as ResultadoSesion);
    recargar();
  }, [paquete, sb, clave, recargar]);

  const comprobar = async (omitirModalidad = false) => {
    if (!item || !paquete) return;
    setEnviando(true);
    const evento = crypto.randomUUID();
    const r = omitirModalidad ? '(modalidad omitida)' : valor;
    const ev = {
      tipo: 'respuesta' as const, evento_id: evento, posicion: item.posicion, respuesta: r, pista_usada: !!pista,
      ocurrido_at: new Date().toISOString(), fiabilidad: omitirModalidad ? 0 : fiabilidad.current,
    };
    intentosPorPos.current[item.posicion] = (intentosPorPos.current[item.posicion] || 0) + 1;
    if (!enLinea()) {
      encolar(paquete.sesion_id, ev);
      setPendiente(true);
      setEnviando(false);
      return;
    }
    const { data, error } = await sb.rpc('responder', {
      p_sesion: paquete.sesion_id, p_evento: evento, p_posicion: item.posicion, p_respuesta: r,
      p_pista_usada: !!pista, p_ocurrido_at: ev.ocurrido_at, p_fiabilidad: ev.fiabilidad ?? null,
    });
    setEnviando(false);
    if (error) {
      if (/sesion_cerrada|reintentos_agotados/.test(error.message)) { setError(mensajeError(error)); return; }
      encolar(paquete.sesion_id, ev); // fallo de red: se reintentará sin duplicar
      setPendiente(true);
      return;
    }
    const rec = data as Recibo;
    setRecibo(rec);
    if (rec.reencolar && !omitirModalidad) setCola((c) => [...c, item.posicion]);
  };

  const continuar = () => {
    setHechos((h) => h + 1);
    if (indice + 1 >= cola.length) terminar(); else setIndice(indice + 1);
  };

  const pedirPista = async () => {
    if (!item || !paquete) return;
    const { data, error } = await sb.rpc('pedir_pista', { p_sesion: paquete.sesion_id, p_posicion: item.posicion, p_evento: crypto.randomUUID() });
    if (!error) setPista((data as { pista: string }).pista);
  };

  const hablarAhora = async () => {
    if (!paquete) return;
    setVozEstado('Escuchando…');
    try {
      const r = await escucharUnaVez(paquete.voz || 'en-US');
      fiabilidad.current = r.fiabilidad;
      setRespuesta(r.texto);
      setVozEstado(`Te escuchamos: «${r.texto}»`);
    } catch {
      setVozEstado('No pudimos usar el micrófono. Puedes intentarlo otra vez o saltar este ejercicio de voz.');
    }
  };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || reporte) return;
      if (recibo || pendiente) { e.preventDefault(); continuar(); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  if (error) return <div className="pila"><p className="error" role="alert">{error}</p><Link className="boton sec" href={`/curso/${insc}`}>{t('acc.volver')}</Link></div>;
  if (offlineFin) return (
    <div className="tarjeta pila">
      <h1>Sesión guardada en este dispositivo</h1>
      <p>Estás sin conexión. Tus respuestas y el cierre se enviarán solos al reconectar; tu avance y tus recompensas se calcularán una sola vez.</p>
      <button className="boton" onClick={async () => { await sincronizarCola(); location.href = `/curso/${insc}`; }}>Reintentar ahora</button>
    </div>
  );
  if (resultado) return <Resumen r={resultado} insc={insc} />;
  if (!paquete || !item) return <p className="suave">Preparando tu sesión…</p>;

  const total = cola.length;
  const listo = valor.trim().length > 0;
  const esVoz = item.tipo === 'hablar';
  const esAudio = !!item.contenido.audio_texto;

  return (
    <div className="pila" style={{ paddingBottom: 120 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Link href={`/curso/${insc}`} className="chip" aria-label="Salir; podrás reanudar">✕</Link>
        <div className="progreso" style={{ flex: 1 }} role="progressbar" aria-valuenow={hechos} aria-valuemax={total} aria-label="Progreso de la sesión">
          <div style={{ width: `${Math.round((hechos / total) * 100)}%` }} />
        </div>
      </div>
      {paquete.modo !== 'leccion' && indice === 0 && paquete.recomendaciones && (
        <details className="tarjeta" open>
          <summary><strong>Por qué estos ejercicios</strong></summary>
          <ul>{[...new Set(paquete.recomendaciones.map((r) => r.explicacion))].map((x) => <li key={x}>{x}</li>)}</ul>
        </details>
      )}
      <div className="peq suave">{MOD[item.modalidad]} · {item.habilidad}{ORIGEN[item.origen] ? ` · ${ORIGEN[item.origen]}` : ''}</div>
      {item.motivo && paquete.modo === 'leccion' && <div className="motivo">{item.motivo}</div>}
      <h1 style={{ fontSize: 24 }}>{item.contenido.enunciado}</h1>
      {item.contenido.texto && <p className="tarjeta" style={{ fontSize: 20 }}>{item.contenido.texto}</p>}

      {esAudio && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="boton sec" onClick={() => decir(item.contenido.audio_texto!, paquete.voz || 'en-US')} disabled={!puedeHablar()}>🔊 {t('acc.escuchar')}</button>
          <button className="boton borde" onClick={() => decir(item.contenido.audio_texto!, paquete.voz || 'en-US', true)} disabled={!puedeHablar()}>🐢 {t('acc.lento')}</button>
        </div>
      )}
      {esAudio && !puedeHablar() && <p className="info">Este dispositivo no tiene voz disponible. Puedes saltar el ejercicio de escucha sin penalización.</p>}

      {esVoz && (
        <div className="tarjeta pila">
          <p style={{ fontSize: 20, margin: 0 }} lang="en"><strong>{item.contenido.texto_a_decir}</strong></p>
          {item.contenido.traduccion && <p className="suave" style={{ margin: 0 }}>{item.contenido.traduccion}</p>}
          <button className="boton sec" onClick={() => decir(item.contenido.texto_a_decir!, paquete.voz || 'en-US')} disabled={!puedeHablar()}>🔊 Oír el modelo</button>
          <button className="boton" onClick={hablarAhora} disabled={!puedeReconocer() || !!recibo}>🎙 {t('acc.hablar')}</button>
          {!puedeReconocer() && <p className="info peq">Tu navegador no ofrece reconocimiento de voz. Salta este ejercicio: no cuenta como error y quedará registrado como no evaluado.</p>}
          {vozEstado && <p className="peq" aria-live="polite">{vozEstado}</p>}
          <p className="suave peq">El reconocimiento lo hace tu navegador; esta app no guarda audio.</p>
        </div>
      )}

      {(item.tipo === 'seleccion' || item.tipo === 'escuchar_seleccion') && (
        <div className="opciones" role="radiogroup" aria-label="Opciones">
          {item.contenido.opciones!.map((o) => (
            <button key={o.id} role="radio" className="opcion" aria-pressed={respuesta === o.id} aria-checked={respuesta === o.id}
              disabled={!!recibo || pendiente} onClick={() => setRespuesta(o.id)}>{o.texto}</button>
          ))}
        </div>
      )}

      {(item.tipo === 'traduccion' || item.tipo === 'dictado' || item.tipo === 'completar') && (
        <label className="campo"><span className="solo-lector">Tu respuesta</span>
          <textarea lang={item.contenido.idioma_respuesta || 'en'} value={respuesta} disabled={!!recibo || pendiente}
            onChange={(e) => setRespuesta(e.target.value)} placeholder="Escribe aquí en inglés"
            autoCapitalize="sentences" autoCorrect="off" spellCheck={false}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && listo && !recibo && !pendiente) { e.preventDefault(); comprobar(); } }} />
        </label>
      )}

      {item.tipo === 'fichas' && (
        <div className="pila">
          <div className="fichas linea-respuesta" aria-label="Tu frase">
            {fichas.map((i, k) => (
              <button key={k} className="ficha" disabled={!!recibo || pendiente} onClick={() => setFichas(fichas.filter((_, j) => j !== k))}>{item.contenido.fichas![i]}</button>
            ))}
          </div>
          <div className="fichas" aria-label="Banco de palabras">
            {item.contenido.fichas!.map((f, i) => (
              <button key={i} className={`ficha${fichas.includes(i) ? ' usada' : ''}`} disabled={fichas.includes(i) || !!recibo || pendiente}
                onClick={() => setFichas([...fichas, i])}>{f}</button>
            ))}
          </div>
        </div>
      )}

      {pista && <p className="info" role="status">💡 {pista}</p>}
      {pendiente && <p className="info" role="status">{t('leccion.pendiente_sync')}</p>}
      {recibo && <Retro r={recibo} t={t} />}
      {(recibo || pendiente) && (
        <button className="boton borde" onClick={() => setReporte(true)}>{t('acc.reportar')}</button>
      )}
      {reporte && <Reporte sesion={paquete.sesion_id} posicion={item.posicion} respuesta={valor} cerrar={() => setReporte(false)} />}

      <div className="pie-fijo"><div className="fila">
        {!recibo && !pendiente ? (
          <>
            {item.tiene_pista && paquete.permite_pistas && !pista && <button className="boton sec" onClick={pedirPista}>{t('acc.pista')}</button>}
            {(esVoz || esAudio) && <button className="boton borde" onClick={() => comprobar(true)} disabled={enviando}>
              {esVoz ? t('acc.omitir_voz') : 'No puedo escuchar ahora'}</button>}
            <button className="boton" style={{ flex: 1 }} disabled={!listo || enviando} onClick={() => comprobar()}>{t('acc.comprobar')}</button>
          </>
        ) : (
          <button className="boton ancho" autoFocus onClick={continuar}>{t('acc.continuar')}</button>
        )}
      </div></div>
    </div>
  );
}

function Retro({ r, t }: { r: Recibo; t: (k: string) => string }) {
  const clase = r.resultado === 'correcta' ? 'ok' : r.resultado === 'aceptable_con_aviso' || r.resultado === 'no_evaluable' ? 'aviso' : 'mal';
  const titulo = r.resultado === 'correcta' ? t('leccion.correcto') : r.resultado === 'aceptable_con_aviso' ? t('leccion.casi')
    : r.resultado === 'no_evaluable' ? 'No evaluado' : t('leccion.incorrecto');
  return (
    <div className={`feedback ${clase}`} role="status" aria-live="polite">
      <strong>{titulo}</strong>
      {r.feedback && r.resultado !== 'correcta' && <p>{r.feedback}</p>}
      {r.solucion && <p><strong>{t('leccion.solucion')}:</strong> <span lang="en">{r.solucion}</span></p>}
      {r.explicacion && r.resultado !== 'no_evaluable' && <p>{r.explicacion}</p>}
      {r.reencolar && r.resultado !== 'no_evaluable' && <p>{t('leccion.reintento')}</p>}
    </div>
  );
}

function Reporte({ sesion, posicion, respuesta, cerrar }: { sesion: string; posicion: number; respuesta: string; cerrar: () => void }) {
  const [tipo, setTipo] = useState('respuesta_valida_rechazada');
  const [comentario, setComentario] = useState('');
  const [listo, setListo] = useState('');
  const enviar = async () => {
    const { data, error } = await supabaseNavegador().rpc('reportar_item', {
      p_sesion: sesion, p_posicion: posicion, p_tipo: tipo, p_comentario: comentario || null, p_respuesta: respuesta || null,
    });
    setListo(error ? mensajeError(error) : (data as { respuesta_guardada: boolean }).respuesta_guardada
      ? 'Gracias. Lo revisará el equipo editorial.' : 'Gracias. Lo revisará el equipo editorial (no guardamos tu respuesta porque no diste permiso en tu perfil).');
  };
  return (
    <div className="tarjeta pila" role="dialog" aria-label="Reportar un problema">
      {listo ? <><p>{listo}</p><button className="boton sec" onClick={cerrar}>Cerrar</button></> : <>
        <label className="campo"><span>¿Qué pasó?</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="respuesta_valida_rechazada">Mi respuesta también debería ser correcta</option>
            <option value="enunciado_confuso">El enunciado es confuso</option>
            <option value="error_en_contenido">Hay un error en el contenido</option>
            <option value="audio">Problema con el audio</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label className="campo"><span>Comentario (opcional)</span><textarea value={comentario} maxLength={500} onChange={(e) => setComentario(e.target.value)} /></label>
        <div style={{ display: 'flex', gap: 10 }}><button className="boton" onClick={enviar}>Enviar</button><button className="boton borde" onClick={cerrar}>Cancelar</button></div>
      </>}
    </div>
  );
}

function Resumen({ r, insc }: { r: ResultadoSesion; insc: string }) {
  const { t } = useApp();
  return (
    <div className="pila">
      <h1>{r.curso_completado ? '🎉 ¡Curso piloto terminado!' : t('resumen.titulo')}</h1>
      {r.modo === 'leccion' && !r.superada && <p className="error">{t('resumen.no_superada')}</p>}
      {r.curso_completado && <p className="info">Ahora tienes práctica de mantenimiento: repasos vencidos, errores recientes y lo que tienes menos dominado, con ejercicios que van cambiando.</p>}
      <div className="cuadricula">
        <div className="tarjeta"><div className="suave peq">{t('resumen.aciertos')}</div><div className="cifra">{Math.round(r.precision * 100)}%</div></div>
        <div className="tarjeta"><div className="suave peq">XP</div><div className="cifra">+{r.xp_ganado}</div></div>
        <div className="tarjeta"><div className="suave peq">{t('inicio.racha')}</div><div className="cifra">🔥 {r.racha}</div></div>
        <div className="tarjeta"><div className="suave peq">{t('resumen.pistas')}</div><div className="cifra">{r.pistas}</div></div>
      </div>
      {r.errores.length > 0 && (
        <div className="tarjeta">
          <h2>{t('resumen.errores')}</h2>
          <ul>{r.errores.map((e, i) => <li key={i}>{e.habilidad} · {MOD[e.modalidad]}</li>)}</ul>
          <p className="suave peq">Aparecerán en tu práctica personalizada con otros enunciados.</p>
        </div>
      )}
      <Link className="boton ancho" href={`/curso/${insc}`}>{t('acc.volver')}</Link>
      <Link className="boton sec ancho" href={`/curso/${insc}/practica`}>{t('acc.practicar')}</Link>
    </div>
  );
}
