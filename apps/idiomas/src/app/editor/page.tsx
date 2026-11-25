'use client';
import { useCallback, useEffect, useState } from 'react';
import { Marco } from '@/components/marco';
import { mensajeError, useApp } from '@/components/contexto';
import { supabaseNavegador } from '@/lib/supabase/client';

interface Entrada { id: number; item_id: string; item_version: number; hallazgo: string; estado: string; tipo: string;
  enunciado: { enunciado: string; texto?: string }; metricas: Record<string, number | string | null> }
interface Detalle { item_id: string; version: number; aceptadas: string[]; explicacion: string; opcion_correcta: string | null;
  cambios: { id: number; estado: string; motivo: string; propio: boolean }[] }
const NOMBRE: Record<string, string> = {
  dificil: 'Difícil (se aprende tras el feedback)', confuso: 'Confuso (no se corrige, se abandona o se reporta)',
  posible_respuesta_valida_rechazada: 'Posible respuesta válida rechazada',
};

function Editor() {
  const { perfil } = useApp();
  const sb = supabaseNavegador();
  const [cola, setCola] = useState<Entrada[]>([]);
  const [msg, setMsg] = useState('');
  const [cambio, setCambio] = useState<string>('');
  const cargar = useCallback(async () => {
    const { data, error } = await sb.rpc('editor_cola', { p_estado: 'abierto' });
    if (error) setMsg(mensajeError(error)); else setCola(data as Entrada[]);
  }, [sb]);
  useEffect(() => { cargar(); }, [cargar]);

  const analizar = async () => {
    const { data, error } = await sb.rpc('editor_analizar_contenido');
    setMsg(error ? mensajeError(error) : `Analizados ${data.items_con_datos} ítems; ${data.hallazgos} hallazgos (muestra mínima ${data.muestra_minima} alumnos).`);
    cargar();
  };
  const [abierto, setAbierto] = useState<{ cola: Entrada; detalle: Detalle; aceptadas: string; explicacion: string } | null>(null);
  const abrir = async (e: Entrada) => {
    const { data, error } = await sb.rpc('editor_item', { p_item: e.item_id, p_version: e.item_version });
    if (error) { setMsg(mensajeError(error)); return; }
    const d = data as Detalle;
    setAbierto({ cola: e, detalle: d, aceptadas: d.aceptadas.join('\n'), explicacion: d.explicacion });
  };
  const proponer = async () => {
    if (!abierto) return;
    const aceptadas = abierto.aceptadas.split('\n').map((x) => x.trim()).filter(Boolean);
    const { data, error } = await sb.rpc('editor_proponer_cambio', {
      p_item: abierto.cola.item_id, p_version_base: abierto.cola.item_version, p_cola_id: abierto.cola.id,
      p_propuesta: { aceptadas, explicacion: abierto.explicacion }, p_motivo: `Revisión por métricas: ${abierto.cola.hallazgo}`,
    });
    setMsg(error ? mensajeError(error) : `Propuesta n.º ${data.cambio_id} enviada a revisión.`);
    setAbierto(null);
    cargar();
  };
  const resolver = async (aprobar: boolean) => {
    const { error } = await sb.rpc('revisor_resolver_cambio', { p_cambio: Number(cambio), p_aprobar: aprobar });
    setMsg(error ? error.message : aprobar ? 'Aprobado. Un editor ya puede publicarlo.' : 'Rechazado.');
  };
  const publicar = async () => {
    const { data, error } = await sb.rpc('editor_publicar_cambio', { p_cambio: Number(cambio) });
    setMsg(error ? error.message : `Publicada la versión ${data.version_nueva} de ${data.item_id}`);
    cargar();
  };

  if (!perfil?.miembro) return <p className="suave">Cargando…</p>;
  return (
    <div className="pila">
      <h1>Consola editorial</h1>
      <p className="suave">Métricas agregadas por ejercicio y versión. No se muestran datos personales. Todo cambio necesita la aprobación de un revisor distinto antes de publicarse.</p>
      {msg && <p className="info" role="status">{msg}</p>}
      <button className="boton" onClick={analizar}>Analizar contenido</button>
      {cola.map((e) => (
        <div key={e.id} className="tarjeta pila">
          <span className="chip">{NOMBRE[e.hallazgo] || e.hallazgo}</span>
          <h3>{e.item_id} · v{e.item_version} · {e.tipo}</h3>
          <p>{e.enunciado.enunciado} {e.enunciado.texto && <em>«{e.enunciado.texto}»</em>}</p>
          <table><tbody>
            {['alumnos', 'precision_primer', 'tasa_pista', 'correccion_tras_error', 'tasa_abandono', 'reportes_validez', 'respuesta_frecuente', 'alumnos_respuesta_frecuente'].map((k) => (
              <tr key={k}><th>{k}</th><td>{String(e.metricas[k] ?? '—')}</td></tr>
            ))}
          </tbody></table>
          <button className="boton sec" onClick={() => abrir(e)}>Revisar ejercicio</button>
          {abierto?.cola.id === e.id && (
            <div className="pila">
              {abierto.detalle.opcion_correcta
                ? <p className="suave">Opción correcta: {abierto.detalle.opcion_correcta}</p>
                : <label className="campo"><span>Respuestas aceptadas (una por línea)</span>
                    <textarea value={abierto.aceptadas} onChange={(ev) => setAbierto({ ...abierto, aceptadas: ev.target.value })} />
                  </label>}
              {e.metricas.respuesta_frecuente && <p className="peq">Respuesta más frecuente entre los fallos: <code>{String(e.metricas.respuesta_frecuente)}</code></p>}
              <label className="campo"><span>Explicación</span>
                <textarea value={abierto.explicacion} onChange={(ev) => setAbierto({ ...abierto, explicacion: ev.target.value })} />
              </label>
              {abierto.detalle.cambios.length > 0 && <p className="peq">Cambios: {abierto.detalle.cambios.map((c) => `n.º ${c.id} (${c.estado})`).join(', ')}</p>}
              {(perfil.rol === 'editor' || perfil.rol === 'admin') && <button className="boton" onClick={proponer}>Proponer cambio</button>}
            </div>
          )}
        </div>
      ))}
      <div className="tarjeta pila">
        <h2>Revisar o publicar un cambio</h2>
        <label className="campo"><span>Número de cambio</span><input type="text" value={cambio} onChange={(ev) => setCambio(ev.target.value)} /></label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="boton sec" onClick={() => resolver(true)}>Aprobar (revisor)</button>
          <button className="boton borde" onClick={() => resolver(false)}>Rechazar (revisor)</button>
          <button className="boton" onClick={publicar}>Publicar (editor)</button>
        </div>
      </div>
    </div>
  );
}
export default function Pagina() { return <Marco><Editor /></Marco>; }
