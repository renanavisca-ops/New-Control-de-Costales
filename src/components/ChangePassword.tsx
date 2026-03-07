import { useState } from "react";
import { authService } from "../services/authService";

export default function ChangePassword({ user, onDone }: any) {
  const [password, setPassword] = useState("");

  const save = () => {
    if (password.length < 4) {
      alert("La contraseña es muy corta");
      return;
    }

    authService.changePassword(user.id, password);
    onDone();
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Crear contraseña</h2>

      <input
        type="password"
        placeholder="Nueva contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border p-3 w-full rounded"
      />

      <button
        onClick={save}
        className="mt-4 bg-indigo-600 text-white p-3 w-full rounded"
      >
        Guardar contraseña
      </button>
    </div>
  );
}
