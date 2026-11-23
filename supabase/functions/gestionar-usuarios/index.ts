// Edge Function: crea y administra administradores (usuarios con correo) y sus roles.
// verify_jwt = true. Usa la clave de servicio que Supabase inyecta; nunca sale del servidor.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Asignacion = { rol: string; organizacion_id: string | null; tienda_id: string | null };
const ROLES_ORG = ["ADMIN_ORG", "SUPERVISOR", "BODEGA", "AUDITOR"];
const ROLES_CON_TIENDA = ["SUPERVISOR", "BODEGA"];

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

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ ok: false, error: "No autenticado" }, 401);

  const { data: actor } = await admin.from("administradores").select("*").eq("id", u.user.id).maybeSingle();
  if (!actor || !actor.activo) return json({ ok: false, error: "Sin permiso" }, 403);
  const { data: rolesActor } = await admin.from("asignaciones_rol").select("rol, organizacion_id").eq("administrador_id", actor.id);
  const esSuper = (rolesActor || []).some((r: any) => r.rol === "SUPERADMIN");
  const orgsAdmin = new Set((rolesActor || []).filter((r: any) => r.rol === "ADMIN_ORG").map((r: any) => r.organizacion_id));
  if (!esSuper && orgsAdmin.size === 0) return json({ ok: false, error: "Sin permiso" }, 403);

  // Valida y normaliza la lista de roles solicitada
  const validarRoles = async (lista: unknown): Promise<{ ok: true; roles: Asignacion[] } | { ok: false; error: string }> => {
    if (!Array.isArray(lista) || lista.length === 0) return { ok: false, error: "Asigna al menos un rol" };
    const roles: Asignacion[] = [];
    for (const raw of lista as any[]) {
      const rol = String(raw?.rol || "");
      const org = raw?.organizacion_id || null;
      const tienda = raw?.tienda_id || null;
      if (rol === "SUPERADMIN") {
        if (!esSuper) return { ok: false, error: "Solo un superadmin puede asignar SUPERADMIN" };
        roles.push({ rol, organizacion_id: null, tienda_id: null });
        continue;
      }
      if (!ROLES_ORG.includes(rol) || !org) return { ok: false, error: "Rol no válido" };
      if (!esSuper && !orgsAdmin.has(org)) return { ok: false, error: "No administras esa organización" };
      if (ROLES_CON_TIENDA.includes(rol)) {
        if (!tienda) return { ok: false, error: `El rol ${rol} requiere una tienda` };
        const { data: t } = await admin.from("tiendas").select("organizacion_id").eq("id", tienda).maybeSingle();
        if (!t || t.organizacion_id !== org) return { ok: false, error: "Tienda no válida" };
        roles.push({ rol, organizacion_id: org, tienda_id: tienda });
      } else {
        roles.push({ rol, organizacion_id: org, tienda_id: null });
      }
    }
    return { ok: true, roles };
  };

  // ¿Puede el actor administrar a este usuario? (no superadmins, y solo si todos sus roles están en orgs del actor)
  const puedeAdministrar = async (targetId: string) => {
    if (esSuper) return true;
    const { data } = await admin.from("asignaciones_rol").select("rol, organizacion_id").eq("administrador_id", targetId);
    return (data || []).every((r: any) => r.rol !== "SUPERADMIN" && orgsAdmin.has(r.organizacion_id));
  };

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "JSON inválido" }, 400); }
  const accion = String(body.accion || "");

  try {
    if (accion === "crear") {
      const email = String(body.email || "").trim().toLowerCase();
      const nombre = String(body.nombre || "").trim();
      if (!email || !nombre) return json({ ok: false, error: "Nombre y correo son obligatorios" }, 400);
      const v = await validarRoles(body.roles);
      if (!v.ok) return json({ ok: false, error: v.error }, 400);

      const temp = passwordTemporal();
      const { data: creado, error } = await admin.auth.admin.createUser({ email, password: temp, email_confirm: true, user_metadata: { nombre } });
      if (error || !creado?.user) {
        const msg = error?.message?.includes("already") ? "Ya existe un usuario con ese correo" : error?.message || "No se pudo crear";
        return json({ ok: false, error: msg }, 400);
      }
      const id = creado.user.id;
      const { error: aErr } = await admin.from("administradores").insert({ id, email, nombre, debe_cambiar_password: true });
      if (aErr) { await admin.auth.admin.deleteUser(id); return json({ ok: false, error: aErr.message }, 400); }
      const { error: rErr } = await admin.from("asignaciones_rol").insert(v.roles.map((r) => ({ ...r, administrador_id: id, created_by: actor.id })));
      if (rErr) { await admin.auth.admin.deleteUser(id); return json({ ok: false, error: rErr.message }, 400); }
      return json({ ok: true, data: { id, password_temporal: temp } });
    }

    const targetId = String(body.id || "");
    const { data: target } = await admin.from("administradores").select("*").eq("id", targetId).maybeSingle();
    if (!target) return json({ ok: false, error: "Usuario no encontrado" }, 404);
    if (!(await puedeAdministrar(targetId))) return json({ ok: false, error: "No puedes administrar ese usuario" }, 403);

    if (accion === "actualizar") {
      const cambios: any = {};
      if (typeof body.nombre === "string" && body.nombre.trim()) cambios.nombre = body.nombre.trim();
      if (typeof body.activo === "boolean") {
        if (targetId === actor.id && !body.activo) return json({ ok: false, error: "No puedes desactivarte a ti mismo" }, 400);
        cambios.activo = body.activo;
      }
      if (body.roles !== undefined) {
        if (targetId === actor.id) return json({ ok: false, error: "No puedes cambiar tus propios roles" }, 400);
        const v = await validarRoles(body.roles);
        if (!v.ok) return json({ ok: false, error: v.error }, 400);
        await admin.from("asignaciones_rol").delete().eq("administrador_id", targetId);
        const { error } = await admin.from("asignaciones_rol").insert(v.roles.map((r) => ({ ...r, administrador_id: targetId, created_by: actor.id })));
        if (error) return json({ ok: false, error: error.message }, 400);
      }
      if (Object.keys(cambios).length) {
        const { error } = await admin.from("administradores").update(cambios).eq("id", targetId);
        if (error) return json({ ok: false, error: error.message }, 400);
        if (cambios.activo === false) await admin.auth.admin.updateUserById(targetId, { ban_duration: "876000h" });
        if (cambios.activo === true) await admin.auth.admin.updateUserById(targetId, { ban_duration: "none" });
      }
      return json({ ok: true });
    }

    if (accion === "resetear_password") {
      const temp = passwordTemporal();
      const { error } = await admin.auth.admin.updateUserById(targetId, { password: temp });
      if (error) return json({ ok: false, error: error.message }, 400);
      await admin.from("administradores").update({ debe_cambiar_password: true }).eq("id", targetId);
      return json({ ok: true, data: { password_temporal: temp } });
    }

    return json({ ok: false, error: "Acción desconocida" }, 400);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
