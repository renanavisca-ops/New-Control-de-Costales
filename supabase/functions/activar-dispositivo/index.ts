// Edge Function: activa un celular de tienda con el código de 8 caracteres que genera el admin.
// verify_jwt = false (el celular todavía no tiene sesión). Crea una cuenta interna para el
// dispositivo y devuelve sus credenciales una sola vez; el celular inicia sesión con ellas.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function sha256Hex(texto: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function secreto(n = 32) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "JSON inválido" }, 400); }
  const codigo = String(body.codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (codigo.length !== 8) return json({ ok: false, error: "El código debe tener 8 caracteres" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const hash = await sha256Hex(codigo);
  const { data: disp } = await admin
    .from("dispositivos")
    .select("id, usuario_id, estado, codigo_expira")
    .eq("codigo_activacion_hash", hash)
    .maybeSingle();

  if (!disp || disp.estado !== "PENDIENTE" || !disp.codigo_expira || new Date(disp.codigo_expira) < new Date()) {
    return json({ ok: false, error: "Código inválido o vencido. Pide uno nuevo a tu administrador." }, 400);
  }

  // Si el dispositivo ya tenía una cuenta (reemplazo de celular), se elimina la anterior
  if (disp.usuario_id) await admin.auth.admin.deleteUser(disp.usuario_id);

  const email = `disp-${disp.id}@dispositivos.costales.app`;
  const password = secreto();
  const { data: creado, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { dispositivo: disp.id } });
  if (error || !creado?.user) return json({ ok: false, error: "No se pudo activar el dispositivo" }, 500);

  const { error: uErr } = await admin
    .from("dispositivos")
    .update({ usuario_id: creado.user.id, estado: "ACTIVO", activado_at: new Date().toISOString(), codigo_activacion_hash: null, codigo_expira: null })
    .eq("id", disp.id);
  if (uErr) {
    await admin.auth.admin.deleteUser(creado.user.id);
    return json({ ok: false, error: "No se pudo activar el dispositivo" }, 500);
  }
  return json({ ok: true, data: { email, password } });
});
