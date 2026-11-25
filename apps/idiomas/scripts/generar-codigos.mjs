// Genera códigos de invitación aleatorios y muestra el SQL para crearlos. NO los guarda en disco:
// ejecútalo y pega la salida en el editor SQL del proyecto Puente.
//   node scripts/generar-codigos.mjs [cantidad=2] [usos=1] [rol=alumno]
import { randomBytes } from 'node:crypto';
const [n = '2', usos = '1', rol = 'alumno'] = process.argv.slice(2);
if (!['alumno', 'editor', 'revisor'].includes(rol)) throw new Error('rol no válido');
const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codigo = () => 'PTE-' + [...randomBytes(10)].map((b) => alfabeto[b % alfabeto.length]).join('').replace(/(.{5})(.{5})/, '$1-$2');
const filas = Array.from({ length: Number(n) }, () => `('${codigo()}', ${Number(usos)}, '${rol}', now() + interval '30 days')`);
console.log(`insert into idiomas.codigos_invitacion (codigo, usos_max, rol, vence_at) values\n  ${filas.join(',\n  ')};`);
