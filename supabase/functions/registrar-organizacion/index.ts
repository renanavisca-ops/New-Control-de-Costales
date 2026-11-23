// Edge Function: registro público de una organización nueva (registro libre e inmediato).
// verify_jwt = false. Crea la organización, su primer administrador (ADMIN_ORG) con la contraseña
// que eligió, y devuelve ok; el navegador inicia sesión con esas credenciales.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const LIMITE_POR_HORA = 20;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function prefijoBase(empresa: string) {
  const limpio = empresa.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/\b(S\.?\s*A\.?|SOCIEDAD ANONIMA|LTDA|DE|LA|EL|LOS|LAS|Y)\b/g, " ");
  const palabras = limpio.split(/[^A-Z0-9]+/).filter(Boolean);
  let p = palabras.length >= 2 ? palabras.map((w) => w[0]).join("").slice(0, 4) : (palabras[0] || "ORG").slice(0, 4);
  if (p.length < 2) p = (p + "OR").slice(0, 2);
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "JSON inválido" }, 400); }
  if (body.sitio_web) return json({ ok: false, error: "No se pudo registrar" }, 400); // trampa para bots

  const empresa = String(body.empresa || "").trim().slice(0, 120);
  const nombre = String(body.nombre || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (empresa.length < 3) return json({ ok: false, error: "Escribe el nombre de la empresa" }, 400);
  if (nombre.length < 3) return json({ ok: false, error: "Escribe tu nombre" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "Correo no válido" }, 400);
  if (password.length < 8) return json({ ok: false, error: "La contraseña debe tener al menos 8 caracteres" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("organizaciones").select("id", { count: "exact", head: true })
    .eq("registro_publico", true).gte("created_at", haceUnaHora);
  if ((count ?? 0) >= LIMITE_POR_HORA) return json({ ok: false, error: "Demasiados registros. Intenta más tarde." }, 429);

  const { data: dup } = await admin.from("organizaciones").select("id").ilike("nombre", empresa.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (dup) return json({ ok: false, error: "Ya existe una organización con ese nombre. Pide acceso a su administrador." }, 400);

  // Prefijo único para los códigos de empleado (ej. PTA-0001)
  const base = prefijoBase(empresa);
  let prefijo = base;
  for (let i = 2; i < 100; i++) {
    const { data } = await admin.from("organizaciones").select("id").eq("prefijo_empleado", prefijo).maybeSingle();
    if (!data) break;
    prefijo = (base.slice(0, 6 - String(i).length) + i).slice(0, 6);
  }

  const { data: creado, error: uErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombre },
  });
  if (uErr || !creado?.user) {
    const msg = uErr?.message?.includes("already") ? "Ya existe un usuario con ese correo. Inicia sesión." : "No se pudo crear el usuario";
    return json({ ok: false, error: msg }, 400);
  }
  const uid = creado.user.id;
  const deshacer = async (orgId?: string) => {
    if (orgId) await admin.from("organizaciones").delete().eq("id", orgId);
    await admin.auth.admin.deleteUser(uid);
  };

  const { data: org, error: oErr } = await admin.from("organizaciones")
    .insert({ nombre: empresa, prefijo_empleado: prefijo, registro_publico: true }).select("id").single();
  if (oErr || !org) { await deshacer(); return json({ ok: false, error: "No se pudo crear la organización" }, 500); }

  const { error: aErr } = await admin.from("administradores").insert({ id: uid, email, nombre, debe_cambiar_password: false });
  if (aErr) { await deshacer(org.id); return json({ ok: false, error: "No se pudo crear el administrador" }, 500); }

  const { error: rErr } = await admin.from("asignaciones_rol")
    .insert({ administrador_id: uid, rol: "ADMIN_ORG", organizacion_id: org.id, created_by: uid });
  if (rErr) { await deshacer(org.id); return json({ ok: false, error: "No se pudo asignar el rol" }, 500); }

  return json({ ok: true, data: { organizacion_id: org.id, prefijo } });
});
