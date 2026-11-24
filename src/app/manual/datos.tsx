import type { ComponentType } from 'react';
import { ManualPlataforma, SECCIONES_PLATAFORMA } from './contenido-plataforma';
import { ManualOrganizacion, SECCIONES_ORGANIZACION } from './contenido-organizacion';
import { ManualTienda, SECCIONES_TIENDA } from './contenido-tienda';

export type TipoManual = 'plataforma' | 'organizacion' | 'tienda';

export const MANUALES: Record<
  TipoManual,
  { titulo: string; para: string; icono: string; pdf: string; version: string; secciones: readonly (readonly [string, string])[]; Contenido: ComponentType }
> = {
  plataforma: {
    titulo: 'Manual de la plataforma',
    para: 'Para el superadministrador: organizaciones, sus administradores, abastecimiento y acceso de soporte.',
    icono: '★',
    pdf: 'manual-plataforma.pdf',
    version: 'noviembre 2026',
    secciones: SECCIONES_PLATAFORMA,
    Contenido: ManualPlataforma,
  },
  organizacion: {
    titulo: 'Manual de la organización',
    para: 'Para administradores, supervisores, bodega y auditores: configuración, traslados, inventarios y reportes.',
    icono: '🏢',
    pdf: 'manual-organizacion.pdf',
    version: 'noviembre 2026',
    secciones: SECCIONES_ORGANIZACION,
    Contenido: ManualOrganizacion,
  },
  tienda: {
    titulo: 'Manual de la tienda',
    para: 'Para los empleados que usan el celular de la tienda: recibir, producir, inventarios y retorno de saldo.',
    icono: '📱',
    pdf: 'manual-tienda.pdf',
    version: 'noviembre 2026',
    secciones: SECCIONES_TIENDA,
    Contenido: ManualTienda,
  },
};
