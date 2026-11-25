// Pruebas 4 y 5 del piloto: cada curso conserva su progreso; aislamiento del proyecto dedicado.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  pool, admin, como, rpc, crearUsuarioAuth, nuevoAlumno, leccion, jugarSesion, respuestaCorrecta,
  randomUUID, errorDe,
} from './ayudantes.mjs';

after(() => pool.end());

test('4. Cada curso conserva su propio progreso, dominio y repasos', async () => {
  const hugo = await nuevoAlumno('Hugo');
  const en = (await rpc(hugo, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  const fr = (await rpc(hugo, 'inscribirme', { p_curso: 'es-fr' })).inscripcion_id;
  assert.notEqual(en, fr);
  // Inscribirse de nuevo es idempotente
  assert.equal((await rpc(hugo, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id, en);

  await leccion(hugo, en, 'es-en.u1.l1');
  await leccion(hugo, en, 'es-en.u1.l2', (it) => ({ fallar: it.item_id === 'en.tal.2' }));
  await leccion(hugo, fr, 'es-fr.u1.l1', (it) => ({ fallar: it.item_id === 'fr.sal.2' }));

  const rEn = await rpc(hugo, 'ruta', { p_insc: en });
  const rFr = await rpc(hugo, 'ruta', { p_insc: fr });
  assert.equal(rEn.avance.hechas, 2);
  assert.equal(rFr.avance.hechas, 1);
  assert.equal(rEn.siguiente.actividad_id, 'es-en.u1.l3');
  assert.equal(rFr.siguiente.actividad_id, 'es-fr.u1.l2');

  const dEn = await rpc(hugo, 'mi_dominio', { p_insc: en });
  const dFr = await rpc(hugo, 'mi_dominio', { p_insc: fr });
  assert.ok(dEn.every((d) => d.habilidad_id.startsWith('en.')));
  assert.ok(dFr.every((d) => d.habilidad_id.startsWith('fr.')));

  // La práctica de francés solo usa ítems de francés, y viceversa
  const pFr = await rpc(hugo, 'armar_practica', { p_sesion: randomUUID(), p_insc: fr });
  assert.ok(pFr.items.length > 0 && pFr.items.every((i) => i.item_id.startsWith('fr.')));
  assert.equal(pFr.curso_id, 'es-fr');
  const pEn = await rpc(hugo, 'armar_practica', { p_sesion: randomUUID(), p_insc: en });
  assert.ok(pEn.items.every((i) => i.item_id.startsWith('en.')));
  assert.equal(pEn.recomendaciones[0].habilidad_id, 'en.tallas');

  // Una lección de un curso no puede abrirse con la inscripción del otro
  assert.equal(await errorDe(rpc(hugo, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: fr, p_actividad: 'es-en.u1.l3' })), 'actividad_no_existe');

  // Cambiar el idioma de interfaz NO cambia inscripciones ni avance
  await rpc(hugo, 'actualizar_preferencias', { p_idioma_interfaz: 'en-US' });
  const perfil = await rpc(hugo, 'mi_perfil');
  assert.equal(perfil.idioma_interfaz, 'en-US');
  assert.equal(perfil.inscripciones.length, 2);
  assert.equal((await rpc(hugo, 'ruta', { p_insc: en })).avance.hechas, 2);

  // Una sesión de francés abierta en otro dispositivo, que llegará tarde
  const tarde = await rpc(hugo, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: fr, p_actividad: 'es-fr.u1.l2' });

  // Eliminar el curso de francés no afecta al de inglés
  assert.equal(await errorDe(rpc(hugo, 'eliminar_inscripcion', { p_insc: fr, p_confirmacion: 'no' })), 'confirmacion_requerida');
  await rpc(hugo, 'eliminar_inscripcion', { p_insc: fr, p_confirmacion: 'ELIMINAR' });
  assert.equal((await rpc(hugo, 'ruta', { p_insc: en })).avance.hechas, 2);
  assert.equal((await rpc(hugo, 'mi_dominio', { p_insc: en })).length, dEn.length);
  assert.equal(await errorDe(rpc(hugo, 'ruta', { p_insc: fr })), 'inscripcion_no_existe');

  // La sesión vieja sincronizada tarde no vuelve a crear avance
  const eventos = [];
  for (const it of tarde.items) eventos.push({ tipo: 'respuesta', evento_id: randomUUID(), posicion: it.posicion, respuesta: await respuestaCorrecta(it.item_id, it.version) });
  eventos.push({ tipo: 'cierre', evento_id: randomUUID() });
  const sync = await rpc(hugo, 'sincronizar', { p_sesion: tarde.sesion_id, p_eventos: JSON.stringify(eventos) });
  assert.ok(sync.recibos.every((r) => r.estado === 'rechazado'));
  const [n] = await admin(`select count(*)::int n from idiomas.dominio d join idiomas.inscripciones i on i.id = d.inscripcion_id
                            where i.user_id = $1 and i.curso_id = 'es-fr'`, [hugo.sub]);
  assert.equal(n.n, 0);

  // Volver a inscribirse crea una inscripción NUEVA desde cero
  const fr2 = (await rpc(hugo, 'inscribirme', { p_curso: 'es-fr' })).inscripcion_id;
  assert.notEqual(fr2, fr);
  assert.equal((await rpc(hugo, 'ruta', { p_insc: fr2 })).avance.hechas, 0);
});

// ---------------------------------------------------------------------------------------------
// Aislamiento en el proyecto dedicado: sin membresía no hay acceso, y Puente no tiene conexiones ni
// credenciales de otras apps.
// ---------------------------------------------------------------------------------------------
test('5a. Un usuario de Auth sin membresía no puede acceder a los datos del piloto', async () => {
  const intruso = await crearUsuarioAuth(`intruso.${randomUUID().slice(0, 6)}@ejemplo.test`);
  for (const [fn, args] of [
    ['catalogo', {}], ['inscribirme', { p_curso: 'es-en' }], ['mi_dominio', { p_insc: randomUUID() }],
    ['armar_practica', { p_sesion: randomUUID(), p_insc: randomUUID() }], ['capacidades', {}],
    ['editor_cola', {}], ['eliminar_mi_perfil', { p_confirmacion: 'ELIMINAR' }],
  ]) {
    assert.equal(await errorDe(rpc(intruso, fn, args)), 'no_miembro', fn);
  }
  assert.deepEqual(await rpc(intruso, 'mi_perfil'), { miembro: false });
  const otro = await nuevoAlumno('Jon');
  const i = (await rpc(otro, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  await leccion(otro, i, 'es-en.u1.l1');
  for (const t of ['inscripciones', 'dominio', 'evidencias', 'xp_libro', 'dias_estudio', 'actividad_progreso', 'miembros', 'recomendaciones']) {
    assert.equal((await como(intruso, `select * from idiomas.${t}`)).length, 0, t);
    assert.equal((await como(null, `select 1`)).length, 1);
    assert.match(await errorDe(como(null, `select * from idiomas.${t}`)), /permission denied/, `anon ${t}`);
  }
  for (const t of ['item_claves', 'item_versiones', 'sesiones', 'intentos', 'config', 'codigos_invitacion', 'cola_editorial']) {
    assert.match(await errorDe(como(intruso, `select * from idiomas.${t}`)), /permission denied/, t);
  }
  // Tampoco puede ver la sesión de otro alumno a través de la API
  assert.equal(await errorDe(rpc(intruso, 'ruta', { p_insc: i })), 'no_miembro');
});

test('5b. Puente no tiene conexiones, objetos ni credenciales de otras apps', async () => {
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  // Base: nada en public, sin extensiones de conexión externa, funciones sin referencias a public.*
  const [pub] = await admin(`select count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace
                              where n.nspname = 'public' and c.relkind in ('r','v','m','f')`);
  assert.equal(pub.n, 0, 'sin tablas en public');
  const ext = await admin(`select extname from pg_extension where extname in ('dblink', 'postgres_fdw', 'http', 'pg_net')`);
  assert.deepEqual(ext, []);
  const fdw = await admin('select count(*)::int n from pg_foreign_server');
  assert.equal(fdw[0].n, 0);
  const refs = await admin(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname in ('idiomas', 'idiomas_api') and p.prosrc ~* '(public\\.|administradores|dispositivos|costal)'`);
  assert.deepEqual(refs, []);
  // Código: ninguna referencia a los otros proyectos ni a sus claves
  const prohibido = /(zqewhthgmkifspvnlith|grsezvfrkxzurgelyujv|tjlyrgvdqgyafamiwyus|sb_publishable_MMX|costales|asistencia|mobile-chat)/i;
  const raiz = new URL('..', import.meta.url).pathname;
  const revisar = (d) => readdirSync(d).flatMap((f) => {
    const r = join(d, f);
    if (['node_modules', '.next', 'tests'].includes(f)) return [];
    return statSync(r).isDirectory() ? revisar(r) : [r];
  });
  const malos = revisar(raiz).filter((f) => /\.(ts|tsx|mjs|sql|sh|json|example|md)$/.test(f) && !f.endsWith('README.md') && !f.endsWith('package-lock.json'))
    .filter((f) => prohibido.test(readFileSync(f, 'utf8')));
  assert.deepEqual(malos, []);
  // Configuración del cliente: sin URL remota por defecto (se toma solo de las variables de Puente)
  const cfg = readFileSync(join(raiz, 'src/lib/config.ts'), 'utf8');
  assert.doesNotMatch(cfg, /supabase\.co/);
});

test('5c. Altas: código, cupo, cuentas técnicas y anónimas; anon sin acceso', async () => {
  const sinCodigo = await crearUsuarioAuth(`m.${randomUUID().slice(0, 6)}@ejemplo.test`);
  assert.equal(await errorDe(rpc(sinCodigo, 'unirme', { p_codigo: 'INVENTADO', p_nombre: 'M' })), 'codigo_invalido');
  await admin(`update idiomas.config set valor = '["bloqueado.test"]' where clave = 'dominios_correo_bloqueados'`);
  try {
    const tecnica = await crearUsuarioAuth(`bot-${randomUUID().slice(0, 6)}@bloqueado.test`);
    assert.equal(await errorDe(rpc(tecnica, 'unirme', { p_codigo: 'PILOTO-LOCAL', p_nombre: 'Bot' })), 'cuenta_no_permitida');
  } finally {
    await admin(`update idiomas.config set valor = '[]' where clave = 'dominios_correo_bloqueados'`);
  }
  const anonimo = await crearUsuarioAuth(null, { is_anonymous: true });
  assert.equal(await errorDe(rpc(anonimo, 'unirme', { p_codigo: 'PILOTO-LOCAL', p_nombre: 'A' })), 'cuenta_anonima_no_permitida');
  assert.match(await errorDe(rpc(null, 'catalogo')), /permission denied/);
  // El rol de un código de editor se respeta, pero un alumno no puede subirse de rol
  const alumno = await nuevoAlumno('Noa');
  assert.match(await errorDe(como(alumno, `update idiomas.miembros set rol = 'admin' where user_id = $1`, [alumno.sub])), /permission denied/);
  // Cupo configurable
  const [{ n }] = await admin(`select count(*)::int n from idiomas.miembros where estado = 'activo'`);
  await admin(`update idiomas.config set valor = $1::jsonb where clave = 'max_miembros'`, [String(n)]);
  try {
    const extra = await crearUsuarioAuth(`o.${randomUUID().slice(0, 6)}@ejemplo.test`);
    assert.equal(await errorDe(rpc(extra, 'unirme', { p_codigo: 'PILOTO-LOCAL', p_nombre: 'O' })), 'cupo_lleno');
  } finally {
    await admin(`update idiomas.config set valor = '50' where clave = 'max_miembros'`);
  }
});

test('5d. Las claves de respuesta nunca llegan al cliente', async () => {
  const p = await nuevoAlumno('Pia');
  const i = (await rpc(p, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  const paquete = await rpc(p, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: i, p_actividad: 'es-en.u1.l1' });
  const texto = JSON.stringify(paquete);
  assert.doesNotMatch(texto, /aceptadas|opcion_correcta|errores_previstos/);
  // La traducción esperada no aparece en el paquete
  assert.ok(!texto.includes('Just looking, thanks.') || paquete.items.some((x) => x.tipo === 'dictado'), 'solo los dictados con voz del dispositivo llevan el texto a reproducir');
  // Funciones internas no ejecutables
  assert.match(await errorDe(como(p, `select * from idiomas.evaluar('en.sal.1', 1, 'a')`)), /permission denied/);
  assert.match(await errorDe(como(p, `select idiomas.aplicar_evidencia(1)`)), /permission denied/);
  // Un alumno no ve sesiones ni dominio de otro
  const q = await nuevoAlumno('Quim');
  assert.equal(await errorDe(rpc(q, 'responder', { p_sesion: paquete.sesion_id, p_evento: randomUUID(), p_posicion: 1, p_respuesta: 'a' })), 'sesion_no_existe');
  assert.equal(await errorDe(rpc(q, 'ruta', { p_insc: i })), 'inscripcion_no_existe');
});

test('5e. Eliminar la cuenta borra los datos de Puente y el usuario de Auth, sin tocar a otros', async () => {
  const ramon = await nuevoAlumno('Ramon');
  const i = (await rpc(ramon, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  await leccion(ramon, i, 'es-en.u1.l1');
  const sara = await nuevoAlumno('Sara');
  const is = (await rpc(sara, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  await leccion(sara, is, 'es-en.u1.l1');
  const antesSara = await rpc(sara, 'ruta', { p_insc: is });

  // Las funciones de servicio no son accesibles desde el cliente
  assert.match(await errorDe(rpc(ramon, 'servicio_validar_alta', { p_codigo: 'X' })), /permission denied/);
  assert.match(await errorDe(rpc(null, 'eliminar_mi_cuenta', { p_confirmacion: 'ELIMINAR' })), /permission denied/);
  assert.equal(await errorDe(rpc(ramon, 'eliminar_mi_cuenta', { p_confirmacion: 'no' })), 'confirmacion_requerida');

  await rpc(ramon, 'eliminar_mi_cuenta', { p_confirmacion: 'ELIMINAR' });
  const [r] = await admin(`select
      (select count(*) from idiomas.miembros where user_id = $1) +
      (select count(*) from idiomas.inscripciones where user_id = $1) +
      (select count(*) from idiomas.sesiones where user_id = $1) +
      (select count(*) from idiomas.intentos where user_id = $1) +
      (select count(*) from idiomas.evidencias where user_id = $1) +
      (select count(*) from idiomas.dominio where user_id = $1) +
      (select count(*) from idiomas.xp_libro where user_id = $1) +
      (select count(*) from idiomas.recomendaciones where user_id = $1) +
      (select count(*) from auth.users where id = $1) as total`, [ramon.sub]);
  assert.equal(Number(r.total), 0);
  // Sara no se ve afectada
  assert.deepEqual(await rpc(sara, 'ruta', { p_insc: is }), antesSara);
  // eliminar_mi_perfil (solo datos) mantiene el usuario de Auth
  await rpc(sara, 'eliminar_mi_perfil', { p_confirmacion: 'ELIMINAR' });
  assert.equal((await admin('select count(*)::int n from auth.users where id = $1', [sara.sub]))[0].n, 1);
  assert.equal(await errorDe(rpc(sara, 'catalogo')), 'no_miembro');
});

test('5f. Almacenamiento: el bucket de idiomas es privado y solo editores suben', async () => {
  const [b] = await admin(`select public, file_size_limit from storage.buckets where id = 'idiomas-medios'`);
  assert.equal(b.public, false);
  assert.equal(Number(b.file_size_limit), 1048576);
  const sinMembresia = await crearUsuarioAuth(`sin.${randomUUID().slice(0, 6)}@ejemplo.test`); // sin membresía
  const alumno = await nuevoAlumno('Uma');
  const editor = await nuevoAlumno('Vero', 'EDITOR-LOCAL');
  await admin(`insert into storage.objects (bucket_id, name) values ('idiomas-medios', 'es-en/u1/audio.mp3')`);
  assert.equal((await como(sinMembresia, `select * from storage.objects where bucket_id = 'idiomas-medios'`)).length, 0);
  assert.ok((await como(alumno, `select * from storage.objects where bucket_id = 'idiomas-medios'`)).length >= 1);
  assert.match(await errorDe(como(alumno, `insert into storage.objects (bucket_id, name) values ('idiomas-medios', 'x.mp3')`)), /row-level security/);
  assert.match(await errorDe(como(sinMembresia, `insert into storage.objects (bucket_id, name) values ('idiomas-medios', 'x.mp3')`)), /row-level security/);
  await como(editor, `insert into storage.objects (bucket_id, name) values ('idiomas-medios', 'es-en/u1/nuevo.mp3')`);
});
