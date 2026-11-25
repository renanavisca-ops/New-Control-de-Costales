// Prueba 6: el piloto funciona con los proveedores de IA de pago desactivados, de principio a fin:
// ruta → lecciones → prueba de unidad → curso terminado → mantenimiento.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, admin, rpc, nuevoAlumno, leccion, jugarSesion, randomUUID, errorDe } from './ayudantes.mjs';
import { obtenerProveedorConversacion, ConversacionDesactivada } from '../src/lib/ia/conversacion.ts';

after(() => pool.end());

test('6a. IA desactivada en configuración y en el adaptador (sin llamadas de red)', async () => {
  const [cfg] = await admin(`select valor from idiomas.config where clave = 'ia_conversacion'`);
  assert.equal(cfg.valor.habilitada, false);
  const alumno = await nuevoAlumno('Wen');
  const cap = await rpc(alumno, 'capacidades');
  assert.equal(cap.ia_conversacion.habilitada, false);
  assert.equal(cap.evaluacion_ia.habilitada, false);
  const i = (await rpc(alumno, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  const conv = await rpc(alumno, 'iniciar_conversacion', { p_insc: i, p_escenario: 'tienda' });
  assert.equal(conv.disponible, false);
  assert.equal(conv.motivo, 'desactivada_en_piloto');

  const fetchOriginal = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; throw new Error('sin red'); };
  try {
    const p = obtenerProveedorConversacion(cfg.valor, { pago: () => { throw new Error('no debe crearse'); } });
    assert.ok(p instanceof ConversacionDesactivada);
    const e = await p.iniciar({ inscripcionId: i, escenario: 'tienda', nivel: 'A1', idiomaMeta: 'en', idiomaBase: 'es' });
    assert.equal(e.disponible, false);
    assert.equal(llamadas, 0);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('6b. Recorrido completo del curso piloto, prueba de unidad y mantenimiento', async () => {
  const ximena = await nuevoAlumno('Ximena');
  const i = (await rpc(ximena, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  for (let n = 1; n <= 5; n++) await leccion(ximena, i, `es-en.u1.l${n}`);
  let ruta = await rpc(ximena, 'ruta', { p_insc: i });
  assert.equal(ruta.siguiente.actividad_id, 'es-en.u1.prueba');
  assert.equal(ruta.completado, false);

  // Prueba de unidad: sin pistas; si no alcanza el umbral, no se supera
  const prueba1 = await rpc(ximena, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: i, p_actividad: 'es-en.u1.prueba' });
  assert.ok(prueba1.items.every((x) => x.tiene_pista === false));
  assert.ok(prueba1.items.every((x) => x.tipo !== 'dictado'));
  assert.equal(await errorDe(rpc(ximena, 'pedir_pista', { p_sesion: prueba1.sesion_id, p_posicion: 1, p_evento: randomUUID() })), 'pistas_no_permitidas');
  const malos = new Set(prueba1.items.slice(0, 4).map((x) => x.item_id));
  const { cierre: c1 } = await jugarSesion(ximena, prueba1, (it) => ({ fallar: malos.has(it.item_id) }));
  assert.equal(c1.superada, false);
  assert.equal(c1.curso_completado, false);
  ruta = await rpc(ximena, 'ruta', { p_insc: i });
  assert.equal(ruta.completado, false);

  const { cierre: c2 } = await leccion(ximena, i, 'es-en.u1.prueba');
  assert.equal(c2.superada, true);
  assert.equal(c2.curso_completado, true);
  ruta = await rpc(ximena, 'ruta', { p_insc: i });
  assert.equal(ruta.completado, true);
  assert.equal(ruta.avance.porcentaje, 100);
  const [hito] = await admin('select resumen from idiomas.hitos_curso where inscripcion_id = $1', [i]);
  assert.ok(hito.resumen.por_modalidad.escuchar >= 0 && hito.resumen.por_modalidad.escribir >= 0);
  assert.equal(hito.resumen.habilidades, 6);

  // Repetir la prueba ya superada no vuelve a marcar el curso ni da primera completitud
  const { cierre: c3 } = await leccion(ximena, i, 'es-en.u1.prueba');
  assert.equal(c3.curso_completado, false);
  assert.equal(c3.primera_completitud, false);

  // Mantenimiento: tres "días" de práctica; los ítems cambian cuando hay alternativas
  const dias = [];
  for (let d = 0; d < 3; d++) {
    await admin(`update idiomas.dominio set proximo_repaso = now() - interval '1 minute' where inscripcion_id = $1`, [i]);
    const p = await rpc(ximena, 'armar_practica', { p_sesion: randomUUID(), p_insc: i });
    assert.equal(p.modo, 'mantenimiento');
    assert.ok(p.items.length >= 6);
    assert.ok(p.recomendaciones.every((r) => r.explicacion.length > 10));
    await jugarSesion(ximena, p);
    dias.push(new Set(p.items.map((x) => x.item_id)));
  }
  const repetidos = [...dias[1]].filter((x) => dias[0].has(x)).length;
  assert.ok(repetidos < dias[1].size, `el día 2 no repite todo el día 1 (${repetidos}/${dias[1].size})`);
  const [xp] = await admin(`select count(*)::int n from idiomas.xp_libro where user_id = $1 and fuente_tipo = 'sesion'`, [ximena.sub]);
  assert.equal(xp.n, 5 + 3 + 3, 'una recompensa por sesión: 5 lecciones + 3 pruebas + 3 mantenimientos');
});

test('6c. Límites configurables de actividad', async () => {
  const yago = await nuevoAlumno('Yago');
  const i = (await rpc(yago, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  await admin(`update idiomas.config set valor = '2' where clave = 'max_sesiones_dia'`);
  try {
    await rpc(yago, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: i, p_actividad: 'es-en.u1.l1' });
    await rpc(yago, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: i, p_actividad: 'es-en.u1.l1' });
    assert.equal(await errorDe(rpc(yago, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: i, p_actividad: 'es-en.u1.l1' })), 'limite_sesiones_dia');
  } finally {
    await admin(`update idiomas.config set valor = '40' where clave = 'max_sesiones_dia'`);
  }
  // Reanudar una sesión existente no cuenta como sesión nueva y devuelve el mismo paquete
  const s = randomUUID();
  const a = await rpc(yago, 'iniciar_leccion', { p_sesion: s, p_insc: i, p_actividad: 'es-en.u1.l1' });
  const b = await rpc(yago, 'iniciar_leccion', { p_sesion: s, p_insc: i, p_actividad: 'es-en.u1.l1' });
  assert.deepEqual(a, b);
});
