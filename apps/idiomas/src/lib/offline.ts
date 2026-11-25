'use client';
// Cola local de eventos por sesión. Si no hay conexión, las respuestas y el cierre se guardan aquí
// y se envían en lote a idiomas_api.sincronizar. El servidor deduplica por evento_id, así que
// reenviar la cola es seguro (no duplica avance ni recompensas).
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Paquete } from '@/lib/tipos';

export interface EventoLocal {
  tipo: 'pista' | 'respuesta' | 'cierre';
  evento_id: string;
  posicion?: number;
  respuesta?: string;
  pista_usada?: boolean;
  ocurrido_at: string;
  fiabilidad?: number;
}

const CLAVE = 'idiomas.cola.v1';
const CLAVE_PAQ = 'idiomas.paquete.v1.';

function leer(): Record<string, EventoLocal[]> {
  try { return JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch { return {}; }
}
function escribir(c: Record<string, EventoLocal[]>) {
  try { localStorage.setItem(CLAVE, JSON.stringify(c)); } catch { /* almacenamiento no disponible */ }
}

export function encolar(sesionId: string, e: EventoLocal) {
  const c = leer();
  (c[sesionId] ||= []).push(e);
  escribir(c);
}
export function pendientes(): number {
  return Object.values(leer()).reduce((n, l) => n + l.length, 0);
}
export function guardarPaquete(p: Paquete) {
  try { localStorage.setItem(CLAVE_PAQ + p.sesion_id, JSON.stringify(p)); } catch { /* */ }
}
export function paqueteGuardado(id: string): Paquete | null {
  try { return JSON.parse(localStorage.getItem(CLAVE_PAQ + id) || 'null'); } catch { return null; }
}

/** Envía la cola. Devuelve los recibos por sesión. Los eventos aceptados o duplicados se retiran. */
export async function sincronizarCola() {
  const c = leer();
  const sb = supabaseNavegador();
  const resultados: Record<string, unknown> = {};
  for (const [sesion, eventos] of Object.entries(c)) {
    if (!eventos.length) { delete c[sesion]; continue; }
    const { data, error } = await sb.rpc('sincronizar', { p_sesion: sesion, p_eventos: eventos });
    if (error) continue; // sin red: se reintenta después
    const recibos = (data as { recibos: { evento_id: string; estado: string }[] }).recibos;
    const pendientesSesion = eventos.filter((e) => {
      const r = recibos.find((x) => x.evento_id === e.evento_id);
      return r?.estado === 'esperar_dependencias';
    });
    if (pendientesSesion.length) c[sesion] = pendientesSesion; else delete c[sesion];
    resultados[sesion] = data;
  }
  escribir(c);
  return resultados;
}

export function enLinea() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}
