import { AppUser, UserRole } from "../types/user";

const USERS_KEY = "app_users";

function getUsers(): AppUser[] {
  const raw = localStorage.getItem(USERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveUsers(users: AppUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export const usersService = {

  list(): AppUser[] {
    return getUsers();
  },

  createUser(data: {
    nombre: string;
    email: string;
    role: UserRole;
    tiendaId?: string;
    createdBy: string;
  }) {

    const users = getUsers();

    if (users.find((u) => u.email === data.email)) {
      throw new Error("El usuario ya existe");
    }

    const tempPassword = Math.random().toString(36).slice(-8);

    const user: AppUser = {
      id: crypto.randomUUID(),
      nombre: data.nombre,
      email: data.email,
      password: tempPassword,
      mustChangePassword: true,
      role: data.role,
      tiendaId: data.tiendaId,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: data.createdBy
    };

    users.push(user);
    saveUsers(users);

    return {
      user,
      tempPassword
    };
  },

  deactivateUser(userId: string) {
    const users = getUsers();

    const user = users.find((u) => u.id === userId);
    if (!user) return;

    user.active = false;

    saveUsers(users);
  }
};
