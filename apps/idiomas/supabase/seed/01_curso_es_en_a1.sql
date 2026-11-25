-- =================================================================================================
-- Contenido ORIGINAL del piloto · Inglés desde español · Unidad A1 «De compras: ropa y tallas»
-- Textos escritos para esta app. Audio: voz del dispositivo (TTS local, sin servicio de pago).
-- Idempotente: se puede volver a ejecutar.
-- =================================================================================================
set role idiomas_propietario;

insert into idiomas.lenguas (codigo, nombre_nativo, escritura, direccion, voz_tts) values
  ('es', 'Español', 'Latn', 'ltr', 'es-419'),
  ('en', 'English', 'Latn', 'ltr', 'en-US'),
  ('fr', 'Français', 'Latn', 'ltr', 'fr-FR')
on conflict (codigo) do update set nombre_nativo = excluded.nombre_nativo, voz_tts = excluded.voz_tts;

insert into idiomas.cursos (id, idioma_base, idioma_meta, titulo, estado, version_publicada, nivel_max, capacidades)
values ('es-en', 'es', 'en', 'Inglés para hispanohablantes', 'piloto', 1, 'A1',
        '{"escuchar": true, "hablar": true, "leer": true, "escribir": true, "conversacion_ia": false}')
on conflict (id) do update set estado = excluded.estado, version_publicada = excluded.version_publicada, capacidades = excluded.capacidades;

insert into idiomas.curso_versiones (curso_id, version, estado, notas, publicada_at)
values ('es-en', 1, 'publicada', 'Piloto: unidad A1 de compras', now())
on conflict do nothing;

insert into idiomas.habilidades (id, idioma_meta, nombre, descripcion) values
  ('en.saludo_tienda', 'en', '{"es": "saludar y pedir ayuda en una tienda"}', '{"es": "Hi, can I help you? / Just looking, thanks."}'),
  ('en.prendas', 'en', '{"es": "nombres de prendas"}', '{"es": "shirt, jacket, dress, shoes, pants"}'),
  ('en.tallas', 'en', '{"es": "decir y preguntar tallas"}', '{"es": "small, medium, large; What size are you?"}'),
  ('en.disponibilidad', 'en', '{"es": "preguntas de disponibilidad"}', '{"es": "Do you have this in a medium?"}'),
  ('en.precio', 'en', '{"es": "preguntar precios"}', '{"es": "How much is this? It''s twenty dollars."}'),
  ('en.pagar', 'en', '{"es": "cerrar una compra y pagar"}', '{"es": "I''ll take it. Can I pay by card?"}')
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

insert into idiomas.unidades (id, curso_id, version, orden, titulo, objetivo, cefr, guia) values
  ('es-en.u1', 'es-en', 1, 1, 'De compras: ropa y tallas',
   'Pedir ayuda, preguntar por una talla, saber el precio y pagar en una tienda de ropa.', 'A1',
   '[{"frase": "Hi! Can I help you?", "significado": "¡Hola! ¿Te ayudo?"},
     {"frase": "Just looking, thanks.", "significado": "Solo estoy mirando, gracias."},
     {"frase": "What size are you?", "significado": "¿Qué talla usas?"},
     {"frase": "Do you have this in a medium?", "significado": "¿Lo tienen en talla mediana?"},
     {"frase": "How much is this?", "significado": "¿Cuánto cuesta esto?"},
     {"frase": "I''ll take it.", "significado": "Me lo llevo."},
     {"nota": "size = talla · price = precio. Para preguntar un precio se usa How much, no How many."}]')
on conflict (id) do update set titulo = excluded.titulo, objetivo = excluded.objetivo, guia = excluded.guia;

insert into idiomas.actividades (id, unidad_id, orden, tipo, titulo, obligatoria, permite_pistas) values
  ('es-en.u1.l1', 'es-en.u1', 1, 'leccion', 'Hola, ¿te ayudo?', true, true),
  ('es-en.u1.l2', 'es-en.u1', 2, 'leccion', '¿Qué talla usas?', true, true),
  ('es-en.u1.l3', 'es-en.u1', 3, 'leccion', '¿Lo tienen en otra talla?', true, true),
  ('es-en.u1.l4', 'es-en.u1', 4, 'leccion', '¿Cuánto cuesta?', true, true),
  ('es-en.u1.l5', 'es-en.u1', 5, 'leccion', 'Me lo llevo', true, true),
  ('es-en.u1.prueba', 'es-en.u1', 6, 'prueba_unidad', 'Prueba de la unidad', true, false)
on conflict (id) do update set titulo = excluded.titulo, tipo = excluded.tipo, permite_pistas = excluded.permite_pistas;

-- Ayudante temporal para cargar ítems (versión 1)
create or replace function pg_temp.item(p_id text, p_curso text, p_hab text, p_concepto text, p_tipo text, p_modalidad text,
  p_contenido jsonb, p_explicacion text, p_aceptadas text[] default '{}', p_opcion text default null, p_pista text default null,
  p_tipo_error text default 'gramatica', p_errores jsonb default '[]', p_reglas jsonb default '{}', p_dificultad int default 1)
returns void language plpgsql as $$
begin
  insert into idiomas.items (id, curso_id, habilidad_id, concepto) values (p_id, p_curso, p_hab, p_concepto)
  on conflict (id) do update set habilidad_id = excluded.habilidad_id, concepto = excluded.concepto;
  insert into idiomas.item_versiones (item_id, version, estado, tipo, modalidad, dificultad, contenido, pista, explicacion, tipo_error_por_defecto)
  values (p_id, 1, 'aprobado', p_tipo, p_modalidad, p_dificultad, p_contenido, p_pista, p_explicacion, p_tipo_error)
  on conflict (item_id, version) do update set tipo = excluded.tipo, modalidad = excluded.modalidad, contenido = excluded.contenido,
    pista = excluded.pista, explicacion = excluded.explicacion, tipo_error_por_defecto = excluded.tipo_error_por_defecto;
  insert into idiomas.item_claves (item_id, version, aceptadas, opcion_correcta, reglas, errores_previstos)
  values (p_id, 1, p_aceptadas, p_opcion, p_reglas, p_errores)
  on conflict (item_id, version) do update set aceptadas = excluded.aceptadas, opcion_correcta = excluded.opcion_correcta,
    reglas = excluded.reglas, errores_previstos = excluded.errores_previstos;
end $$;

create or replace function pg_temp.en_leccion(p_act text, p_items text[]) returns void language sql as $$
  insert into idiomas.actividad_items (actividad_id, item_id, orden)
  select p_act, x, n from unnest(p_items) with ordinality as t(x, n)
  on conflict (actividad_id, item_id) do update set orden = excluded.orden;
$$;

-- ---------------------------------------------------------------- Habilidad: saludar y pedir ayuda
select pg_temp.item('en.sal.1', 'es-en', 'en.saludo_tienda', 'ofrecer_ayuda', 'seleccion', 'leer',
  '{"enunciado": "La vendedora te saluda: «Hi! Can I help you?». ¿Qué te está preguntando?",
    "opciones": [{"id": "a", "texto": "Si puede ayudarte"}, {"id": "b", "texto": "Cómo te llamas"}, {"id": "c", "texto": "Qué talla usas"}]}',
  'Can I help you? significa «¿Puedo ayudarte?». Es la frase típica al entrar a una tienda.',
  p_opcion => 'a', p_pista => 'help = ayudar', p_tipo_error => 'comprension',
  p_errores => '[{"respuesta": "c", "tipo": "vocabulario", "feedback": "Para la talla se usa size. Aquí aparece help: ayudar."}]');
select pg_temp.item('en.sal.2', 'es-en', 'en.saludo_tienda', 'solo_mirando', 'traduccion', 'escribir',
  '{"enunciado": "Traduce al inglés", "texto": "Solo estoy mirando, gracias.", "idioma_respuesta": "en"}',
  'Just looking significa «solo mirando». Es una forma amable de decir que todavía no necesitas ayuda.',
  p_aceptadas => array['Just looking, thanks.', 'I''m just looking, thanks.', 'I am just looking, thanks.', 'Just looking, thank you.', 'I''m just looking, thank you.'],
  p_pista => 'Empieza con: Just looking…', p_tipo_error => 'vocabulario');
select pg_temp.item('en.sal.3', 'es-en', 'en.saludo_tienda', 'ofrecer_ayuda', 'escuchar_seleccion', 'escuchar',
  '{"enunciado": "Escucha y elige qué dijo el vendedor.", "audio_texto": "Hi! Can I help you?",
    "opciones": [{"id": "a", "texto": "¡Hola! ¿Te ayudo?"}, {"id": "b", "texto": "¡Hola! ¿Qué buscas?"}, {"id": "c", "texto": "¡Adiós! Gracias."}]}',
  'Hi = hola. Can I help you? = ¿te ayudo?', p_opcion => 'a', p_tipo_error => 'comprension');
select pg_temp.item('en.sal.4', 'es-en', 'en.saludo_tienda', 'solo_mirando', 'dictado', 'escuchar',
  '{"enunciado": "Escucha y escribe lo que oyes.", "audio_texto": "Just looking, thanks."}',
  'Just looking, thanks: «Solo estoy mirando, gracias».',
  p_aceptadas => array['Just looking, thanks.', 'Just looking thanks'], p_tipo_error => 'ortografia');
select pg_temp.item('en.sal.5', 'es-en', 'en.saludo_tienda', 'ofrecer_ayuda', 'hablar', 'hablar',
  '{"enunciado": "Responde en voz alta que sí quieres ayuda.", "texto_a_decir": "Yes, please.", "traduccion": "Sí, por favor."}',
  'Yes, please = «Sí, por favor». Please va al final de la frase.',
  p_aceptadas => array['Yes, please.', 'Yes please'], p_tipo_error => 'pronunciacion');
-- reserva (transferencia: otro enunciado del mismo concepto)
select pg_temp.item('en.sal.6', 'es-en', 'en.saludo_tienda', 'ofrecer_ayuda', 'traduccion', 'escribir',
  '{"enunciado": "Traduce al inglés", "texto": "Hola, ¿te puedo ayudar?", "idioma_respuesta": "en"}',
  'Can I help you? sirve tanto para «¿te ayudo?» como para «¿te puedo ayudar?».',
  p_aceptadas => array['Hi, can I help you?', 'Hello, can I help you?', 'Hi! Can I help you?', 'Hello! Can I help you?'],
  p_pista => 'can = poder · help = ayudar', p_tipo_error => 'gramatica',
  p_errores => '[{"respuesta": "Hi, I can help you?", "tipo": "gramatica", "feedback": "En una pregunta, can va antes del sujeto: Can I…?"}]');
select pg_temp.item('en.sal.7', 'es-en', 'en.saludo_tienda', 'solo_mirando', 'seleccion', 'leer',
  '{"enunciado": "Quieres que te dejen mirar tranquilo. ¿Qué dices?",
    "opciones": [{"id": "a", "texto": "Just looking, thanks."}, {"id": "b", "texto": "I''ll take it."}, {"id": "c", "texto": "How much is this?"}]}',
  'Just looking, thanks indica que solo estás mirando.', p_opcion => 'a', p_tipo_error => 'comprension');
select pg_temp.item('en.sal.8', 'es-en', 'en.saludo_tienda', 'solo_mirando', 'escuchar_seleccion', 'escuchar',
  '{"enunciado": "Escucha la respuesta del cliente. ¿Qué quiere?", "audio_texto": "I''m just looking, thank you.",
    "opciones": [{"id": "a", "texto": "Solo mirar por ahora"}, {"id": "b", "texto": "Pagar con tarjeta"}, {"id": "c", "texto": "Otra talla"}]}',
  'I''m just looking = solo estoy mirando.', p_opcion => 'a', p_tipo_error => 'comprension');

-- ---------------------------------------------------------------- Habilidad: prendas
select pg_temp.item('en.pre.1', 'es-en', 'en.prendas', 'camisa', 'seleccion', 'leer',
  '{"enunciado": "¿Cuál significa «camisa»?",
    "opciones": [{"id": "a", "texto": "shirt"}, {"id": "b", "texto": "shoes"}, {"id": "c", "texto": "skirt"}]}',
  'shirt = camisa · shoes = zapatos · skirt = falda.', p_opcion => 'a', p_pista => 'Suena parecido a «chert».',
  p_tipo_error => 'vocabulario',
  p_errores => '[{"respuesta": "c", "tipo": "vocabulario", "feedback": "skirt es falda; camisa es shirt."}]');
select pg_temp.item('en.pre.2', 'es-en', 'en.prendas', 'chaqueta', 'traduccion', 'escribir',
  '{"enunciado": "Escribe en inglés", "texto": "la chaqueta", "idioma_respuesta": "en"}',
  'jacket = chaqueta. En inglés el artículo «la» es the.',
  p_aceptadas => array['the jacket', 'jacket', 'a jacket'], p_pista => 'Empieza con j…', p_tipo_error => 'vocabulario');
select pg_temp.item('en.pre.3', 'es-en', 'en.prendas', 'zapatos', 'escuchar_seleccion', 'escuchar',
  '{"enunciado": "Escucha y elige la prenda.", "audio_texto": "These shoes are nice.",
    "opciones": [{"id": "a", "texto": "zapatos"}, {"id": "b", "texto": "camisas"}, {"id": "c", "texto": "pantalones"}]}',
  'shoes = zapatos. These shoes are nice = estos zapatos son bonitos.', p_opcion => 'a', p_tipo_error => 'vocabulario');
select pg_temp.item('en.pre.4', 'es-en', 'en.prendas', 'vestido', 'fichas', 'escribir',
  '{"enunciado": "Ordena la frase: «Me gusta este vestido»", "fichas": ["I", "like", "this", "dress", "these", "dresses"]}',
  'I like this dress. This es para una sola cosa; these para varias.',
  p_aceptadas => array['I like this dress'], p_tipo_error => 'orden',
  p_errores => '[{"respuesta": "I like these dresses", "tipo": "gramatica", "feedback": "«Este vestido» es uno solo: this dress."},
                 {"respuesta": "I like these dress", "tipo": "gramatica", "feedback": "Con un solo vestido se usa this, no these."}]');
select pg_temp.item('en.pre.5', 'es-en', 'en.prendas', 'chaqueta', 'dictado', 'escuchar',
  '{"enunciado": "Escucha y escribe lo que oyes.", "audio_texto": "I like this jacket."}',
  'I like this jacket = me gusta esta chaqueta.',
  p_aceptadas => array['I like this jacket.'], p_tipo_error => 'ortografia');
select pg_temp.item('en.pre.6', 'es-en', 'en.prendas', 'camisa', 'traduccion', 'escribir',
  '{"enunciado": "Escribe en inglés", "texto": "una camisa azul", "idioma_respuesta": "en"}',
  'En inglés el color va antes de la prenda: a blue shirt.',
  p_aceptadas => array['a blue shirt'], p_pista => 'El color va primero: a blue…', p_tipo_error => 'orden',
  p_errores => '[{"respuesta": "a shirt blue", "tipo": "orden", "feedback": "El adjetivo va antes del sustantivo: a blue shirt."}]');
select pg_temp.item('en.pre.7', 'es-en', 'en.prendas', 'pantalones', 'seleccion', 'leer',
  '{"enunciado": "¿Cuál significa «pantalones»?",
    "opciones": [{"id": "a", "texto": "pants"}, {"id": "b", "texto": "dress"}, {"id": "c", "texto": "jacket"}]}',
  'pants = pantalones (en inglés de EE. UU.).', p_opcion => 'a', p_tipo_error => 'vocabulario');
select pg_temp.item('en.pre.8', 'es-en', 'en.prendas', 'camisa', 'hablar', 'hablar',
  '{"enunciado": "Di en voz alta", "texto_a_decir": "I like this shirt.", "traduccion": "Me gusta esta camisa."}',
  'I like this shirt = me gusta esta camisa.', p_aceptadas => array['I like this shirt.'], p_tipo_error => 'pronunciacion');

-- ---------------------------------------------------------------- Habilidad: tallas
select pg_temp.item('en.tal.1', 'es-en', 'en.tallas', 'que_talla', 'seleccion', 'leer',
  '{"enunciado": "¿Qué significa «What size are you?»?",
    "opciones": [{"id": "a", "texto": "¿Qué talla usas?"}, {"id": "b", "texto": "¿Cuánto cuesta?"}, {"id": "c", "texto": "¿De qué color es?"}]}',
  'size = talla. What size are you? = ¿qué talla usas?', p_opcion => 'a', p_pista => 'size = talla',
  p_tipo_error => 'vocabulario',
  p_errores => '[{"respuesta": "b", "tipo": "vocabulario", "feedback": "Para el precio se usa How much. size es talla."}]');
select pg_temp.item('en.tal.2', 'es-en', 'en.tallas', 'mi_talla', 'traduccion', 'escribir',
  '{"enunciado": "Traduce al inglés", "texto": "Uso talla mediana.", "idioma_respuesta": "en"}',
  'Para decir tu talla se usa I''m a + talla: I''m a medium.',
  p_aceptadas => array['I''m a medium.', 'I am a medium.', 'I wear a medium.', 'I''m a size medium.', 'I wear size medium.'],
  p_pista => 'I''m a…', p_tipo_error => 'gramatica',
  p_errores => '[{"respuesta": "I''m a small", "tipo": "vocabulario", "feedback": "small es pequeña; mediana es medium."},
                 {"respuesta": "I''m a large", "tipo": "vocabulario", "feedback": "large es grande; mediana es medium."},
                 {"respuesta": "I use a medium", "tipo": "gramatica", "feedback": "Para tallas no se usa use: di I''m a medium o I wear a medium."}]');
select pg_temp.item('en.tal.3', 'es-en', 'en.tallas', 'mi_talla', 'escuchar_seleccion', 'escuchar',
  '{"enunciado": "Escucha. ¿Qué talla usa la clienta?", "audio_texto": "I''m a small.",
    "opciones": [{"id": "a", "texto": "Pequeña"}, {"id": "b", "texto": "Mediana"}, {"id": "c", "texto": "Grande"}]}',
  'small = pequeña · medium = mediana · large = grande.', p_opcion => 'a', p_tipo_error => 'comprension');
select pg_temp.item('en.tal.4', 'es-en', 'en.tallas', 'que_talla', 'fichas', 'escribir',
  '{"enunciado": "Ordena la pregunta: «¿Qué talla usas?»", "fichas": ["What", "size", "are", "you", "price", "is"]}',
  'What size are you? El verbo are va antes de you en la pregunta.',
  p_aceptadas => array['What size are you'], p_tipo_error => 'orden',
  p_errores => '[{"respuesta": "What size you are", "tipo": "orden", "feedback": "En la pregunta el verbo va antes: are you."},
                 {"respuesta": "What price are you", "tipo": "vocabulario", "feedback": "price es precio; talla es size."}]');
select pg_temp.item('en.tal.5', 'es-en', 'en.tallas', 'mi_talla', 'dictado', 'escuchar',
  '{"enunciado": "Escucha y escribe lo que oyes.", "audio_texto": "I''m a large."}',
  'I''m a large = uso talla grande.', p_aceptadas => array['I''m a large.', 'I am a large.'], p_tipo_error => 'ortografia');
select pg_temp.item('en.tal.6', 'es-en', 'en.tallas', 'mi_talla', 'hablar', 'hablar',
  '{"enunciado": "Di en voz alta tu talla: mediana.", "texto_a_decir": "I''m a medium.", "traduccion": "Uso talla mediana."}',
  'I''m a medium = uso talla mediana.', p_aceptadas => array['I''m a medium.', 'I am a medium.', 'I''m medium'], p_tipo_error => 'pronunciacion');
select pg_temp.item('en.tal.7', 'es-en', 'en.tallas', 'que_talla', 'traduccion', 'escribir',
  '{"enunciado": "Traduce al inglés", "texto": "¿Qué talla usa usted?", "idioma_respuesta": "en"}',
  'En inglés you sirve para tú y usted: What size are you?',
  p_aceptadas => array['What size are you?', 'What size do you wear?', 'What is your size?', 'What''s your size?'],
  p_pista => 'What size…?', p_tipo_error => 'orden');
select pg_temp.item('en.tal.8', 'es-en', 'en.tallas', 'mi_talla', 'seleccion', 'leer',
  '{"enunciado": "La talla «grande» en inglés es…",
    "opciones": [{"id": "a", "texto": "large"}, {"id": "b", "texto": "long"}, {"id": "c", "texto": "small"}]}',
  'large = grande. Ojo: no es «largo» (long).', p_opcion => 'a', p_tipo_error => 'vocabulario',
  p_errores => '[{"respuesta": "b", "tipo": "vocabulario", "feedback": "long es largo. Grande (talla) es large."}]');
select pg_temp.item('en.tal.9', 'es-en', 'en.tallas', 'que_talla', 'escuchar_seleccion', 'escuchar',
  '{"enunciado": "Escucha la pregunta del vendedor. ¿Qué quiere saber?", "audio_texto": "What size are you?",
    "opciones": [{"id": "a", "texto": "Tu talla"}, {"id": "b", "texto": "Tu nombre"}, {"id": "c", "texto": "Cómo vas a pagar"}]}',
  'What size are you? pregunta por tu talla.', p_opcion => 'a', p_tipo_error => 'comprension');

-- ---------------------------------------------------------------- Habilidad: disponibilidad
select pg_temp.item('en.dis.1', 'es-en', 'en.disponibilidad', 'tienen_en_talla', 'traduccion', 'escribir',
  '{"enunciado": "Pregunta en inglés si tienen esta camisa en talla mediana.", "texto": "¿Tienen esta camisa en talla mediana?", "idioma_respuesta": "en"}',
  'Usa Do you have para preguntar por disponibilidad. In a medium e in size medium expresan la talla.',
  p_aceptadas => array['Do you have this shirt in a medium?', 'Do you have this shirt in size medium?', 'Do you have this shirt in medium?'],
  p_pista => 'La pregunta de disponibilidad puede comenzar con Do you have…?', p_tipo_error => 'gramatica',
  p_errores => '[{"respuesta": "Do you have this shirt in a small?", "tipo": "vocabulario", "feedback": "small es pequeña; se pedía mediana: medium."},
                 {"respuesta": "Do you have these shirt in a medium?", "tipo": "gramatica", "feedback": "Una sola camisa: this shirt."},
                 {"respuesta": "You have this shirt in a medium?", "tipo": "gramatica", "feedback": "En inglés la pregunta necesita Do al inicio: Do you have…?"},
                 {"respuesta": "Have you this shirt in a medium?", "tipo": "gramatica", "feedback": "Lo natural es Do you have…?"}]',
  p_dificultad => 2);
select pg_temp.item('en.dis.2', 'es-en', 'en.disponibilidad', 'tienen_en_talla', 'fichas', 'escribir',
  '{"enunciado": "Ordena la pregunta: «¿La tienen en grande?»", "fichas": ["Do", "you", "have", "this", "in", "a", "large", "are"]}',
  'Do you have this in a large? Do va al inicio de la pregunta.',
  p_aceptadas => array['Do you have this in a large'], p_tipo_error => 'orden',
  p_errores => '[{"respuesta": "Are you have this in a large", "tipo": "gramatica", "feedback": "Con have la pregunta se forma con Do, no con Are."},
                 {"respuesta": "You have do this in a large", "tipo": "orden", "feedback": "Do va al principio: Do you have…?"}]');
select pg_temp.item('en.dis.3', 'es-en', 'en.disponibilidad', 'tienen_en_talla', 'escuchar_seleccion', 'escuchar',
  '{"enunciado": "Escucha a la clienta. ¿Qué pide?", "audio_texto": "Do you have this jacket in a small?",
    "opciones": [{"id": "a", "texto": "La chaqueta en talla pequeña"}, {"id": "b", "texto": "El precio de la chaqueta"}, {"id": "c", "texto": "Una chaqueta azul"}]}',
  'Do you have this jacket in a small? = ¿tienen esta chaqueta en pequeña?', p_opcion => 'a', p_tipo_error => 'comprension');
select pg_temp.item('en.dis.4', 'es-en', 'en.disponibilidad', 'respuesta_disponibilidad', 'seleccion', 'leer',
  '{"enunciado": "Preguntaste por una talla y te dicen: «Sorry, we don''t have it in a medium». ¿Qué significa?",
    "opciones": [{"id": "a", "texto": "No la tienen en mediana"}, {"id": "b", "texto": "Sí la tienen en mediana"}, {"id": "c", "texto": "Está en oferta"}]}',
  'Sorry, we don''t have it = lo siento, no la tenemos.', p_opcion => 'a', p_pista => 'don''t = no', p_tipo_error => 'comprension',
  p_errores => '[{"respuesta": "b", "tipo": "comprension", "feedback": "don''t have es negativo: no la tienen."}]');
select pg_temp.item('en.dis.5', 'es-en', 'en.disponibilidad', 'tienen_en_talla', 'hablar', 'hablar',
  '{"enunciado": "Pregunta en voz alta si la tienen en mediana.", "texto_a_decir": "Do you have this in a medium?", "traduccion": "¿La tienen en mediana?"}',
  'Do you have this in a medium?', p_aceptadas => array['Do you have this in a medium?', 'Do you have this in medium?'], p_tipo_error => 'pronunciacion');
select pg_temp.item('en.dis.6', 'es-en', 'en.disponibilidad', 'tienen_en_talla', 'dictado', 'escuchar',
  '{"enunciado": "Escucha y escribe lo que oyes.", "audio_texto": "Do you have this in a medium?"}',
  'Do you have this in a medium? = ¿la tienen en mediana?', p_aceptadas => array['Do you have this in a medium?'], p_tipo_error => 'ortografia');
-- reserva de transferencia: otra prenda, otra talla, otro color
select pg_temp.item('en.dis.7', 'es-en', 'en.disponibilidad', 'tienen_en_talla', 'traduccion', 'escribir',
  '{"enunciado": "Traduce al inglés", "texto": "¿Tienen estos zapatos en negro?", "idioma_respuesta": "en"}',
  'La misma estructura sirve para colores: Do you have these shoes in black? (these porque son varios).',
  p_aceptadas => array['Do you have these shoes in black?'], p_pista => 'Do you have these…?', p_tipo_error => 'gramatica',
  p_errores => '[{"respuesta": "Do you have this shoes in black?", "tipo": "gramatica", "feedback": "Son varios zapatos: these shoes."}]', p_dificultad => 2);
select pg_temp.item('en.dis.8', 'es-en', 'en.disponibilidad', 'tienen_en_talla', 'traduccion', 'escribir',
  '{"enunciado": "Traduce al inglés", "texto": "¿Tienen este vestido en talla grande?", "idioma_respuesta": "en"}',
  'Do you have this dress in a large? La estructura se transfiere a otra prenda y talla.',
  p_aceptadas => array['Do you have this dress in a large?', 'Do you have this dress in size large?', 'Do you have this dress in large?'],
  p_pista => 'Do you have this dress…?', p_tipo_error => 'gramatica', p_dificultad => 2);
select pg_temp.item('en.dis.9', 'es-en', 'en.disponibilidad', 'tienen_en_talla', 'escuchar_seleccion', 'escuchar',
  '{"enunciado": "Escucha. ¿Qué busca el cliente?", "audio_texto": "Do you have these pants in a large?",
    "opciones": [{"id": "a", "texto": "Pantalones en talla grande"}, {"id": "b", "texto": "Pantalones más baratos"}, {"id": "c", "texto": "Zapatos grandes"}]}',
  'these pants in a large = estos pantalones en grande.', p_opcion => 'a', p_tipo_error => 'comprension');
select pg_temp.item('en.dis.10', 'es-en', 'en.disponibilidad', 'respuesta_disponibilidad', 'seleccion', 'leer',
  '{"enunciado": "La vendedora dice: «Yes, here you go». ¿Qué pasó?",
    "opciones": [{"id": "a", "texto": "Sí la tienen y te la da"}, {"id": "b", "texto": "No la tienen"}, {"id": "c", "texto": "Te pregunta la talla"}]}',
  'Here you go = aquí tienes.', p_opcion => 'a', p_tipo_error => 'comprension');

-- ---------------------------------------------------------------- Habilidad: precio
select pg_temp.item('en.prc.1', 'es-en', 'en.precio', 'cuanto_cuesta', 'traduccion', 'escribir',
  '{"enunciado": "Traduce al inglés", "texto": "¿Cuánto cuesta esto?", "idioma_respuesta": "en"}',
  'Para precios se usa How much: How much is this?',
  p_aceptadas => array['How much is this?', 'How much does this cost?', 'How much is it?'],
  p_pista => 'How much…?', p_tipo_error => 'gramatica',
  p_errores => '[{"respuesta": "How many is this?", "tipo": "gramatica", "feedback": "How many es para contar cosas. Para precios: How much."},
                 {"respuesta": "What size is this?", "tipo": "vocabulario", "feedback": "size es talla. Para el precio: How much is this?"}]');
select pg_temp.item('en.prc.2', 'es-en', 'en.precio', 'talla_vs_precio', 'seleccion', 'leer',
  '{"enunciado": "Quieres saber el PRECIO de una chaqueta. ¿Qué preguntas?",
    "opciones": [{"id": "a", "texto": "How much is this jacket?"}, {"id": "b", "texto": "What size is this jacket?"}, {"id": "c", "texto": "Do you have this jacket?"}]}',
  'How much pregunta el precio; What size pregunta la talla.', p_opcion => 'a', p_pista => 'precio → How much', p_tipo_error => 'vocabulario',
  p_errores => '[{"respuesta": "b", "tipo": "vocabulario", "feedback": "size es talla, no precio."}]');
select pg_temp.item('en.prc.3', 'es-en', 'en.precio', 'precio_respuesta', 'escuchar_seleccion', 'escuchar',
  '{"enunciado": "Escucha el precio.", "audio_texto": "It''s twenty dollars.",
    "opciones": [{"id": "a", "texto": "20 dólares"}, {"id": "b", "texto": "12 dólares"}, {"id": "c", "texto": "200 dólares"}]}',
  'twenty = 20 · twelve = 12 · two hundred = 200.', p_opcion => 'a', p_tipo_error => 'comprension',
  p_errores => '[{"respuesta": "b", "tipo": "comprension", "feedback": "twelve es 12; twenty es 20."}]');
select pg_temp.item('en.prc.4', 'es-en', 'en.precio', 'cuanto_cuesta', 'fichas', 'escribir',
  '{"enunciado": "Ordena: «¿Cuánto cuesta esta camisa?»", "fichas": ["How", "much", "is", "this", "shirt", "many"]}',
  'How much is this shirt?', p_aceptadas => array['How much is this shirt'], p_tipo_error => 'orden',
  p_errores => '[{"respuesta": "How many is this shirt", "tipo": "gramatica", "feedback": "Para precios: How much, no How many."}]');
select pg_temp.item('en.prc.5', 'es-en', 'en.precio', 'precio_respuesta', 'dictado', 'escuchar',
  '{"enunciado": "Escucha y escribe el precio con palabras o números.", "audio_texto": "It''s fifteen dollars."}',
  'fifteen = 15.', p_aceptadas => array['It''s fifteen dollars.', 'It is fifteen dollars.', 'It''s 15 dollars.', 'It''s $15.', '15', 'fifteen dollars', '15 dollars'],
  p_tipo_error => 'comprension',
  p_errores => '[{"respuesta": "It''s fifty dollars", "tipo": "comprension", "feedback": "fifty es 50; fifteen es 15."}]');
select pg_temp.item('en.prc.6', 'es-en', 'en.precio', 'cuanto_cuesta', 'hablar', 'hablar',
  '{"enunciado": "Pregunta en voz alta cuánto cuesta.", "texto_a_decir": "How much is this?", "traduccion": "¿Cuánto cuesta esto?"}',
  'How much is this?', p_aceptadas => array['How much is this?', 'How much is it?'], p_tipo_error => 'pronunciacion');
select pg_temp.item('en.prc.7', 'es-en', 'en.precio', 'cuanto_cuesta', 'traduccion', 'escribir',
  '{"enunciado": "Traduce al inglés", "texto": "¿Cuánto cuestan estos zapatos?", "idioma_respuesta": "en"}',
  'Con varias cosas: How much are these shoes?',
  p_aceptadas => array['How much are these shoes?', 'How much do these shoes cost?'], p_pista => 'How much are…?', p_tipo_error => 'gramatica',
  p_errores => '[{"respuesta": "How much is these shoes?", "tipo": "gramatica", "feedback": "Con plural se usa are: How much are these shoes?"}]', p_dificultad => 2);
select pg_temp.item('en.prc.8', 'es-en', 'en.precio', 'talla_vs_precio', 'escuchar_seleccion', 'escuchar',
  '{"enunciado": "Escucha la pregunta. ¿Sobre qué es?", "audio_texto": "How much is this dress?",
    "opciones": [{"id": "a", "texto": "El precio del vestido"}, {"id": "b", "texto": "La talla del vestido"}, {"id": "c", "texto": "El color del vestido"}]}',
  'How much = cuánto (precio).', p_opcion => 'a', p_tipo_error => 'vocabulario',
  p_errores => '[{"respuesta": "b", "tipo": "vocabulario", "feedback": "How much pregunta el precio; la talla sería What size."}]');

-- ---------------------------------------------------------------- Habilidad: pagar
select pg_temp.item('en.pag.1', 'es-en', 'en.pagar', 'me_lo_llevo', 'seleccion', 'leer',
  '{"enunciado": "Decides comprar la camisa. ¿Qué dices?",
    "opciones": [{"id": "a", "texto": "I''ll take it."}, {"id": "b", "texto": "Just looking."}, {"id": "c", "texto": "What size are you?"}]}',
  'I''ll take it = me lo llevo.', p_opcion => 'a', p_pista => 'take = llevar', p_tipo_error => 'comprension');
select pg_temp.item('en.pag.2', 'es-en', 'en.pagar', 'pagar_tarjeta', 'traduccion', 'escribir',
  '{"enunciado": "Traduce al inglés", "texto": "¿Puedo pagar con tarjeta?", "idioma_respuesta": "en"}',
  'Can I pay by card? «Con tarjeta» se dice by card.',
  p_aceptadas => array['Can I pay by card?', 'Can I pay with a card?', 'Can I pay with card?', 'Can I pay by credit card?'],
  p_pista => 'Can I pay…?', p_tipo_error => 'gramatica',
  p_errores => '[{"respuesta": "I can pay by card?", "tipo": "gramatica", "feedback": "En la pregunta can va primero: Can I pay…?"},
                 {"respuesta": "Can I pay in cash?", "tipo": "vocabulario", "feedback": "in cash es en efectivo; con tarjeta es by card."}]');
select pg_temp.item('en.pag.3', 'es-en', 'en.pagar', 'pagar_tarjeta', 'escuchar_seleccion', 'escuchar',
  '{"enunciado": "Escucha al cliente. ¿Cómo quiere pagar?", "audio_texto": "Can I pay in cash?",
    "opciones": [{"id": "a", "texto": "En efectivo"}, {"id": "b", "texto": "Con tarjeta"}, {"id": "c", "texto": "Mañana"}]}',
  'in cash = en efectivo · by card = con tarjeta.', p_opcion => 'a', p_tipo_error => 'comprension');
select pg_temp.item('en.pag.4', 'es-en', 'en.pagar', 'me_lo_llevo', 'fichas', 'escribir',
  '{"enunciado": "Ordena: «Me lo llevo, gracias.»", "fichas": ["I''ll", "take", "it", "thanks", "make"]}',
  'I''ll take it, thanks.', p_aceptadas => array['I''ll take it thanks'], p_tipo_error => 'orden');
select pg_temp.item('en.pag.5', 'es-en', 'en.pagar', 'pagar_tarjeta', 'hablar', 'hablar',
  '{"enunciado": "Pregunta en voz alta si puedes pagar con tarjeta.", "texto_a_decir": "Can I pay by card?", "traduccion": "¿Puedo pagar con tarjeta?"}',
  'Can I pay by card?', p_aceptadas => array['Can I pay by card?', 'Can I pay with a card?'], p_tipo_error => 'pronunciacion');
select pg_temp.item('en.pag.6', 'es-en', 'en.pagar', 'me_lo_llevo', 'dictado', 'escuchar',
  '{"enunciado": "Escucha y escribe lo que oyes.", "audio_texto": "I''ll take it."}',
  'I''ll take it = me lo llevo. I''ll es la forma corta de I will.',
  p_aceptadas => array['I''ll take it.', 'I will take it.'], p_tipo_error => 'ortografia');
select pg_temp.item('en.pag.7', 'es-en', 'en.pagar', 'pagar_tarjeta', 'traduccion', 'escribir',
  '{"enunciado": "Traduce al inglés", "texto": "¿Puedo pagar en efectivo?", "idioma_respuesta": "en"}',
  'Can I pay in cash? Misma estructura, otra forma de pago.',
  p_aceptadas => array['Can I pay in cash?', 'Can I pay cash?', 'Can I pay with cash?'], p_pista => 'efectivo = cash', p_tipo_error => 'gramatica');
select pg_temp.item('en.pag.8', 'es-en', 'en.pagar', 'me_lo_llevo', 'seleccion', 'leer',
  '{"enunciado": "Lee el diálogo: «—It''s twenty dollars. —Great, I''ll take it.» ¿Qué hace el cliente?",
    "opciones": [{"id": "a", "texto": "Compra la prenda"}, {"id": "b", "texto": "Pide otra talla"}, {"id": "c", "texto": "Se va sin comprar"}]}',
  'I''ll take it confirma la compra.', p_opcion => 'a', p_tipo_error => 'comprension');

-- ---------------------------------------------------------------- Lecciones (orden de presentación)
select pg_temp.en_leccion('es-en.u1.l1', array['en.sal.1', 'en.pre.1', 'en.sal.3', 'en.pre.3', 'en.sal.2', 'en.pre.4', 'en.sal.5', 'en.sal.4']);
select pg_temp.en_leccion('es-en.u1.l2', array['en.tal.1', 'en.tal.3', 'en.pre.2', 'en.tal.4', 'en.tal.2', 'en.tal.5', 'en.tal.6', 'en.pre.7']);
select pg_temp.en_leccion('es-en.u1.l3', array['en.dis.3', 'en.dis.4', 'en.dis.2', 'en.dis.1', 'en.dis.6', 'en.dis.5', 'en.pre.5', 'en.tal.8']);
select pg_temp.en_leccion('es-en.u1.l4', array['en.prc.2', 'en.prc.3', 'en.prc.1', 'en.prc.4', 'en.prc.5', 'en.prc.6', 'en.pre.6', 'en.prc.8']);
select pg_temp.en_leccion('es-en.u1.l5', array['en.pag.1', 'en.pag.3', 'en.pag.2', 'en.pag.4', 'en.pag.6', 'en.pag.5', 'en.pag.8', 'en.sal.7']);
-- Prueba de unidad: sin pistas, sin dictado (el audio TTS expone el texto al cliente)
select pg_temp.en_leccion('es-en.u1.prueba', array['en.sal.8', 'en.tal.9', 'en.dis.8', 'en.dis.9', 'en.prc.7', 'en.pag.7', 'en.tal.7', 'en.dis.10']);
-- Reserva de transferencia (no están en lecciones): en.sal.6, en.dis.7, en.pre.8

insert into idiomas.actividad_habilidades (actividad_id, habilidad_id) values
  ('es-en.u1.l1', 'en.saludo_tienda'), ('es-en.u1.l1', 'en.prendas'),
  ('es-en.u1.l2', 'en.tallas'), ('es-en.u1.l2', 'en.prendas'),
  ('es-en.u1.l3', 'en.disponibilidad'), ('es-en.u1.l4', 'en.precio'), ('es-en.u1.l5', 'en.pagar'),
  ('es-en.u1.prueba', 'en.disponibilidad'), ('es-en.u1.prueba', 'en.precio'), ('es-en.u1.prueba', 'en.pagar'),
  ('es-en.u1.prueba', 'en.tallas'), ('es-en.u1.prueba', 'en.saludo_tienda')
on conflict do nothing;

insert into idiomas.medios (curso_id, tipo, fuente, licencia, autor, transcripcion)
select 'es-en', 'audio', 'tts_dispositivo', 'Voz sintética del sistema operativo del alumno; no se distribuye audio',
       'App de idiomas (texto original)', null
 where not exists (select 1 from idiomas.medios where curso_id = 'es-en' and fuente = 'tts_dispositivo');

reset role;
