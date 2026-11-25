-- Mini curso ORIGINAL «Francés desde español» (una unidad corta). Sirve para comprobar que el mismo
-- motor admite otro par de idiomas sin duplicar código y que cada curso conserva su propio avance.
set role idiomas_propietario;

insert into idiomas.cursos (id, idioma_base, idioma_meta, titulo, estado, version_publicada, nivel_max, capacidades)
values ('es-fr', 'es', 'fr', 'Francés para hispanohablantes (muestra)', 'piloto', 1, 'A1',
        '{"escuchar": true, "hablar": true, "leer": true, "escribir": true, "conversacion_ia": false}')
on conflict (id) do update set estado = excluded.estado, version_publicada = excluded.version_publicada;
insert into idiomas.curso_versiones (curso_id, version, estado, publicada_at) values ('es-fr', 1, 'publicada', now()) on conflict do nothing;

insert into idiomas.habilidades (id, idioma_meta, nombre) values
  ('fr.saludos', 'fr', '{"es": "saludar en francés"}'),
  ('fr.cafe', 'fr', '{"es": "pedir algo en un café"}')
on conflict (id) do update set nombre = excluded.nombre;

insert into idiomas.unidades (id, curso_id, version, orden, titulo, objetivo, cefr, guia) values
  ('es-fr.u1', 'es-fr', 1, 1, 'En el café', 'Saludar y pedir una bebida.', 'A1',
   '[{"frase": "Bonjour !", "significado": "¡Buenos días! / ¡Hola!"}, {"frase": "Un café, s''il vous plaît.", "significado": "Un café, por favor."}]')
on conflict (id) do update set titulo = excluded.titulo;
insert into idiomas.actividades (id, unidad_id, orden, tipo, titulo, obligatoria, permite_pistas) values
  ('es-fr.u1.l1', 'es-fr.u1', 1, 'leccion', 'Bonjour', true, true),
  ('es-fr.u1.l2', 'es-fr.u1', 2, 'leccion', 'Un café, por favor', true, true)
on conflict (id) do nothing;

create or replace function pg_temp.item(p_id text, p_hab text, p_concepto text, p_tipo text, p_modalidad text,
  p_contenido jsonb, p_explicacion text, p_aceptadas text[] default '{}', p_opcion text default null, p_pista text default null)
returns void language plpgsql as $$
begin
  insert into idiomas.items (id, curso_id, habilidad_id, concepto) values (p_id, 'es-fr', p_hab, p_concepto) on conflict (id) do nothing;
  insert into idiomas.item_versiones (item_id, version, tipo, modalidad, contenido, pista, explicacion, tipo_error_por_defecto)
  values (p_id, 1, p_tipo, p_modalidad, p_contenido, p_pista, p_explicacion, 'vocabulario') on conflict do nothing;
  insert into idiomas.item_claves (item_id, version, aceptadas, opcion_correcta)
  values (p_id, 1, p_aceptadas, p_opcion) on conflict do nothing;
end $$;

select pg_temp.item('fr.sal.1', 'fr.saludos', 'bonjour', 'seleccion', 'leer',
  '{"enunciado": "¿Qué significa «Bonjour»?", "opciones": [{"id": "a", "texto": "Buenos días"}, {"id": "b", "texto": "Gracias"}, {"id": "c", "texto": "Adiós"}]}',
  'Bonjour se usa para saludar durante el día.', p_opcion => 'a');
select pg_temp.item('fr.sal.2', 'fr.saludos', 'merci', 'traduccion', 'escribir',
  '{"enunciado": "Escribe en francés", "texto": "Gracias", "idioma_respuesta": "fr"}', 'Merci = gracias.', array['Merci', 'Merci !']);
select pg_temp.item('fr.sal.3', 'fr.saludos', 'bonjour', 'escuchar_seleccion', 'escuchar',
  '{"enunciado": "Escucha y elige.", "audio_texto": "Bonjour, madame !", "opciones": [{"id": "a", "texto": "Buenos días, señora"}, {"id": "b", "texto": "Buenas noches"}]}',
  'Madame = señora.', p_opcion => 'a');
select pg_temp.item('fr.caf.1', 'fr.cafe', 'pedir', 'traduccion', 'escribir',
  '{"enunciado": "Escribe en francés", "texto": "Un café, por favor.", "idioma_respuesta": "fr"}',
  'S''il vous plaît = por favor (formal).', array['Un café, s''il vous plaît.', 'Un café s''il vous plait'], p_pista => 'por favor = s''il vous plaît');
select pg_temp.item('fr.caf.2', 'fr.cafe', 'pedir', 'seleccion', 'leer',
  '{"enunciado": "¿Cómo pides un té?", "opciones": [{"id": "a", "texto": "Un thé, s''il vous plaît."}, {"id": "b", "texto": "Merci, au revoir."}]}',
  'Un thé = un té.', p_opcion => 'a');
select pg_temp.item('fr.caf.3', 'fr.cafe', 'pedir', 'escuchar_seleccion', 'escuchar',
  '{"enunciado": "Escucha. ¿Qué pide?", "audio_texto": "Un croissant, s''il vous plaît.", "opciones": [{"id": "a", "texto": "Un cruasán"}, {"id": "b", "texto": "Un café"}]}',
  'Un croissant = un cruasán.', p_opcion => 'a');

insert into idiomas.actividad_items (actividad_id, item_id, orden) values
  ('es-fr.u1.l1', 'fr.sal.1', 1), ('es-fr.u1.l1', 'fr.sal.3', 2), ('es-fr.u1.l1', 'fr.sal.2', 3),
  ('es-fr.u1.l2', 'fr.caf.2', 1), ('es-fr.u1.l2', 'fr.caf.3', 2), ('es-fr.u1.l2', 'fr.caf.1', 3)
on conflict do nothing;
reset role;
