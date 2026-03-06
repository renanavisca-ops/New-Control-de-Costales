'use client'
import { useState } from "react"
import { browserSupabase } from "@/lib/supabase/client"

export default function ResetPassword() {
  const [password,setPassword] = useState("")
  const [msg,setMsg] = useState("")

  const update = async () => {
    const supabase = browserSupabase()

    const {error} = await supabase.auth.updateUser({
      password
    })

    setMsg(error ? error.message : "Contraseña actualizada")
  }

  return (
    <div className="p-6">
      <h1>Nueva contraseña</h1>

      <input
        type="password"
        placeholder="Nueva contraseña"
        value={password}
        onChange={e=>setPassword(e.target.value)}
        className="border p-2"
      />

      <button onClick={update} className="bg-indigo-600 text-white p-2 ml-2">
        Guardar
      </button>

      <p>{msg}</p>
    </div>
  )
}
