
export enum Role {
  ADMIN = 'ADMIN',
  SUPERVISOR = 'SUPERVISOR',
  OPERADOR = 'OPERADOR'
}

export enum CostalStatus {
  RECIBIDO = 'RECIBIDO',
  ABIERTO = 'ABIERTO',
  TRASLADADO = 'TRASLADADO'
}

export interface User {
  email: string;
  nombre: string;
  tienda: string;
  rol: Role;
  password?: string;
}

export interface Costal {
  codigo_barras: string;
  categoria: string;
  tienda: string;
  fecha_recepcion: string;
  usuario_recibe: string;
  saldo_num_costal?: string;
  saldo_piezas?: number;
  piezas_asignadas: number;
  estado: CostalStatus;
  notas: string;
}

export interface Apertura {
  id_apertura: string;
  codigo_barras: string;
  categoria: string;
  tienda: string;
  usuario_apertura: string;
  fecha_apertura: string;
  piezas_asignadas: number;
  piezas_contadas: number;
  diferencia: number;
}

export interface OfflineAction {
  id: string;
  type: 'ADD_COSTAL' | 'OPEN_COSTAL' | 'TRANSFER_COSTAL';
  payload: any;
  timestamp: number;
  status: 'pending' | 'syncing' | 'error';
  error?: string;
}

export interface Store {
  id_tienda: string;
  nombre: string;
  direccion?: string;
}
