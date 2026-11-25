// SOLO DESARROLLO LOCAL. Imita el subconjunto de la API de Supabase que usa la app de idiomas, sobre
// el Postgres local creado por db-local.sh:
//   · /auth/v1  : contraseña, refresco, usuario, salir, alta y baja de administración
//   · /rest/v1/rpc/<fn> : como PostgREST → SET ROLE según el JWT + request.jwt.claims
// Así la app corre contra las mismas funciones, RLS y permisos que en Supabase. No usar en producción.
import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const PUERTO = Number(process.env.PUERTO || 54321);
const SECRETO = 'secreto-local-solo-para-desarrollo-no-es-produccion';
export const CLAVE_SERVICIO_LOCAL = 'sb_secret_local_solo_desarrollo';
const pool = new pg.Pool({ host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 54329), user: 'postgres', database: 'postgres' });

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function firmar(claims) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64(claims);
  return `${h}.${p}.${crypto.createHmac('sha256', SECRETO).update(`${h}.${p}`).digest('base64url')}`;
}
function verificar(token) {
  const [h, p, f] = String(token || '').split('.');
  if (!f) return null;
  const ok = crypto.createHmac('sha256', SECRETO).update(`${h}.${p}`).digest('base64url');
  if (ok !== f) return null;
  const c = JSON.parse(Buffer.from(p, 'base64url').toString());
  return c.exp * 1000 > Date.now() ? c : null;
}
const refrescos = new Map();

function usuarioJson(u) {
  return { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.email_confirmed_at,
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: u.raw_user_meta_data || {}, identities: [],
    created_at: u.created_at, updated_at: u.updated_at };
}
function sesionPara(u) {
  const ahora = Math.floor(Date.now() / 1000);
  const claims = { sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', is_anonymous: false, iat: ahora, exp: ahora + 3600 };
  const refresh = crypto.randomBytes(24).toString('hex');
  refrescos.set(refresh, u.id);
  return { access_token: firmar(claims), token_type: 'bearer', expires_in: 3600, expires_at: ahora + 3600, refresh_token: refresh, user: usuarioJson(u) };
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
}
function enviar(res, status, cuerpo) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(cuerpo === undefined ? '' : JSON.stringify(cuerpo));
}
async function leerCuerpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  const t = Buffer.concat(partes).toString();
  return t ? JSON.parse(t) : {};
}
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

async function auth(req, res, url) {
  const ruta = url.pathname.replace('/auth/v1', '');
  if (ruta === '/token' && req.method === 'POST') {
    const b = await leerCuerpo(req);
    if (url.searchParams.get('grant_type') === 'password') {
      const { rows } = await pool.query(
        `select * from auth.users where lower(email) = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)`, [b.email, b.password]);
      if (!rows[0]) return enviar(res, 400, { code: 'invalid_credentials', error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
      return enviar(res, 200, sesionPara(rows[0]));
    }
    const id = refrescos.get(b.refresh_token);
    if (!id) return enviar(res, 400, { error: 'invalid_grant', msg: 'Invalid Refresh Token' });
    const { rows } = await pool.query('select * from auth.users where id = $1', [id]);
    if (!rows[0]) return enviar(res, 400, { error: 'invalid_grant', msg: 'User not found' });
    return enviar(res, 200, sesionPara(rows[0]));
  }
  if (ruta === '/user' && req.method === 'GET') {
    const c = verificar(bearer(req));
    if (!c) return enviar(res, 401, { code: 'bad_jwt', msg: 'invalid JWT' });
    const { rows } = await pool.query('select * from auth.users where id = $1', [c.sub]);
    if (!rows[0]) return enviar(res, 403, { code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' });
    return enviar(res, 200, usuarioJson(rows[0]));
  }
  if (ruta === '/logout') return enviar(res, 204);
  if (ruta.startsWith('/admin/users')) {
    if (bearer(req) !== CLAVE_SERVICIO_LOCAL) return enviar(res, 401, { msg: 'Unauthorized' });
    if (req.method === 'POST') {
      const b = await leerCuerpo(req);
      try {
        const { rows } = await pool.query(
          `insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
           values (lower($1), extensions.crypt($2, extensions.gen_salt('bf')), $3, case when $4 then now() end) returning *`,
          [b.email, b.password, b.user_metadata || {}, !!b.email_confirm]);
        return enviar(res, 200, usuarioJson(rows[0]));
      } catch {
        return enviar(res, 422, { code: 'email_exists', msg: 'A user with this email address has already been registered' });
      }
    }
    if (req.method === 'GET') {
      const { rows } = await pool.query('select * from auth.users where id = $1', [ruta.split('/').pop()]);
      return rows[0] ? enviar(res, 200, usuarioJson(rows[0])) : enviar(res, 404, { code: 'user_not_found', msg: 'User not found' });
    }
    if (req.method === 'DELETE') {
      const id = ruta.split('/').pop();
      await pool.query('delete from auth.users where id = $1', [id]);
      return enviar(res, 200, {});
    }
  }
  return enviar(res, 404, { msg: 'no implementado en el servidor local' });
}

async function rpc(req, res, url) {
  const fn = url.pathname.split('/').pop();
  if (!/^[a-z_]+$/.test(fn)) return enviar(res, 400, { message: 'función no válida' });
  const esquema = req.headers['content-profile'] || 'public';
  if (esquema !== 'idiomas_api') return enviar(res, 406, { message: 'esquema no expuesto' });
  const token = bearer(req);
  let rol = 'anon'; let claims = { role: 'anon' };
  if (token === CLAVE_SERVICIO_LOCAL) { rol = 'service_role'; claims = { role: 'service_role' }; }
  else { const c = verificar(token); if (c) { rol = 'authenticated'; claims = c; } }
  const args = await leerCuerpo(req);
  const nombres = Object.keys(args).filter((k) => /^p_[a-z_]+$/.test(k));
  const valores = nombres.map((k) => (args[k] === null || args[k] === undefined ? null
    : typeof args[k] === 'object' ? JSON.stringify(args[k]) : String(args[k])));
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${rol}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const r = await c.query(`select idiomas_api.${fn}(${nombres.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`, valores);
    await c.query('commit');
    return enviar(res, 200, r.rows[0].r);
  } catch (e) {
    await c.query('rollback').catch(() => {});
    const status = e.code === '42501' ? 403 : 400;
    return enviar(res, status, { code: e.code, message: e.message, details: e.detail || null, hint: e.hint || null });
  } finally {
    c.release();
  }
}

http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
    const url = new URL(req.url, `http://localhost:${PUERTO}`);
    if (url.pathname.startsWith('/auth/v1')) return await auth(req, res, url);
    if (url.pathname.startsWith('/rest/v1/rpc/')) return await rpc(req, res, url);
    return enviar(res, 404, { message: 'no implementado en el servidor local' });
  } catch (e) {
    return enviar(res, 500, { message: String(e) });
  }
}).listen(PUERTO, () => console.log(`API local (solo desarrollo) en http://localhost:${PUERTO}`));
