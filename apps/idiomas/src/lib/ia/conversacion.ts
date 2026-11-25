// Conversación con IA detrás de una interfaz propia. En el piloto está DESACTIVADA: no hay
// proveedor de pago configurado y el adaptador por defecto nunca hace llamadas de red.
// Para activarla más adelante: implementar ProveedorConversacion en un servicio de SERVIDOR (la
// clave del proveedor jamás llega al navegador), cambiar idiomas.config('ia_conversacion') y
// emitir tokens efímeros desde ese servicio.

export type EstadoConversacion =
  | { disponible: false; motivo: 'desactivada_en_piloto' | 'proveedor_no_configurado' | 'cuota_agotada'; alternativa?: string }
  | { disponible: true; sesionId: string; tokenEfimero: string; expiraEn: number; limiteSegundos: number };

export interface SolicitudConversacion {
  inscripcionId: string;
  escenario: string;
  nivel: string;
  idiomaMeta: string;
  idiomaBase: string;
}

export interface ProveedorConversacion {
  readonly nombre: string;
  iniciar(solicitud: SolicitudConversacion): Promise<EstadoConversacion>;
}

export class ConversacionDesactivada implements ProveedorConversacion {
  readonly nombre = 'desactivada';
  async iniciar(): Promise<EstadoConversacion> {
    return {
      disponible: false,
      motivo: 'desactivada_en_piloto',
      alternativa: 'Practica el diálogo de la unidad en la sección Práctica.',
    };
  }
}

export interface ConfigIA {
  habilitada: boolean;
  proveedor: string | null;
}

/** Devuelve el proveedor configurado. Sin configuración explícita, siempre el desactivado. */
export function obtenerProveedorConversacion(
  config: ConfigIA | null | undefined,
  registro: Record<string, () => ProveedorConversacion> = {},
): ProveedorConversacion {
  if (!config?.habilitada || !config.proveedor) return new ConversacionDesactivada();
  const fabrica = registro[config.proveedor];
  return fabrica ? fabrica() : new ConversacionDesactivada();
}
