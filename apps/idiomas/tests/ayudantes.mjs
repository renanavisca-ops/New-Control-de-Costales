// Ayudantes de prueba: cada llamada se ejecuta como lo haría PostgREST con el JWT del usuario
// (SET ROLE authenticated + request.jwt.claims), en su propia transacción.
import pg from 'pg';
import { randomUUID } from 'node:crypto';

export const pool = new pg.Pool({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 54329),
  user: 'postgres',
  database: 'postgres',
  max: 4,
});

/** Ejecuta SQL como superusuario de pruebas (solo para preparar datos y leer claves). */
export async function admin(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

/** Crea un usuario de Auth (como haría Supabase Auth) y devuelve sus claims. */
export async function crearUsuarioAuth(email, extra = {}) {
  const id = randomUUID();
  await admin('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  return { sub: id, email, role: 'authenticated', aud: 'authenticated', ...extra };
}

/** Llama a SQL con la identidad dada (rol authenticated o anon). */
export async function como(claims, sql, params = []) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${claims ? 'authenticated' : 'anon'}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims || { role: 'anon' })]);
    const r = await c.query(sql, params);
    await c.query('commit');
    return r.rows;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Llama a una función RPC de idiomas_api con parámetros con nombre y devuelve el JSON. */
export async function rpc(claims, fn, args = {}) {
  const nombres = Object.keys(args);
  const sql = `select idiomas_api.${fn}(${nombres.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
  const filas = await como(claims, sql, nombres.map((n) => args[n]));
  return filas[0].r;
}

export async function rpcServicio(fn, args = {}) {
  const nombres = Object.keys(args);
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('set local role service_role');
    const r = await c.query(`select idiomas_api.${fn}(${nombres.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`,
      nombres.map((n) => args[n]));
    await c.query('commit');
    return r.rows[0].r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Crea un alumno miembro de la app de idiomas. */
export async function nuevoAlumno(nombre, codigo = 'PILOTO-LOCAL') {
  const email = `${nombre.toLowerCase()}.${randomUUID().slice(0, 8)}@ejemplo.test`;
  const claims = await crearUsuarioAuth(email);
  await rpc(claims, 'unirme', { p_codigo: codigo, p_nombre: nombre });
  return claims;
}

/** Respuesta correcta de un ítem (solo pruebas: lee la clave privada como superusuario). */
export async function respuestaCorrecta(itemId, version) {
  const [k] = await admin(
    `select k.aceptadas, k.opcion_correcta, iv.tipo from idiomas.item_claves k
       join idiomas.item_versiones iv using (item_id, version) where k.item_id = $1 and k.version = $2`,
    [itemId, version]);
  if (k.opcion_correcta) return k.opcion_correcta;
  return k.aceptadas[0];
}

/** Respuesta equivocada pero "conceptual" (no una errata). */
export function respuestaIncorrecta(item) {
  if (item.contenido.opciones) {
    return null; // se resuelve en jugarSesion con una opción distinta de la correcta
  }
  return 'no sé';
}

/**
 * Responde toda una sesión. `decidir(item)` devuelve { fallar?: bool, pista?: bool }.
 * Los ítems fallados se reintentan una vez con la respuesta correcta (corrección al final).
 */
export async function jugarSesion(claims, paquete, decidir = () => ({})) {
  const recibos = [];
  for (const item of paquete.items) {
    const d = decidir(item) || {};
    const correcta = await respuestaCorrecta(item.item_id, item.version);
    if (d.pista && item.tiene_pista) {
      await rpc(claims, 'pedir_pista', { p_sesion: paquete.sesion_id, p_posicion: item.posicion, p_evento: randomUUID() });
    }
    let resp = correcta;
    if (d.fallar) {
      resp = item.contenido.opciones
        ? item.contenido.opciones.map((o) => o.id).find((id) => id !== correcta)
        : 'no sé la respuesta';
    }
    const r = await rpc(claims, 'responder', {
      p_sesion: paquete.sesion_id, p_evento: randomUUID(), p_posicion: item.posicion, p_respuesta: resp,
      p_pista_usada: !!d.pista,
    });
    recibos.push(r);
    if (r.reencolar) {
      recibos.push(await rpc(claims, 'responder', {
        p_sesion: paquete.sesion_id, p_evento: randomUUID(), p_posicion: item.posicion, p_respuesta: correcta,
      }));
    }
  }
  const cierre = await rpc(claims, 'completar_sesion', { p_sesion: paquete.sesion_id, p_evento: randomUUID() });
  return { recibos, cierre };
}

export async function leccion(claims, insc, actividad, decidir) {
  const paquete = await rpc(claims, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: insc, p_actividad: actividad });
  return jugarSesion(claims, paquete, decidir);
}

export async function errorDe(promesa) {
  try { await promesa; } catch (e) { return e.message; }
  throw new Error('Se esperaba un error y no ocurrió');
}

export { randomUUID };
