import { AppUser } from "../types/user";

const USERS_KEY = "app_users";
const SESSION_KEY = "app_session";

function getUsers(): AppUser[] {
  const raw = localStorage.getItem(USERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveUsers(users: AppUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export const authService = {

  login(email: string, password: string) {
    const users = getUsers();

    const user = users.find(
      (u) => u.email === email && u.password === password && u.active
    );

    if (!user) {
      throw new Error("Credenciales incorrectas");
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify(user));

    return user;
  },

  logout() {
    localStorage.removeItem(SESSION_KEY);
  },

  getSession(): AppUser | null {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  changePassword(userId: string, newPassword: string) {
    const users = getUsers();

    const user = users.find((u) => u.id === userId);
    if (!user) throw new Error("Usuario no encontrado");

    user.password = newPassword;
    user.mustChangePassword = false;

    saveUsers(users);
  }
};
