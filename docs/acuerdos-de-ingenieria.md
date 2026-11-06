# Acuerdos de ingeniería

Cómo trabajamos en SimplyCaster. Salen de lo que el código ya hace bien y de la revisión del [ADR-0006](adr/0006-revision-de-codigo-y-mejoras.md). Cada acuerdo es corto; **[pendiente: X]** marca los que el código aún no cumple y enlaza al punto del ADR-0006 que lo resuelve.

## Principio

- La solución más simple que funcione (el lápiz ruso). Una abstracción, una opción o una dependencia entra solo cuando paga ahora o en el siguiente paso de crecimiento ya previsto.
- Una interfaz o un trait necesita una segunda implementación real. *Por qué*: sin ella es coste sin retorno.

## Idiomas y vocabulario

- La conversación, la documentación interna y los ADR van en español. Los documentos públicos (README, CONTRIBUTING, SECURITY), en inglés. El código, los nombres de fichero, la interfaz y los mensajes de commit, en inglés.
- Los términos del dominio salen de [CONTEXT.md](../CONTEXT.md): en español al hablar, su `en:` en el código. Nunca los de _Avoid_. Un término nuevo se añade primero al glosario.
- Los nombres que ya viajan por la red o están guardados en los navegadores (`X-Invite`, `?invite=`) no se renombran; el código nuevo usa el término del glosario. *Por qué*: renombrarlos rompe las Subidas pendientes.

## Textos visibles (i18n)

- Ningún texto visible en el código: todo pasa por `t()` y el catálogo (`en` es la base).
- El Coordinador no envía texto para el usuario, sino códigos (`BackofficeError`, `MicProblem`) que el cliente traduce. Así ya se hace hoy.
- Las líneas compuestas son plantillas del catálogo, no concatenaciones con separadores en el código. *Por qué*: otro idioma puede necesitar otro orden. **[pendiente: B9]**
- Los números del dominio (máximo de Participantes) entran como parámetro, no escritos a mano en el texto. **[pendiente: B9]**

## Estructura de módulos

- **Rust**: un módulo por responsabilidad. `main.rs` solo tiene la configuración, el registro de Salas (`Coordinator`) y el router. Las reglas de la Sala viven en `Room` y se prueban sin red. Los handlers HTTP y WebSocket traducen la petición y llaman a `Room`. **[pendiente: B2, B3]**
- **TypeScript**: un módulo por pieza del navegador (`recorder`, `live`, `clock`…). La lógica pura va en su propio módulo, con test. El DOM se construye con `el()` + `replaceChildren` + `textContent`, sin framework. **[pendiente: B8]** para las funciones puras de `main.ts`.
- Nunca `innerHTML` con datos. *Por qué*: nombres e ids vienen de fuera.
- `client/src/protocol/` lo genera `ts-rs` (`make types`): no se edita a mano y se incluye en el mismo commit que el cambio de Rust.

## Errores y logs

- Rust: `Result<_, String>` basta mientras nadie necesite distinguir errores. `unwrap`/`expect` solo para invariantes (cerrojos, datos que el propio Coordinador construyó) o al arrancar.
- Un error de E/S o de entrada externa nunca hace pánico en un handler. Se registra y se responde con un código de estado.
- Logs con `eprintln!`, que empiezan por el id de la Sala o de la subida, y nunca con el contenido entero de un mensaje externo (como mucho su longitud o un prefijo). **[pendiente: A4]** y los logs de `main.rs:598`, `645` y `658`.
- TypeScript: un `catch` vacío lleva un comentario con el porqué (como `keepAwake`), o registra con `console.warn`.
- Un fallo que el usuario debe conocer se muestra con un mensaje del catálogo, no con `String(e)` a secas. **[pendiente: B9]**

## Concurrencia

- Orden de cerrojos: primero el registro de Salas y después la Sala; nunca el registro con una Sala tomada.
- `std::sync::Mutex`, que nunca se mantiene a través de un `await`; el compilador lo garantiza en los handlers de axum.
- Con un cerrojo tomado: nada de E/S que crezca con la Sala (leer audio, recorrer ficheros) ni operaciones que puedan hacer pánico por una entrada externa. Escribir un JSON de unos KB se acepta. **[pendiente: B5]**
- Un estado de "en curso" (`busy`, `Converting`) se libera con un guard o en una tarea que no se pueda cancelar, nunca solo en la línea siguiente a un `await`. *Por qué*: axum cancela el handler si el cliente se desconecta.
- Para trabajo bloqueante largo (zips, FFmpeg): `spawn_blocking` o un proceso aparte, como ya se hace.

## Persistencia

- `room.json` es lo único duradero de una Sala: se escribe a un `.tmp` y se renombra.
- Su formato se define una sola vez, con structs serde que sirven para leer y para escribir, y con tests que usan ficheros de ejemplo de cada versión. Las Salas antiguas (0a) se siguen cargando. **[pendiente: B1]**
- Los secretos (tokens de Invitación) nunca van en `room.json` ni en ningún fichero que acabe en una descarga.

## Seguridad en los límites de confianza

- Los nombres de fichero se construyen en el Coordinador a partir de nombres validados (`valid_name`); nunca se toma una ruta del cliente. Solo se sirven ficheros listados en la Sala. Así es hoy.
- Toda entrada externa tiene un límite de tamaño: la Pista (`MAX_TRACK_BYTES`), la señal, el mensaje del WebSocket y el número de partes. **[pendiente: A4, B6]**
- Secretos de 128 bits aleatorios. Sin `BACKOFFICE_TOKEN`, el Coordinador solo arranca en loopback (falla cerrado). **[pendiente: A3]**
- Cada handler del backoffice comprueba el secreto antes de nada. Con JWT, la comprobación pasa a un extractor y los secretos salen de las URL. **[pendiente: B10]**
- Las herramientas externas (FFmpeg) se lanzan con argumentos, nunca a través de una shell.

## `shortcut:`

- Todo atajo con un límite conocido lleva `// shortcut: <el límite>, <cuándo pagarlo>`.
- Al empezar un paso de crecimiento se revisan los `shortcut:` que menciona su disparador (`grep -rn "shortcut:"`). Pagar uno es un commit propio. Si el atajo es una decisión difícil de revertir, lleva ADR.

## Tests

- Debe tener test toda lógica que pueda perder audio o desalinear: sincronía y deriva, reglas de la Sala (Invitaciones, Tomas, cierre, reconexión), reglas tus (offset, longitud, límites, permisos), carga y guardado de `room.json`, validación de nombres y rutas. **[pendiente: B1, B3, B4]**
- Para corregir un fallo, primero un test que falla.
- Tests sin red ni navegador: funciones puras o `Room` con canales. En el cliente, `node --test` sobre módulos puros.
- Lo que solo se puede probar en un navegador (Worklet, WebCodecs, OPFS, WebRTC) se prueba en dev con un User path (UP1–UP4) y `make measure`.

## Antes de cada commit

- Commits pequeños y que se entiendan solos, en inglés.
- `make check` en verde: formato, clippy `-D warnings`, `tsc --noEmit`, tests y `client/src/protocol/` sin diferencias. La CI lo exige en cada pull request, junto con que la imagen Docker compile.
- Un cambio que toque grabación, subida, sincronía o directo se prueba en dev (Coolify, que despliega cada push a `main`) antes de darlo por bueno y de empezar el siguiente paso. *Por qué*: el Worklet, WebCodecs, OPFS y WebRTC no se prueban sin navegador ni dispositivos reales.
- Un commit que solo da formato o mueve código no cambia comportamiento, y va aparte.

## ADR

- Un ADR solo para decisiones difíciles de revertir, sorprendentes sin contexto y fruto de una disyuntiva real.
- Estilo: título; uno o dos párrafos con la decisión y sus razones; `## Considered Options` y/o `## Consequences`. En español y numerado.
- Para revertir uno se escribe otro (o se actualiza el existente) en el mismo cambio. Los ADR vigentes no se reabren sin una razón nueva.

## Dependencias

- Una dependencia nueva solo si ahorra mucho más código del que trae y no está ya en el árbol. Antes de añadir, mirar `Cargo.lock` y `package-lock.json` (`tower`, `getrandom` y `tracing` ya vienen de forma transitiva).
- Versiones fijadas en los lockfiles, y builds con `--locked` / `npm ci`.
- Las dependencias que definen la arquitectura (TURN, tus, Mediabunny) se nombran en un ADR, con su alternativa si se abandonan.
