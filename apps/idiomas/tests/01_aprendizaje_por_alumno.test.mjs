// Pruebas 1, 2 y 3 del piloto: aprendizaje por alumno.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, admin, rpc, nuevoAlumno, leccion, jugarSesion, respuestaCorrecta, randomUUID, errorDe } from './ayudantes.mjs';

after(() => pool.end());

const L = (n) => `es-en.u1.l${n}`;

async function avanzarHasta(claims, insc, hasta, decidirPorLeccion = {}) {
  const resultados = {};
  for (let n = 1; n <= hasta; n++) {
    resultados[n] = await leccion(claims, insc, L(n), decidirPorLeccion[n]);
  }
  return resultados;
}

test('1. Dos alumnos con errores distintos reciben repasos distintos', async () => {
  const ana = await nuevoAlumno('Ana');
  const beto = await nuevoAlumno('Beto');
  const ia = (await rpc(ana, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  const ib = (await rpc(beto, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;

  // Ana falla (sin pistas) dos ejercicios ESCRITOS de disponibilidad; Beto falla dos ESCRITOS de precio.
  await avanzarHasta(ana, ia, 3, { 3: (it) => ({ fallar: ['en.dis.2', 'en.dis.1'].includes(it.item_id) }) });
  await avanzarHasta(beto, ib, 4, { 4: (it) => ({ fallar: ['en.prc.1', 'en.prc.4'].includes(it.item_id) }) });

  const pa = await rpc(ana, 'armar_practica', { p_sesion: randomUUID(), p_insc: ia });
  const pb = await rpc(beto, 'armar_practica', { p_sesion: randomUUID(), p_insc: ib });

  const primeraA = pa.recomendaciones[0];
  const primeraB = pb.recomendaciones[0];
  assert.equal(primeraA.habilidad_id, 'en.disponibilidad');
  assert.equal(primeraA.modalidad, 'escribir');
  assert.equal(primeraA.motivo, 'errores_recurrentes');
  assert.equal(primeraA.explicacion,
    'Repasar preguntas de disponibilidad (escritura) porque fallaste dos ejercicios sin pistas.');
  assert.equal(primeraB.habilidad_id, 'en.precio');
  assert.equal(primeraB.motivo, 'errores_recurrentes');
  assert.match(primeraB.explicacion, /preguntar precios .* porque fallaste dos ejercicios sin pistas/);

  // Verifica con OTRO enunciado: el ítem elegido no es el último que falló.
  const [domA] = await admin(`select ultimo_item_fallado from idiomas.dominio where inscripcion_id = $1
                                 and habilidad_id = 'en.disponibilidad' and modalidad = 'escribir'`, [ia]);
  assert.notEqual(primeraA.item_id, domA.ultimo_item_fallado);
  assert.equal(pa.items[0].origen, 'transferencia');

  // Las prácticas son distintas
  const itemsA = pa.items.map((i) => i.item_id).join(',');
  const itemsB = pb.items.map((i) => i.item_id).join(',');
  assert.notEqual(itemsA, itemsB);
  // Variedad: la práctica de Ana combina varias modalidades
  assert.ok(new Set(pa.items.map((i) => i.modalidad)).size >= 2, 'mezcla de modalidades');
  // Las recomendaciones quedan guardadas con su explicación
  const guardadas = await admin('select count(*)::int n from idiomas.recomendaciones where sesion_id = $1', [pa.sesion_id]);
  assert.equal(guardadas[0].n, pa.items.length);
});

test('2. Acertar con pista y acertar sin pista producen evidencias diferentes', async () => {
  const carla = await nuevoAlumno('Carla');
  const dani = await nuevoAlumno('Dani');
  const ic = (await rpc(carla, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  const id = (await rpc(dani, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;

  // Mismo ítem (en.sal.2, escritura). Carla pide pista; Dani no.
  await leccion(carla, ic, L(1), (it) => ({ pista: it.item_id === 'en.sal.2' }));
  await leccion(dani, id, L(1));

  const ev = await admin(`select i.user_id::text, e.calidad from idiomas.evidencias e join idiomas.intentos i on i.id = e.intento_id
                           where e.item_id = 'en.sal.2' and i.user_id = any($1::uuid[])`, [[carla.sub, dani.sub]]);
  const calidad = Object.fromEntries(ev.map((r) => [r.user_id, r.calidad]));
  assert.equal(calidad[carla.sub], 'con_ayuda');
  assert.equal(calidad[dani.sub], 'independiente');

  const dom = async (insc) => (await admin(`select paso, nivel::float, aciertos_independientes, aciertos_con_ayuda,
      extract(epoch from proximo_repaso - now()) / 86400 as dias
      from idiomas.dominio where inscripcion_id = $1 and habilidad_id = 'en.saludo_tienda' and modalidad = 'escribir'`, [insc]))[0];
  const dc = await dom(ic);
  const dd = await dom(id);
  assert.equal(dc.aciertos_con_ayuda, 1);
  assert.equal(dc.aciertos_independientes, 0);
  assert.equal(dd.aciertos_independientes, 1);
  assert.equal(dc.paso, -1, 'con pista no avanza el intervalo');
  assert.equal(dd.paso, 0, 'sin pista avanza al primer intervalo');
  assert.ok(dd.nivel > dc.nivel, 'el acierto independiente pesa más');

  // La práctica de Carla lo explica
  const p = await rpc(carla, 'armar_practica', { p_sesion: randomUUID(), p_insc: ic });
  await rpc(carla, 'abandonar_sesion', { p_sesion: p.sesion_id });
  const rec = p.recomendaciones.find((r) => r.habilidad_id === 'en.saludo_tienda' && r.modalidad === 'escribir');
  assert.ok(rec, 'Carla recibe repaso de la habilidad que solo acertó con ayuda');
  assert.equal(rec.motivo, 'solo_con_ayuda');
  assert.match(rec.explicacion, /solo acertaste con ayuda/);

  // Pasa el tiempo: llega el día del repaso para ambos.
  await admin(`update idiomas.dominio set proximo_repaso = now() - interval '1 minute' where inscripcion_id = any($1::uuid[])`, [[ic, id]]);
  // Un segundo acierto: Dani (sin pista) sube a 3 días; Carla (otra vez con pista) sigue en 1 día.
  const sesionRepaso = async (claims, insc, pista) => {
    const paquete = await rpc(claims, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: insc, p_actividad: L(1) });
    await jugarSesion(claims, paquete, (it) => ({ pista: pista && it.item_id === 'en.sal.2' }));
  };
  await sesionRepaso(carla, ic, true);
  await sesionRepaso(dani, id, false);
  const dc2 = await dom(ic);
  const dd2 = await dom(id);
  assert.equal(dd2.paso, 1);
  assert.ok(dd2.dias > 2.9 && dd2.dias <= 3.01, `Dani: próximo repaso en ~3 días (${dd2.dias})`);
  assert.ok(dc2.dias <= 1.01, `Carla: próximo repaso en ≤1 día (${dc2.dias})`);
});

test('2b. Un fallo conceptual adelanta el repaso; la corrección posterior no borra el primer error', async () => {
  const eli = await nuevoAlumno('Eli');
  const ie = (await rpc(eli, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  await leccion(eli, ie, L(1)); // dominio sólido en saludo/escritura (paso 0 → 1 día)
  const paquete = await rpc(eli, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: ie, p_actividad: L(1) });
  await jugarSesion(eli, paquete, (it) => ({ fallar: it.item_id === 'en.sal.2' }));
  const [d] = await admin(`select paso, extract(epoch from proximo_repaso - now()) / 60 as minutos, fallos, correcciones
      from idiomas.dominio where inscripcion_id = $1 and habilidad_id = 'en.saludo_tienda' and modalidad = 'escribir'`, [ie]);
  assert.equal(d.paso, -1);
  assert.ok(d.minutos <= 10.1, 'repaso adelantado a minutos');
  assert.equal(d.correcciones, 1);
  const intentos = await admin(`select numero_intento, resultado from idiomas.intentos where sesion_id = $1 and item_id = 'en.sal.2' order by numero_intento`, [paquete.sesion_id]);
  assert.deepEqual(intentos.map((x) => x.resultado), ['incorrecta', 'correcta']);
});

test('3. Reenviar una sesión completada sin conexión no duplica avance ni recompensas', async () => {
  const fer = await nuevoAlumno('Fer');
  const insc = (await rpc(fer, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  const sesion = randomUUID();
  // El paquete se descarga con conexión; las respuestas se hacen offline y se envían en lote.
  const paquete = await rpc(fer, 'iniciar_leccion', { p_sesion: sesion, p_insc: insc, p_actividad: L(1) });
  const eventos = [];
  for (const it of paquete.items) {
    eventos.push({ tipo: 'respuesta', evento_id: randomUUID(), posicion: it.posicion,
      respuesta: await respuestaCorrecta(it.item_id, it.version), ocurrido_at: new Date(Date.now() - 3600_000).toISOString() });
  }
  eventos.push({ tipo: 'cierre', evento_id: randomUUID() });

  const foto = async () => (await admin(`select
      (select coalesce(sum(cantidad), 0)::int from idiomas.xp_libro where user_id = $1) xp,
      (select count(*)::int from idiomas.evidencias where user_id = $1) evidencias,
      (select count(*)::int from idiomas.intentos where user_id = $1) intentos,
      (select count(*)::int from idiomas.dias_estudio where user_id = $1) dias,
      (select string_agg(estado || ':' || veces, ',' order by actividad_id) from idiomas.actividad_progreso where inscripcion_id = $2) progreso,
      (select string_agg(habilidad_id || modalidad || nivel || paso, ',' order by habilidad_id, modalidad) from idiomas.dominio where inscripcion_id = $2) dominio`,
    [fer.sub, insc]))[0];

  const r1 = await rpc(fer, 'sincronizar', { p_sesion: sesion, p_eventos: JSON.stringify(eventos) });
  assert.ok(r1.recibos.every((x) => x.estado === 'aceptado'), JSON.stringify(r1.recibos.filter((x) => x.estado !== 'aceptado')));
  const cierre = r1.recibos.at(-1).resultado;
  assert.equal(cierre.xp_ganado, 30); // 20 de lección + 10 de primera completitud
  const antes = await foto();

  // El dispositivo reenvía el mismo lote (dos veces)
  const r2 = await rpc(fer, 'sincronizar', { p_sesion: sesion, p_eventos: JSON.stringify(eventos) });
  await rpc(fer, 'sincronizar', { p_sesion: sesion, p_eventos: JSON.stringify(eventos) });
  assert.ok(r2.recibos.every((x) => x.estado === 'duplicado'));
  assert.equal(r2.recibos.at(-1).resultado.xp_ganado, 30, 'devuelve el primer resultado confirmado');
  assert.deepEqual(await foto(), antes);

  // Un reenvío con IDs nuevos sobre una sesión ya cerrada se rechaza
  const r3 = await rpc(fer, 'sincronizar', { p_sesion: sesion, p_eventos: JSON.stringify([
    { tipo: 'respuesta', evento_id: randomUUID(), posicion: 1, respuesta: 'a' }, { tipo: 'cierre', evento_id: randomUUID() }]) });
  assert.equal(r3.recibos[0].estado, 'rechazado');
  assert.equal(r3.recibos[0].motivo, 'sesion_cerrada');
  assert.equal(r3.recibos[1].estado, 'duplicado');
  assert.deepEqual(await foto(), antes);

  // Dos dispositivos con sesiones distintas de la misma actividad: cada sesión da su XP base,
  // pero la recompensa de primera completitud se da una sola vez.
  const otra = await rpc(fer, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: insc, p_actividad: L(1) });
  const { cierre: c2 } = await jugarSesion(fer, otra);
  assert.equal(c2.xp_ganado, 20);
  assert.equal(c2.primera_completitud, false);
  assert.equal(c2.dia_estudio_nuevo, false, 'la racha avanza una sola vez por día');
});

test('3b. Una sesión incompleta no se puede cerrar ni da recompensas', async () => {
  const gabi = await nuevoAlumno('Gabi');
  const insc = (await rpc(gabi, 'inscribirme', { p_curso: 'es-en' })).inscripcion_id;
  const p = await rpc(gabi, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: insc, p_actividad: L(1) });
  assert.equal(await errorDe(rpc(gabi, 'completar_sesion', { p_sesion: p.sesion_id, p_evento: randomUUID() })), 'sesion_incompleta');
  await rpc(gabi, 'abandonar_sesion', { p_sesion: p.sesion_id });
  const [x] = await admin('select count(*)::int n from idiomas.xp_libro where user_id = $1', [gabi.sub]);
  assert.equal(x.n, 0);
  assert.equal(await errorDe(rpc(gabi, 'iniciar_leccion', { p_sesion: randomUUID(), p_insc: insc, p_actividad: L(2) })), 'actividad_bloqueada');
});
