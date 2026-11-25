-- SOLO LOCAL. Códigos de invitación de prueba. En producción se crean a mano con valores privados
-- (nunca se versionan), por ejemplo:
--   insert into idiomas.codigos_invitacion (codigo, usos_max, rol) values ('<código-secreto>', 30, 'alumno');
set role idiomas_propietario;
insert into idiomas.codigos_invitacion (codigo, usos_max, rol) values
  ('PILOTO-LOCAL', 500, 'alumno'),
  ('EDITOR-LOCAL', 5, 'editor'),
  ('REVISOR-LOCAL', 5, 'revisor')
on conflict (codigo) do nothing;
reset role;
