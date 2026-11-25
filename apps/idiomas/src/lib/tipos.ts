export type Modalidad = 'escuchar' | 'hablar' | 'leer' | 'escribir';
export type TipoItem = 'seleccion' | 'traduccion' | 'fichas' | 'escuchar_seleccion' | 'dictado' | 'hablar' | 'completar';

export interface Opcion { id: string; texto: string }
export interface ContenidoItem {
  enunciado: string;
  texto?: string;
  opciones?: Opcion[];
  fichas?: string[];
  audio_texto?: string;
  texto_a_decir?: string;
  traduccion?: string;
  idioma_respuesta?: string;
}
export interface ItemSesion {
  posicion: number;
  item_id: string;
  version: number;
  tipo: TipoItem;
  modalidad: Modalidad;
  origen: 'nuevo' | 'repaso' | 'error' | 'transferencia' | 'refuerzo';
  motivo: string | null;
  habilidad: string;
  tiene_pista: boolean;
  contenido: ContenidoItem;
}
export interface Paquete {
  sesion_id: string;
  modo: 'leccion' | 'repaso' | 'mantenimiento';
  estado: 'abierta' | 'completada' | 'abandonada';
  actividad_id: string | null;
  curso_id: string;
  version_curricular: number;
  permite_pistas: boolean;
  max_reintentos_item: number;
  voz: string | null;
  items: ItemSesion[];
  recomendaciones?: Recomendacion[];
}
export interface Recomendacion { habilidad_id: string; modalidad: Modalidad; motivo: string; explicacion: string; item_id: string }
export interface Recibo {
  evento_id: string;
  posicion: number;
  numero_intento: number;
  resultado: 'correcta' | 'aceptable_con_aviso' | 'incorrecta' | 'no_evaluable' | 'omitida';
  correcta: boolean;
  tipo_error: string | null;
  feedback: string | null;
  solucion: string | null;
  explicacion: string;
  reencolar: boolean;
  evidencia?: string;
  duplicado?: boolean;
}
export interface ResultadoSesion {
  sesion_id: string;
  modo: string;
  ejercicios: number;
  aciertos_primer_intento: number;
  evaluados: number;
  precision: number;
  pistas: number;
  superada: boolean;
  primera_completitud: boolean;
  xp_ganado: number;
  racha: number;
  curso_completado: boolean;
  errores: { habilidad: string; modalidad: Modalidad; tipo_error: string | null }[];
}
export interface Perfil {
  miembro: boolean;
  rol?: 'alumno' | 'editor' | 'revisor' | 'admin';
  nombre?: string;
  idioma_interfaz?: string;
  zona_horaria?: string;
  consentimiento_reportes?: boolean;
  xp_total?: number;
  racha?: number;
  inscripciones?: { id: string; curso_id: string; titulo: string; idioma_base: string; idioma_meta: string; estado: string; completado: boolean }[];
}
export interface Ruta {
  inscripcion_id: string;
  curso_id: string;
  titulo: string;
  idioma_base: string;
  idioma_meta: string;
  version: number;
  avance: { hechas: number; total: number; porcentaje: number };
  completado: boolean;
  repasos_pendientes: number;
  siguiente: { actividad_id: string; titulo: string } | null;
  unidades: {
    id: string; orden: number; titulo: string; objetivo: string; cefr: string;
    guia: { frase?: string; significado?: string; nota?: string }[];
    actividades: { id: string; titulo: string; tipo: string; obligatoria: boolean; estado: string; mejor_precision: number | null; veces: number }[];
  }[];
}
export interface Dominio {
  habilidad_id: string; habilidad: string; modalidad: Modalidad; nivel: number; pendiente: boolean;
  aciertos_independientes: number; aciertos_con_ayuda: number; fallos: number; proximo_repaso: string | null;
}
export interface Curso {
  courseId: string; titulo: string; baseLocale: string; targetLocale: string; baseNombre: string; targetNombre: string;
  publishedVersion: number; maxCefr: string; capabilities: Record<string, boolean>; inscripcion_id: string | null;
}
