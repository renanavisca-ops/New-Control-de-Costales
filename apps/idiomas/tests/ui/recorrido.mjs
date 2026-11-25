// Prueba de interfaz de punta a punta (Playwright) contra la app real + API local.
// Requisitos: db-local.sh, node scripts/supabase-local.mjs y `next start -p 3100` en marcha.
//   node tests/ui/recorrido.mjs [carpeta-capturas]
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import pg from 'pg';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3100';
const CAPTURAS = process.argv[2] || null;
const db = new pg.Pool({ host: '/tmp', port: 54329, user: 'postgres', database: 'postgres' });

async function clave(itemId, version) {
  const { rows } = await db.query('select aceptadas, opcion_correcta from idiomas.item_claves where item_id = $1 and version = $2', [itemId, version]);
  return rows[0];
}

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-419' });
pagina.on('dialog', (d) => d.accept());
const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
const foto = async (n) => { if (CAPTURAS) await pagina.screenshot({ path: `${CAPTURAS}/${n}.png`, fullPage: false }); };
let paquete = null;
pagina.on('response', async (r) => {
  if (/rpc\/(iniciar_leccion|armar_practica)$/.test(r.url()) && r.request().method() === 'POST' && r.ok()) paquete = await r.json();
});

const email = `ui.${Date.now()}@ejemplo.test`;
await pagina.goto(BASE);
await foto('01-bienvenida');
await pagina.getByRole('link', { name: 'Crear cuenta' }).click();
await pagina.getByLabel('Nombre').fill('Marta');
await pagina.getByLabel('Correo').fill(email);
await pagina.getByLabel('Contraseña (mínimo 8)').fill('clave-segura-123');
await pagina.getByLabel('Código de invitación').fill('PILOTO-LOCAL');
await pagina.getByRole('button', { name: 'Crear cuenta' }).click();
await pagina.waitForURL('**/catalogo');
await pagina.getByText('Inglés para hispanohablantes').waitFor();
await foto('02-catalogo');
await pagina.getByText('Inglés para hispanohablantes').click();
await pagina.waitForURL('**/curso/*');
await pagina.getByRole('heading', { name: 'De compras: ropa y tallas' }).waitFor();
await foto('03-ruta');

// ---------------------------------------------------------------- Lección 1
await pagina.getByRole('link', { name: /Siguiente: Hola/ }).click();
await pagina.waitForURL('**/leccion/**');
await pagina.locator('h1').first().waitFor();
for (let i = 0; i < 40; i++) {
  if (await pagina.getByRole('heading', { name: 'Resumen' }).isVisible().catch(() => false)) break;
  const enunciado = (await pagina.locator('h1').first().textContent()).trim();
  const item = paquete.items.find((x) => x.contenido.enunciado === enunciado);
  assert.ok(item, `ítem para «${enunciado}»`);
  const k = await clave(item.item_id, item.version);
  const fallarAhora = item.item_id === 'en.sal.2' && !globalThis.yaFallo;
  if (item.item_id === 'en.sal.1' && !globalThis.pista) {
    await pagina.getByRole('button', { name: 'Ver pista' }).click();
    await pagina.getByText('💡').waitFor();
    globalThis.pista = true;
    await foto('05-pista');
  }
  if (item.tipo === 'hablar') {
    await pagina.getByRole('button', { name: 'No puedo hablar ahora' }).click();
  } else {
    if (item.tipo === 'seleccion' || item.tipo === 'escuchar_seleccion') {
      const texto = item.contenido.opciones.find((o) => o.id === k.opcion_correcta).texto;
      await pagina.getByRole('radio', { name: texto, exact: true }).click();
    } else if (item.tipo === 'fichas') {
      const usadas = new Set();
      for (const palabra of k.aceptadas[0].split(' ')) {
        const idx = item.contenido.fichas.findIndex((f, j) => f === palabra && !usadas.has(j));
        usadas.add(idx);
        await pagina.getByLabel('Banco de palabras').getByRole('button', { name: palabra, exact: true }).first().click();
      }
    } else {
      await pagina.getByLabel('Tu respuesta').fill(fallarAhora ? 'I look only' : k.aceptadas[0]);
    }
    if (i === 0) await foto('04-ejercicio');
    await pagina.getByRole('button', { name: 'Comprobar' }).click();
  }
  await pagina.getByRole('button', { name: 'Continuar' }).waitFor();
  if (fallarAhora) {
    globalThis.yaFallo = true;
    await pagina.getByText('Lo volverás a ver al final.').waitFor();
    await foto('06-error');
  }
  await pagina.getByRole('button', { name: 'Continuar' }).click();
  await pagina.waitForTimeout(150);
}
await pagina.getByRole('heading', { name: 'Resumen' }).waitFor();
await foto('07-resumen');
const precision = await pagina.locator('.cifra').first().textContent();
assert.match(precision, /\d+%/);

// ---------------------------------------------------------------- Práctica personalizada
await pagina.getByRole('link', { name: 'Practicar' }).click();
await pagina.getByText('Por qué estos ejercicios').waitFor();
const porque = await pagina.locator('details').first().textContent();
assert.match(porque, /saludar y pedir ayuda en una tienda \(escritura\)/);
await foto('08-practica');

// ---------------------------------------------------------------- Idioma de interfaz independiente
await pagina.goto(`${BASE}/perfil`);
await pagina.getByLabel('Idioma de la interfaz').selectOption('en-US');
await pagina.getByText('Interface language').waitFor();
await foto('09-perfil-en');
await pagina.goto(BASE);
await pagina.getByText('Your courses').waitFor();
assert.ok(await pagina.getByText('Inglés para hispanohablantes').isVisible(), 'el curso sigue igual tras cambiar la interfaz');
await pagina.goto(`${BASE}/perfil`);
await pagina.getByLabel('Interface language').selectOption('es-419');
await pagina.getByText('Idioma de la interfaz').waitFor();

// ---------------------------------------------------------------- Eliminar perfil
await pagina.getByLabel('Escribe ELIMINAR para confirmar').fill('ELIMINAR');
await pagina.getByRole('button', { name: 'Eliminar mi perfil de idiomas' }).click();
await pagina.waitForURL(BASE + '/');
await pagina.getByRole('link', { name: 'Crear cuenta' }).waitFor();
const { rows } = await db.query('select count(*)::int n from auth.users where email = $1', [email]);
assert.equal(rows[0].n, 0, 'cuenta solo de idiomas: también se borra de Auth');

assert.deepEqual(errores, []);
console.log('RECORRIDO UI OK');
await navegador.close();
await db.end();
