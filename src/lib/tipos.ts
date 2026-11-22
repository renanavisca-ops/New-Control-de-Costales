export type Rol = 'ADMIN_CENTRO' | 'BODEGA' | 'ADMIN_EMPRESA' | 'SUPERVISOR' | 'OPERADOR';

export const ROLES_CENTRO: Rol[] = ['ADMIN_CENTRO', 'BODEGA'];
export const ROLES_EMPRESA: Rol[] = ['ADMIN_EMPRESA', 'SUPERVISOR', 'OPERADOR'];

export const NOMBRE_ROL: Record<Rol, string> = {
  ADMIN_CENTRO: 'Admin. Centro',
  BODEGA: 'Bodega Central',
  ADMIN_EMPRESA: 'Admin. Empresa',
  SUPERVISOR: 'Supervisor',
  OPERADOR: 'Operador',
};

export interface Perfil {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  centro_id: string | null;
  empresa_id: string | null;
  activo: boolean;
  debe_cambiar_password: boolean;
}

export interface Empresa {
  id: string;
  nombre: string;
  activa: boolean;
}

export interface Bodega {
  id: string;
  centro_id: string;
  empresa_id: string | null;
  codigo: string;
  nombre: string;
  direccion: string | null;
  tipo: 'CENTRAL' | 'TIENDA';
  activa: boolean;
}

export interface Categoria {
  id: string;
  centro_id: string;
  nombre: string;
  activa: boolean;
}

export const esAdmin = (rol?: Rol | null) => rol === 'ADMIN_CENTRO' || rol === 'ADMIN_EMPRESA';
