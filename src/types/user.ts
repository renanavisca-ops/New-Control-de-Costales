export type UserRole = "ADMIN" | "ADMIN_2" | "OPERADOR";

export interface AppUser {
  id: string;
  nombre: string;
  email: string;
  password: string;
  mustChangePassword: boolean;
  role: UserRole;
  tiendaId?: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
}
