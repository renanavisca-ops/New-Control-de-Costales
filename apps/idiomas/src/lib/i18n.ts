// Idioma de INTERFAZ (menús, botones). Es independiente del idioma base y del idioma meta del curso.
// Cadena de respaldo: es-GT → es-419 → es.
type Diccionario = Record<string, string>;

const es: Diccionario = {
  'app.nombre': 'Puente',
  'app.lema': 'Aprende idiomas con práctica que se adapta a ti.',
  'acc.entrar': 'Entrar', 'acc.registro': 'Crear cuenta', 'acc.salir': 'Salir', 'acc.continuar': 'Continuar',
  'acc.comprobar': 'Comprobar', 'acc.pista': 'Ver pista', 'acc.reportar': 'Reportar un problema', 'acc.escuchar': 'Escuchar',
  'acc.lento': 'Más lento', 'acc.hablar': 'Hablar', 'acc.omitir_voz': 'No puedo hablar ahora', 'acc.borrar': 'Borrar',
  'acc.practicar': 'Practicar', 'acc.empezar': 'Empezar', 'acc.repetir': 'Repetir', 'acc.volver': 'Volver a la ruta',
  'inicio.cursos': 'Tus cursos', 'inicio.anadir': 'Añadir un curso', 'inicio.racha': 'Racha', 'inicio.xp': 'XP',
  'ruta.siguiente': 'Siguiente', 'ruta.guia': 'Guía de la unidad', 'ruta.practica': 'Práctica personalizada',
  'ruta.pendientes': 'repasos pendientes', 'ruta.completo': '¡Terminaste el curso piloto!',
  'ruta.mantenimiento': 'Sigue con tu práctica de mantenimiento: combina repasos vencidos, errores recientes y lo que tienes menos dominado.',
  'estado.bloqueada': 'Bloqueada', 'estado.disponible': 'Disponible', 'estado.en_progreso': 'En curso',
  'estado.completada': 'Completada', 'estado.convalidada': 'Convalidada',
  'leccion.correcto': '¡Correcto!', 'leccion.casi': 'Casi', 'leccion.incorrecto': 'No es correcto',
  'leccion.solucion': 'Respuesta correcta', 'leccion.reintento': 'Lo volverás a ver al final.',
  'leccion.pendiente_sync': 'Sin conexión: tu respuesta se guardó y se enviará al reconectar.',
  'resumen.titulo': 'Resumen', 'resumen.aciertos': 'Aciertos al primer intento', 'resumen.pistas': 'Pistas usadas',
  'resumen.errores': 'Para repasar', 'resumen.superada': 'Prueba superada', 'resumen.no_superada': 'Aún no superas la prueba. ¡Repasa e inténtalo de nuevo!',
  'mod.escuchar': 'Escuchar', 'mod.hablar': 'Hablar', 'mod.leer': 'Leer', 'mod.escribir': 'Escribir',
  'perfil.titulo': 'Perfil y ajustes', 'perfil.interfaz': 'Idioma de la interfaz', 'perfil.zona': 'Zona horaria',
  'perfil.consent': 'Permitir guardar mi respuesta cuando reporto un ejercicio',
  'perfil.eliminar_curso': 'Eliminar el avance de este curso', 'perfil.eliminar_perfil': 'Eliminar mi perfil de idiomas',
  'perfil.eliminar_aviso': 'Se borrarán tu cuenta y todos tus cursos, avances, repasos y XP. No se puede deshacer.',
  'ia.desactivada': 'La conversación con IA no está disponible en el piloto.',
};
const esGT: Diccionario = {};
const en: Diccionario = {
  'app.lema': 'Learn languages with practice that adapts to you.',
  'acc.entrar': 'Sign in', 'acc.registro': 'Create account', 'acc.salir': 'Sign out', 'acc.continuar': 'Continue',
  'acc.comprobar': 'Check', 'acc.pista': 'Show hint', 'acc.reportar': 'Report a problem', 'acc.escuchar': 'Listen',
  'acc.lento': 'Slower', 'acc.hablar': 'Speak', 'acc.omitir_voz': "I can't speak now", 'acc.borrar': 'Clear',
  'acc.practicar': 'Practice', 'acc.empezar': 'Start', 'acc.repetir': 'Repeat', 'acc.volver': 'Back to path',
  'inicio.cursos': 'Your courses', 'inicio.anadir': 'Add a course', 'inicio.racha': 'Streak',
  'ruta.siguiente': 'Next', 'ruta.guia': 'Unit guide', 'ruta.practica': 'Personal practice', 'ruta.pendientes': 'reviews due',
  'ruta.completo': 'You finished the pilot course!',
  'leccion.correcto': 'Correct!', 'leccion.casi': 'Almost', 'leccion.incorrecto': 'Not quite', 'leccion.solucion': 'Correct answer',
  'resumen.titulo': 'Summary', 'perfil.titulo': 'Profile and settings', 'perfil.interfaz': 'Interface language',
};
const diccionarios: Record<string, Diccionario> = { es, 'es-419': {}, 'es-GT': esGT, en, 'en-US': {} };

export const IDIOMAS_INTERFAZ = [
  { codigo: 'es-419', nombre: 'Español (Latinoamérica)' },
  { codigo: 'es-GT', nombre: 'Español (Guatemala)' },
  { codigo: 'en-US', nombre: 'English (US)' },
];

export function cadenaRespaldo(locale: string): string[] {
  const partes = locale.split('-');
  const cadena = [locale];
  if (partes[0] === 'es' && locale !== 'es-419' && locale !== 'es') cadena.push('es-419');
  if (partes.length > 1) cadena.push(partes[0]);
  if (!cadena.includes('es')) cadena.push('es');
  return cadena;
}

export function traductor(locale = 'es-419') {
  const cadena = cadenaRespaldo(locale);
  return (clave: string) => {
    for (const l of cadena) {
      const v = diccionarios[l]?.[clave];
      if (v) return v;
    }
    return clave;
  };
}
