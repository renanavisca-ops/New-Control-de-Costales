// Edge Function: crea y administra usuarios (desplegada en Supabase, verify_jwt = true).
// Usa la clave de servicio que Supabase inyecta en el entorno; nunca sale del servidor.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES_CENTRO = ["ADMIN_CENTRO", "BODEGA"];
const ROLES_EMPRESA = ["ADMIN_EMPRESA", "SUPERVISOR", "OPERADOR"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function passwordTemporal() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false } });

  // Identificar a quien llama
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ ok: false, error: "No autenticado" }, 401);

  const { data: actor } = await admin.from("perfiles").select("*").eq("id", u.user.id).single();
  if (!actor || !actor.activo) return json({ ok: false, error: "Sin perfil activo" }, 403);
  if (!["ADMIN_CENTRO", "ADMIN_EMPRESA"].includes(actor.rol)) return json({ ok: false, error: "Sin permiso" }, 403);

  // Empresas que el actor puede administrar
  let empresasPermitidas: string[] = [];
  if (actor.rol === "ADMIN_CENTRO") {
    const { data } = await admin.from("centro_empresas").select("empresa_id").eq("centro_id", actor.centro_id);
    empresasPermitidas = (data || []).map((r: any) => r.empresa_id);
  } else {
    empresasPermitidas = [actor.empresa_id];
  }

  const puedeAsignar = (rol: string, centroId: string | null, empresaId: string | null) => {
    if (actor.rol === "ADMIN_CENTRO") {
      if (ROLES_CENTRO.includes(rol)) return centroId === actor.centro_id;
      if (ROLES_EMPRESA.includes(rol)) return !!empresaId && empresasPermitidas.includes(empresaId);
      return false;
    }
    // ADMIN_EMPRESA: solo roles de su empresa
    return ROLES_EMPRESA.includes(rol) && empresaId === actor.empresa_id;
  };

  const validarBodegas = async (bodegaIds: string[], centroId: string | null, empresaId: string | null) => {
    if (!bodegaIds.length) return true;
    const { data } = await admin.from("bodegas").select("id, centro_id, empresa_id").in("id", bodegaIds);
    if (!data || data.length !== bodegaIds.length) return false;
    return data.every((b: any) => (empresaId ? b.empresa_id === empresaId : b.centro_id === centroId));
  };

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "JSON inválido" }, 400); }
  const accion = String(body.accion || "");

  try {
    if (accion === "crear") {
      const email = String(body.email || "").trim().toLowerCase();
      const nombre = String(body.nombre || "").trim();
      const rol = String(body.rol || "");
      const centroId = ROLES_CENTRO.includes(rol) ? actor.centro_id ?? null : null;
      const empresaId = ROLES_EMPRESA.includes(rol) ? (body.empresa_id || actor.empresa_id || null) : null;
      const bodegaIds: string[] = Array.isArray(body.bodega_ids) ? body.bodega_ids : [];

      if (!email || !nombre || !rol) return json({ ok: false, error: "Faltan datos" }, 400);
      if (!puedeAsignar(rol, centroId, empresaId)) return json({ ok: false, error: "No puedes crear ese rol en esa empresa" }, 403);
      if (!(await validarBodegas(bodegaIds, centroId, empresaId))) return json({ ok: false, error: "Bodegas no válidas para ese usuario" }, 400);

      const temp = passwordTemporal();
      const { data: creado, error } = await admin.auth.admin.createUser({ email, password: temp, email_confirm: true, user_metadata: { nombre } });
      if (error || !creado?.user) return json({ ok: false, error: error?.message || "No se pudo crear" }, 400);

      const { error: pErr } = await admin.from("perfiles").insert({
        id: creado.user.id, email, nombre, rol, centro_id: centroId, empresa_id: empresaId, debe_cambiar_password: true,
      });
      if (pErr) {
        await admin.auth.admin.deleteUser(creado.user.id);
        return json({ ok: false, error: pErr.message }, 400);
      }
      if (bodegaIds.length) {
        await admin.from("perfil_bodegas").insert(bodegaIds.map((b) => ({ perfil_id: creado.user.id, bodega_id: b })));
      }
      return json({ ok: true, data: { id: creado.user.id, password_temporal: temp } });
    }

    // Acciones sobre un usuario existente
    const targetId = String(body.id || "");
    const { data: target } = await admin.from("perfiles").select("*").eq("id", targetId).single();
    if (!target) return json({ ok: false, error: "Usuario no encontrado" }, 404);
    if (!puedeAsignar(target.rol, target.centro_id, target.empresa_id)) return json({ ok: false, error: "No puedes administrar ese usuario" }, 403);

    if (accion === "actualizar") {
      const cambios: any = {};
      if (typeof body.nombre === "string" && body.nombre.trim()) cambios.nombre = body.nombre.trim();
      if (typeof body.activo === "boolean") {
        if (targetId === actor.id && body.activo === false) return json({ ok: false, error: "No puedes desactivarte a ti mismo" }, 400);
        cambios.activo = body.activo;
      }
      if (typeof body.rol === "string" && body.rol !== target.rol) {
        const mismoGrupo = (ROLES_CENTRO.includes(body.rol) && ROLES_CENTRO.includes(target.rol)) || (ROLES_EMPRESA.includes(body.rol) && ROLES_EMPRESA.includes(target.rol));
        if (!mismoGrupo) return json({ ok: false, error: "No se puede mover un usuario entre centro y empresa" }, 400);
        if (!puedeAsignar(body.rol, target.centro_id, target.empresa_id)) return json({ ok: false, error: "No puedes asignar ese rol" }, 403);
        if (targetId === actor.id) return json({ ok: false, error: "No puedes cambiar tu propio rol" }, 400);
        cambios.rol = body.rol;
      }
      if (Object.keys(cambios).length) {
        const { error } = await admin.from("perfiles").update(cambios).eq("id", targetId);
        if (error) return json({ ok: false, error: error.message }, 400);
        if (cambios.activo === false) await admin.auth.admin.updateUserById(targetId, { ban_duration: "876000h" });
        if (cambios.activo === true) await admin.auth.admin.updateUserById(targetId, { ban_duration: "none" });
      }
      if (Array.isArray(body.bodega_ids)) {
        if (!(await validarBodegas(body.bodega_ids, target.centro_id, target.empresa_id))) return json({ ok: false, error: "Bodegas no válidas" }, 400);
        await admin.from("perfil_bodegas").delete().eq("perfil_id", targetId);
        if (body.bodega_ids.length) await admin.from("perfil_bodegas").insert(body.bodega_ids.map((b: string) => ({ perfil_id: targetId, bodega_id: b })));
      }
      return json({ ok: true });
    }

    if (accion === "resetear_password") {
      const temp = passwordTemporal();
      const { error } = await admin.auth.admin.updateUserById(targetId, { password: temp });
      if (error) return json({ ok: false, error: error.message }, 400);
      await admin.from("perfiles").update({ debe_cambiar_password: true }).eq("id", targetId);
      return json({ ok: true, data: { password_temporal: temp } });
    }

    return json({ ok: false, error: "Acción desconocida" }, 400);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
