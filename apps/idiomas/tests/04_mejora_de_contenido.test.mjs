// Parte B: mejora del contenido con datos agregados de varios alumnos y cola editorial con revisión.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { pool, admin, rpc, nuevoAlumno, respuestaCorrecta, randomUUID, errorDe } from './ayudantes.mjs';

after(() => pool.end());

const VARIANTE = 'Do you have this shirt in medium size?'; // válida, pero no está entre las aceptadas
const ALUMNOS = 24;
let editor; let revisor; let alumnoSuelto;

// Cada alumno hace la lección 3 (disponibilidad) con un comportamiento distinto por ítem.
async function sesionL3(claims, insc, n) {
  const p = await rpc(claims, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: insc, p_actividad: 'es-en.u1.l3' });
  for (const it of p.items) {
    const ok = await respuestaCorrecta(it.item_id, it.version);
    const responder = (r) => rpc(claims, 'responder', { p_sesion: p.sesion_id, p_evento: randomUUID(), p_posicion: it.posicion, p_respuesta: r });
    let intentos = [];
    if (it.item_id === 'en.dis.1' && n < 14) {
      intentos = [VARIANTE, ok];                               // muchos escriben la MISMA variante válida
    } else if (it.item_id === 'en.dis.2' && n < 16) {
      intentos = [['Do have you this in a large', 'You do have this in a large', 'Do you this have in a large', 'Have do you this in a large'][n % 4], ok];
    } else if (it.item_id === 'en.dis.4' && n < 17) {
      const malas = it.contenido.opciones.map((o) => o.id).filter((id) => id !== ok);
      intentos = [malas[0], malas[1] ?? malas[0], malas[0]];   // no logran corregirlo tras el feedback
    } else {
      intentos = [ok];
    }
    for (const r of intentos) {
      const rec = await responder(r);
      if (!rec.reencolar) break;
    }
  }
  await rpc(claims, 'completar_sesion', { p_sesion: p.sesion_id, p_evento: randomUUID() });
  return p;
}

before(async () => {
  editor = await nuevoAlumno('Editora', 'EDITOR-LOCAL');
  revisor = await nuevoAlumno('Revisor', 'REVISOR-LOCAL');
  for (let n = 0; n < ALUMNOS; n++) {
    const a = await nuevoAlumno(`Alumno${n}`);
    const i = (await rpc(a, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
    await admin(`insert into idiomas.actividad_progreso (inscripcion_id, actividad_id) values ($1, 'es-en.u1.l3')`, [i]);
    const p = await sesionL3(a, i, n);
    if (n < 4) {
      await rpc(a, 'reportar_item', { p_sesion: p.sesion_id, p_posicion: p.items.find((x) => x.item_id === 'en.dis.1').posicion,
        p_tipo: 'respuesta_valida_rechazada', p_comentario: 'Creo que mi respuesta también es correcta', p_respuesta: VARIANTE });
    }
    if (n === 0) alumnoSuelto = a;
  }
});

test('B1. Sin muestra mínima no se marca nada para revisión', async () => {
  await admin(`update idiomas.config set valor = '100' where clave = 'muestra_minima_revision'`);
  try {
    const r = await rpc(editor, 'editor_analizar_contenido');
    assert.equal(r.hallazgos, 0);
  } finally {
    await admin(`update idiomas.config set valor = '20' where clave = 'muestra_minima_revision'`);
  }
});

test('B2. Distingue difícil, confuso y respuesta válida rechazada', async () => {
  assert.equal(await errorDe(rpc(alumnoSuelto, 'editor_analizar_contenido')), 'sin_permiso');
  const r = await rpc(editor, 'editor_analizar_contenido');
  assert.ok(r.hallazgos >= 3, JSON.stringify(r));
  const cola = await rpc(editor, 'editor_cola', { p_estado: 'abierto' });
  const de = (id) => cola.filter((q) => q.item_id === id).map((q) => q.hallazgo);
  assert.deepEqual(de('en.dis.1'), ['posible_respuesta_valida_rechazada']);
  assert.deepEqual(de('en.dis.2'), ['dificil']);
  assert.deepEqual(de('en.dis.4'), ['confuso']);
  assert.deepEqual(de('en.dis.3'), [], 'un ítem que va bien no se marca');
  const q1 = cola.find((q) => q.item_id === 'en.dis.1');
  assert.equal(q1.metricas.respuesta_frecuente, 'do you have this shirt in medium size');
  assert.ok(q1.metricas.alumnos >= 20);
  // Solo agregados: ningún identificador de alumno
  assert.doesNotMatch(JSON.stringify(cola), /user_id|sesion_id|[0-9a-f]{8}-[0-9a-f]{4}-/);
  // Reanalizar no duplica entradas abiertas
  await rpc(editor, 'editor_analizar_contenido');
  assert.equal((await rpc(editor, 'editor_cola', { p_estado: 'abierto' })).filter((q) => q.item_id === 'en.dis.1').length, 1);
  // El reporte NO guardó la respuesta porque el alumno no dio consentimiento
  const [rep] = await admin(`select count(*) filter (where respuesta is not null)::int con_texto, count(*)::int total
                               from idiomas.reportes_contenido where item_id = 'en.dis.1'`);
  assert.equal(rep.total, 4);
  assert.equal(rep.con_texto, 0);
});

test('B3. Los cambios requieren revisión de otra persona antes de publicarse', async () => {
  const cola = await rpc(editor, 'editor_cola', { p_estado: 'abierto' });
  const q1 = cola.find((q) => q.item_id === 'en.dis.1');
  // Sesión abierta ANTES de publicar (queda fijada a la versión 1)
  const vieja = await nuevoAlumno('Zoe');
  const iv = (await rpc(vieja, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  await admin(`insert into idiomas.actividad_progreso (inscripcion_id, actividad_id) values ($1, 'es-en.u1.l3')`, [iv]);
  const pv = await rpc(vieja, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: iv, p_actividad: 'es-en.u1.l3' });

  assert.equal(await errorDe(rpc(revisor, 'editor_proponer_cambio', { p_item: 'en.dis.1', p_version_base: 1,
    p_propuesta: JSON.stringify({ aceptadas: [] }), p_motivo: 'x' })), 'sin_permiso');
  assert.match(await errorDe(rpc(editor, 'editor_proponer_cambio', { p_item: 'en.dis.1', p_version_base: 1,
    p_propuesta: JSON.stringify({ estado: 'aprobado' }), p_motivo: 'x' })), /campo_no_editable/);

  const [k] = await admin(`select aceptadas from idiomas.item_claves where item_id = 'en.dis.1' and version = 1`);
  const { cambio_id } = await rpc(editor, 'editor_proponer_cambio', {
    p_item: 'en.dis.1', p_version_base: 1, p_cola_id: q1.id,
    p_propuesta: JSON.stringify({ aceptadas: [...k.aceptadas, VARIANTE] }),
    p_motivo: 'Variante válida rechazada por muchos alumnos',
  });
  assert.equal(await errorDe(rpc(editor, 'editor_publicar_cambio', { p_cambio: cambio_id })), 'requiere_revision_aprobada');
  assert.equal(await errorDe(rpc(editor, 'revisor_resolver_cambio', { p_cambio: cambio_id, p_aprobar: true })), 'sin_permiso');
  assert.equal(await errorDe(rpc(alumnoSuelto, 'revisor_resolver_cambio', { p_cambio: cambio_id, p_aprobar: true })), 'sin_permiso');
  await rpc(revisor, 'revisor_resolver_cambio', { p_cambio: cambio_id, p_aprobar: true, p_comentario: 'Correcto en inglés estándar' });
  const pub = await rpc(editor, 'editor_publicar_cambio', { p_cambio: cambio_id });
  assert.equal(pub.version_nueva, 2);
  assert.equal(await errorDe(rpc(editor, 'editor_publicar_cambio', { p_cambio: cambio_id })), 'requiere_revision_aprobada');

  // La sesión vieja sigue con la versión 1 (rechaza la variante); una nueva usa la 2 y la acepta
  const posV = pv.items.find((x) => x.item_id === 'en.dis.1');
  assert.equal(posV.version, 1);
  const rV = await rpc(vieja, 'responder', { p_sesion: pv.sesion_id, p_evento: randomUUID(), p_posicion: posV.posicion, p_respuesta: VARIANTE });
  assert.equal(rV.resultado, 'incorrecta');
  const nuevo = await nuevoAlumno('Abril');
  const inn = (await rpc(nuevo, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  await admin(`insert into idiomas.actividad_progreso (inscripcion_id, actividad_id) values ($1, 'es-en.u1.l3')`, [inn]);
  const pn = await rpc(nuevo, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: inn, p_actividad: 'es-en.u1.l3' });
  const posN = pn.items.find((x) => x.item_id === 'en.dis.1');
  assert.equal(posN.version, 2);
  const rN = await rpc(nuevo, 'responder', { p_sesion: pn.sesion_id, p_evento: randomUUID(), p_posicion: posN.posicion, p_respuesta: VARIANTE });
  assert.equal(rN.resultado, 'correcta');
  // La entrada de la cola quedó resuelta
  const resueltas = await rpc(editor, 'editor_cola', { p_estado: 'resuelto' });
  assert.ok(resueltas.some((q) => q.id === q1.id));
});
