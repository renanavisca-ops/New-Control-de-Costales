# Puente · App de idiomas (piloto)

App original de aprendizaje de idiomas. El piloto es **inglés desde español**, con una unidad A1 completa: «De compras: ropa y tallas». También incluye un mini curso de **francés desde español** para comprobar que el motor admite otros pares sin duplicar código.

- Código, esquema, migraciones, roles y almacenamiento propios. No comparte tablas ni funciones con Control de Costales.
- Sin IA de pago ni servicios adicionales. El motor de adaptación es SQL en Postgres y el audio usa la voz del dispositivo.
- Especificación de referencia: `Especificacion_App_Idiomas_Referencia_Duolingo.md` (entregada por la persona responsable).

## Estructura

| Ruta | Contenido |
|---|---|
| `supabase/migrations/` | 6 migraciones **aditivas**: esquemas `idiomas` y `idiomas_api`, el rol `idiomas_propietario`, el motor, la API, las métricas y la cola editorial |
| `supabase/seed/` | Contenido original: curso `es-en` con 6 actividades y 51 ítems, y curso `es-fr` de muestra |
| `supabase/local/` | **Solo para uso local**: simulación mínima de Supabase y códigos de invitación de prueba |
| `src/` | Web en Next.js: bienvenida, registro, catálogo, ruta, lección, práctica, resumen, perfil y consola editorial |
| `src/lib/ia/conversacion.ts` | Interfaz para la conversación con IA, **desactivada** |
| `tests/*.test.mjs` | 18 pruebas de base de datos que se ejecutan con la misma identidad que PostgREST |
| `tests/ui/recorrido.mjs` | Prueba de interfaz de extremo a extremo con Playwright |
| `scripts/db-local.sh` | Levanta Postgres local con las migraciones de **ambas** apps |
| `scripts/supabase-local.mjs` | Servidor solo para desarrollo que imita Auth y las llamadas RPC de PostgREST |

## Modelo de seguridad

- **Esquemas.** `idiomas` guarda los datos y no está expuesto. `idiomas_api` contiene solo funciones RPC, y es lo único que puede llamar el cliente.
- **Rol propietario.** `idiomas_propietario` (NOLOGIN) es dueño de todo lo de idiomas y no tiene ningún privilegio sobre `public`. Las funciones SECURITY DEFINER se ejecutan con ese rol, así que un error en idiomas no puede tocar Control de Costales.
- **Pertenencia propia.** La tabla `idiomas.miembros` registra quién pertenece a la app:
  - Cada función de `idiomas_api` exige pertenencia activa (`exigir_miembro()`), y todas las políticas RLS usan `es_miembro()`.
  - Tener cuenta en Auth no da acceso. Para unirse hace falta un código de invitación, y se rechazan las cuentas anónimas y las técnicas de dispositivos de Costales.
- **Claves de respuesta.** Están en `idiomas.item_claves`, sin GRANT y con RLS sin políticas. El cliente solo ve la solución **después** de responder.
  - Excepción documentada: en los dictados con voz del dispositivo, el navegador necesita el texto para reproducirlo. Por eso la prueba de unidad no incluye dictados.
- **Lecturas directas.** El alumno solo puede leer sus propias filas, y solo si es miembro. Ninguna tabla admite escritura directa.
- **Almacenamiento.** El bucket `idiomas-medios` es privado y admite archivos de hasta 1 MB, solo de audio o imagen. Lo leen los miembros y solo los editores suben archivos.
- **Funciones de servicio.** `servicio_*` solo las puede ejecutar `service_role`, y únicamente desde rutas del servidor:
  - `/api/registro` crea la cuenta de un alumno nuevo.
  - `/api/eliminar-perfil` borra el usuario de Auth **solo** si no pertenece a la otra app.
- **Sesiones separadas.** La cookie de sesión tiene un nombre propio (`sb-idiomas-auth`), distinto del de Control de Costales.

## Aprendizaje por alumno (A)

- **Intentos.** Se registra el primer intento por separado de las correcciones, junto con la pista usada, el tipo de error, la habilidad, la modalidad y la fecha (la hora del dispositivo se acepta dentro de una ventana configurable).
- **Evidencia.** Es solo de añadido: una fila por intento, con unicidad que impide aplicarla dos veces. Las calidades son `independiente`, `con_ayuda`, `correccion`, `fallo`, `fallo_con_ayuda` y `no_evaluable`.
- **Dominio.** Se guarda por inscripción, habilidad y modalidad (escuchar, hablar, leer y escribir por separado).
- **Repaso espaciado** con intervalos configurables de 1, 3, 7, 14 y 30 días:
  - Acierto independiente: avanza un paso, pero solo si el repaso ya tocaba.
  - Acierto con pista: no avanza y el repaso queda a 1 día.
  - Fallo conceptual: reinicia el intervalo y el repaso vuelve en 10 minutos.
  - Lapsus superficial (una errata o una tilde): retrocede un solo paso.
- **Siguiente práctica.** Combina errores recurrentes, fallos recientes, aciertos que solo fueron con ayuda, repasos vencidos, material nuevo y refuerzo, e intercala modalidades. Prefiere **otro enunciado** distinto del último que se falló.
- **Explicación de cada recomendación.** Se guarda en `idiomas.recomendaciones`. Ejemplo: «Repasar preguntas de disponibilidad (escritura) porque fallaste dos ejercicios sin pistas.»
- **Idempotencia.** Las respuestas se deduplican por `evento_id` y el cierre por sesión. Las recompensas son únicas por fuente y la racha suma un solo día. La sincronización sin conexión (`sincronizar`) devuelve un recibo por evento.

## Mejora del contenido (B)

- **Métricas.** `idiomas.metricas_items()` agrupa por ítem y versión: alumnos, acierto al primer intento, uso de pistas, corrección tras error, abandono, reportes y concentración de una misma respuesta fallida.
- **Muestra mínima.** Es configurable (20 alumnos por defecto). Sin esa muestra no se marca nada.
- **Clasificación de cada ítem:**
  - **Difícil:** se aprende tras ver el feedback y los errores son variados.
  - **Confuso:** no se corrige tras el feedback, se abandona o se reporta como confuso.
  - **Posible respuesta válida rechazada:** muchos escriben lo mismo y luego corrigen sin problema, o lo reportan como válido.
- **Cola editorial.** Una persona propone el cambio, un revisor **distinto** lo aprueba y un editor lo publica como nueva versión. Las sesiones que ya estaban abiertas siguen con la versión anterior.
- **Privacidad.** Solo se guardan agregados sin identificadores. No se guarda audio y no se entrena ningún modelo. El texto de un reporte se guarda solo con consentimiento.

## Cómo probar en local

```bash
cd apps/idiomas
npm install
npm test
```

`npm test` recrea Postgres 16 local con las migraciones de Control de Costales y de idiomas, y después corre las 18 pruebas.

Para usar la interfaz contra la base local:

```bash
node scripts/supabase-local.mjs
```

```bash
cp .env.example .env.local   # URL http://localhost:54321, clave pública local y IDIOMAS_SUPABASE_SECRET_KEY=sb_secret_local_solo_desarrollo
npx next build && npx next start -p 3100
```

```bash
node tests/ui/recorrido.mjs
```

## Resultados de la verificación (25/11/2026, local)

| # | Caso | Resultado |
|---|---|---|
| 1 | Dos alumnos con errores distintos reciben repasos distintos | ✅ Ana recibe disponibilidad (escritura) y Beto precios, cada uno con su explicación y otro enunciado |
| 2 | Acierto con pista ≠ acierto sin pista | ✅ Calidades `con_ayuda` e `independiente`; paso −1 frente a 0; al día siguiente, 1 día frente a 3 días; la práctica explica «solo acertaste con ayuda» |
| 3 | Reenviar una sesión offline no duplica | ✅ Lote reenviado dos veces: todos los eventos quedan `duplicado`; XP, evidencia, dominio, progreso y días de estudio idénticos; un cierre con IDs nuevos se rechaza |
| 4 | Cada curso conserva su progreso | ✅ `es-en` y `es-fr` independientes; cambiar el idioma de interfaz no toca los cursos; eliminar francés no afecta a inglés; una sesión tardía no revive el avance |
| 5 | Datos de una app no expuestos a la otra | ✅ Una cuenta de Costales recibe `no_miembro` y 0 filas; un alumno no ve nada de Costales ni puede crear organizaciones; borrar el perfil conserva la cuenta compartida; anon no tiene acceso; bucket privado |
| 6 | Funciona con IA de pago desactivada | ✅ Curso completo, prueba de unidad (no superada y luego superada), hito final y 3 días de mantenimiento con ítems variados; el adaptador de IA no hace llamadas de red |
| B | Métricas y cola editorial | ✅ Respeta la muestra mínima; clasifica difícil, confuso y respuesta válida rechazada; revisión obligatoria; versionado |
| UI | Recorrido completo en el navegador (390 px) | ✅ Registro → catálogo → ruta → lección (pista, error, reintento, voz omitida) → resumen → práctica explicada → interfaz en inglés → borrado de perfil (también en Auth) |

Durante las pruebas se encontraron y corrigieron estos fallos:

- Las funciones internas eran ejecutables por PUBLIC. Se corrigió con privilegios por defecto globales del rol.
- El intervalo podía avanzar varias veces el mismo día.
- Las lecciones intercalaban repasos que todavía no tocaban.
- Un fallo reciente no aparecía en Práctica hasta pasados 10 minutos.

## Límites configurables (`idiomas.config`)

| Límite | Valor por defecto |
|---|---|
| Inscripciones abiertas | sí |
| Código de invitación obligatorio | sí |
| Máximo de miembros | **50** |
| Sesiones por alumno y día | 40 |
| Respuestas por sesión | 80 |
| Reintentos por ítem | 2 |
| Reportes por día | 20 |
| Tamaño por archivo | 1 MB (también fijado en el bucket) |
| Intervalos de repaso | 1, 3, 7, 14 y 30 días |
| Muestra mínima editorial | 20 alumnos |
| `ia_conversacion` / `evaluacion_ia` | desactivadas |

## Consumo y gasto

**Consultado el 25/11/2026:** organización en plan **Pro**, con 3 proyectos activos. Las cuotas son por organización.

| Proyecto | Base de datos | Usuarios en Auth (activos 30 d) | Almacenamiento |
|---|---|---|---|
| control-de-costales | 13 MB | 1 (1) | 0 |
| Asistencia-biometrica | 17 MB | 3 (2) | 0 |
| mobile-chat-mvp | 88 MB | 21 (11) | 2,6 GB |

**Estimación del piloto** (50 alumnos, 1,5 sesiones al día, 90 días ≈ 6 750 sesiones):

| Recurso | Estimación | Cuota del plan |
|---|---|---|
| Base de datos | Unos 20 kB por sesión, medido en local con índices → **≈135 MB** más ~1 MB de contenido | 8 GB por proyecto |
| Almacenamiento | **0** con voz del dispositivo; con audio grabado, ~60 clips × 50 kB ≈ 3 MB | 100 GB |
| Transferencia | ~15 llamadas de ~5 kB por sesión → **≈0,5–1 GB** | 250 GB |
| Auth | ≤50 usuarios activos al mes | 100 000 |
| Funciones Edge | **0** (el registro y el borrado corren en rutas de Next.js) | 2 M |
| IA | **0** (desactivada) | — |

No requiere otro proyecto, add-ons ni servicios de pago.

**Quedó sin verificar**, porque las herramientas no exponen esos datos:

- La transferencia real del mes.
- Las invocaciones de funciones.
- El tamaño de cómputo de cada proyecto.
- Si el *Spend Cap* está activado.
- El plan de Vercel donde se desplegaría la web.

Revisarlo en *Dashboard → Organization → Usage / Billing*.

## Pendiente para producción

1. **Confirmar el proyecto Supabase autorizado.** Hay 3 activos y el repositorio solo identifica `control-de-costales` como proyecto de la app de costales.
2. **Aplicar las migraciones** de `supabase/migrations/` (en orden) y los seeds, y después ejecutar los advisors de seguridad. No se ha aplicado nada en ningún proyecto remoto.
3. **Data API:** añadir `idiomas_api` a *Exposed schemas* (Settings → API).
4. **Auth compartido:**
   - Añadir la URL de la app de idiomas a *Redirect URLs*.
   - Revisar las plantillas de correo: el *Site URL* actual apunta a Control de Costales.
   - Activar la protección contra contraseñas filtradas (hoy está desactivada según los advisors).
5. **Variables en Vercel** para un proyecto nuevo con *Root Directory* `apps/idiomas`: `NEXT_PUBLIC_IDIOMAS_SUPABASE_URL`, `NEXT_PUBLIC_IDIOMAS_SUPABASE_PUBLISHABLE_KEY` e `IDIOMAS_SUPABASE_SECRET_KEY` (esta última solo en el servidor).
6. **Códigos de invitación privados**, creados a mano (ver `supabase/local/10_codigos_prueba.sql`).
7. **Fuera de este piloto:** diagnóstico de colocación, tienda y monedas, ligas y misiones, notificaciones, compras y conversación con IA (su interfaz ya está preparada).
