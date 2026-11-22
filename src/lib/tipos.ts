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
  | { tipo: 'ADMIN'; admin: Administrador; roles: AsignacionRol[] }
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
  es_central: boolean;
  activa: boolean;
}

export interface Categoria {
  id: string;
  organizacion_id: string;
  nombre: string;
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

export const tieneRol = (roles: AsignacionRol[], orgId: string | null, permitidos: Rol[]) =>
  esSuperadmin(roles) || roles.some((r) => r.organizacion_id === orgId && permitidos.includes(r.rol));

export const puedeAdministrarOrg = (roles: AsignacionRol[], orgId: string | null) => tieneRol(roles, orgId, ['ADMIN_ORG']);

export const tieneAlgunRol = (roles: AsignacionRol[], permitidos: Rol[]) =>
  esSuperadmin(roles) || roles.some((r) => permitidos.includes(r.rol));
