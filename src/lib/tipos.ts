export type Rol = 'SUPERADMIN' | 'ADMIN_ORG' | 'SUPERVISOR' | 'BODEGA' | 'AUDITOR';

export const NOMBRE_ROL: Record<Rol, string> = {
  SUPERADMIN: 'Superadmin',
  ADMIN_ORG: 'Admin. organización',
  SUPERVISOR: 'Supervisor',
  BODEGA: 'Bodega',
  AUDITOR: 'Auditor',
};

export const DESCRIPCION_ROL: Record<Rol, string> = {
  SUPERADMIN: 'Control total de la plataforma',
  ADMIN_ORG: 'Administra una organización completa',
  SUPERVISOR: 'Supervisa tiendas asignadas e inventarios',
  BODEGA: 'Opera un centro de distribución o bodega',
  AUDITOR: 'Solo lectura de una organización',
};

export interface AsignacionRol {
  rol: Rol;
  organizacion_id: string | null;
  tienda_id: string | null;
}

export interface Administrador {
  id: string;
  email: string;
  nombre: string;
  activo: boolean;
  debe_cambiar_password: boolean;
}

export type Contexto =
  | { tipo: 'ADMIN'; admin: Administrador; roles: AsignacionRol[]; soportes?: { organizacion_id: string; expira_at: string }[] }
  | {
      tipo: 'DISPOSITIVO';
      dispositivo: { id: string; nombre: string; estado: string };
      tienda: { id: string; codigo: string; nombre: string; es_central: boolean };
      organizacion: { id: string; nombre: string };
    }
  | { tipo: 'NINGUNO' };

export interface Organizacion {
  id: string;
  nombre: string;
  prefijo_empleado: string;
  activa: boolean;
}

export interface Tienda {
  id: string;
  organizacion_id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  bodega: string | null;
  documento_traslado?: string | null;
  es_venta_local?: boolean;
  documento_nombre?: string | null;
  es_central: boolean;
  activa: boolean;
}

export interface Categoria {
  id: string;
  organizacion_id: string;
  nombre: string;
  piezas_estandar: number | null;
  activa: boolean;
}

export interface Empleado {
  id: string;
  organizacion_id: string;
  codigo: string;
  nombre: string;
  apellidos: string | null;
  activo: boolean;
}

export interface Dispositivo {
  id: string;
  organizacion_id: string;
  tienda_id: string;
  nombre: string;
  estado: 'PENDIENTE' | 'ACTIVO' | 'BLOQUEADO';
  codigo_expira: string | null;
  activado_at: string | null;
  ultimo_contacto: string | null;
}

export const esSuperadmin = (roles: AsignacionRol[]) => roles.some((r) => r.rol === 'SUPERADMIN');

// El superadmin NO tiene permisos dentro de las organizaciones (solo plataforma); con soporte ve en solo lectura.
export const tieneRol = (roles: AsignacionRol[], orgId: string | null, permitidos: Rol[]) =>
  roles.some((r) => r.organizacion_id === orgId && permitidos.includes(r.rol));

export const puedeAdministrarOrg = (roles: AsignacionRol[], orgId: string | null) => tieneRol(roles, orgId, ['ADMIN_ORG']);

export const tieneAlgunRol = (roles: AsignacionRol[], permitidos: Rol[]) => roles.some((r) => permitidos.includes(r.rol));

/** Área de trabajo del panel: la plataforma (solo superadmin) o una organización. */
export type ModoOrg = 'MIEMBRO' | 'SOPORTE' | 'SIN_ACCESO';
export interface OpcionArea {
  id: string; // 'plataforma', id de organización o 'centro:<id de tienda>'
  nombre: string;
  modo: ModoOrg | 'PLATAFORMA' | 'CENTRO';
  roles: Rol[];
  soporteHasta: string | null;
  centro?: { id: string; codigo: string; nombre: string; organizacion_id: string };
}
