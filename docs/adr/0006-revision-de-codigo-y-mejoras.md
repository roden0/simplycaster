# Revisión de código del prototipo 0 y mejoras antes de crecer

Con el prototipo 0 casi cerrado (0a, 0b, CU10 y 0c) revisamos el código entero. Decidimos mejorarlo **por pasos pequeños, cada uno con `make test` en verde**, y solo donde la mejora corrige un fallo real o prepara el siguiente paso de crecimiento ya previsto: más Salas, autenticación con JWT, Safari, más idiomas, estáticos dentro del binario y Salas abiertas que sobrevivan a un reinicio. El criterio sigue siendo el lápiz ruso: un patrón o una abstracción entra solo cuando paga ahora o en el siguiente paso, no "por si acaso". Los acuerdos que salen de aquí están en [docs/acuerdos-de-ingenieria.md](../acuerdos-de-ingenieria.md).

El diagnóstico general es bueno: los módulos de Rust son pequeños y cohesionados (`tus`, `download`, `flac`, `live`, `backoffice`), el orden de cerrojos está documentado y se cumple, los nombres de fichero se construyen en el Coordinador y nunca vienen del cliente, el cliente solo escribe texto con `textContent` (sin `innerHTML`), casi todo el texto visible sale del catálogo y los comentarios explican el porqué con referencias a CU y ADR. Clippy (por defecto) y `tsc --noEmit` pasan limpios. Lo que falla es concreto, y está abajo.

## Mejoras

Esfuerzo: **S** (menos de medio día), **M** (uno o dos días), **L** (más, y con ADR propio).

### Ahora: baratas y protegen de fallos reales

**A1. Una subida puede quedarse bloqueada para siempre (S)**
- Problema: `patch` marca `busy = true` (`coordinator/src/tus.rs:286`), suelta el cerrojo, espera a `append` (`tus.rs:291`) y solo después vuelve a `busy = false` (`tus.rs:299`). Si el futuro del handler se cancela durante esa espera (hyper lo suelta cuando se cae la conexión del cliente, justo el caso que tus quiere cubrir), `busy` se queda a `true`. Cada PATCH siguiente de esa parte responde 409 (`tus.rs:277`); tus-js-client reintenta unos minutos y se rinde, y al recargar la página la reanudación vuelve a recibir 409. La Pista se queda incompleta aunque el navegador tiene el audio. No lo hemos reproducido; se deduce del código.
- Propuesta: un guard con `Drop` que guarda `SharedRoom` y el id de la subida y pone `busy = false` al soltarse, pase lo que pase.
- Por qué importa: es pérdida de audio en el caso que el diseño promete cubrir (ADR-0001, CU7).
- Riesgo y cómo hacerlo seguro: primero un test `#[tokio::test]` que llama a `patch` con un cuerpo que no termina nunca (`futures_util::stream::pending()`), lo cancela con `tokio::time::timeout` y comprueba que el siguiente PATCH no da 409. Ese test tiene que fallar antes del cambio.

**A2. `room.json` no se escribe de forma atómica (S)**
- Problema: `std::fs::write` sobre el propio `room.json` (`coordinator/src/main.rs:396`). Si el proceso muere a mitad de escritura (redeploy, OOM), el fichero queda truncado; al arrancar, `load_rooms` se salta esa Sala (`main.rs:446`) y desaparece del backoffice, aunque sus Pistas siguen en disco.
- Propuesta: escribir `room.json.tmp` y renombrarlo, como ya hace la conversión a FLAC (`coordinator/src/flac.rs:29-30`).
- Por qué importa: `room.json` es lo único duradero de una Sala (ADR-0002, ADR-0004) y será la base para persistir Salas abiertas.
- Riesgo: mínimo. Test: un `room.json.tmp` que sobra en la carpeta no impide cargar la Sala.

**A3. El backoffice queda público si el contenedor arranca sin `BACKOFFICE_TOKEN` (S)**
- Problema: sin la variable, el token es `admin` (`main.rs:697`), y la imagen Docker escucha en `0.0.0.0` (`Dockerfile:22`). Un despliegue al que se le olvide la variable expone `/backoffice/admin` a internet; solo lo avisa un `println` (`main.rs:754`).
- Propuesta: fallar cerrado. Si la dirección de escucha no es de loopback y no hay `BACKOFFICE_TOKEN`, el Coordinador no arranca. En local todo sigue igual.
- Riesgo: una función pura `backoffice_token(env, ip) -> Result<String, String>`, con su test.
- Actualización (2026-11-06): el `docker-compose.yml` publicado ya exige `BACKOFFICE_TOKEN`, pero la imagen sola (Coolify, `docker run`) sigue arrancando sin él. El paso sigue haciendo falta. Hecho después el mismo día con `backoffice_token`: una variable vacía cuenta como ausente.

**A4. Mensajes del WebSocket de hasta 64 MiB, y se registran enteros (S)**
- Problema: el WebSocket usa el límite por defecto de tungstenite (64 MiB). El tamaño de las señales se comprueba después de deserializar (`main.rs:644`), y un mensaje mal formado se escribe entero en el log (`main.rs:598`).
- Propuesta: `ws.max_message_size(...)` con unos pocos `MAX_SIGNAL_BYTES` en `ws_handler` (`main.rs:536`), y registrar solo la longitud o los primeros 200 caracteres.
- Riesgo: mínimo. Una oferta WebRTC ocupa unos pocos KB.

**A5. `make test` no comprueba tipos, formato ni lint (S)**
- Problema: `make test` (`Makefile:21-23`) ejecuta `cargo test` y `node --test`, que quita los tipos sin comprobarlos. `tsc` solo corre en `npm run build`. Además, `cargo fmt --check` falla ya en `main.rs`, `live.rs`, `download.rs`, `flac.rs` y `backoffice.rs`, aunque hay un `rustfmt.toml`. La imagen Docker no regenera `client/src/protocol/` (`Dockerfile:3-8`): si se olvida `make types` antes del commit, se construye con tipos viejos.
- Propuesta: un commit solo con `cargo fmt`. Después, `make check` = `cargo fmt --check` + `cargo clippy --all-targets -- -D warnings` + `npx tsc --noEmit` + `make test` + `git diff --exit-code client/src/protocol`.
- Riesgo: ninguno sobre el comportamiento. El commit de formato va aparte para que el historial siga legible.
- Actualización (2026-11-06): hecho. La CI ejecuta `make check` y construye la imagen Docker en cada pull request, y ambos son obligatorios para fusionar en `main`; así un `make types` olvidado ya no llega a la imagen.

**A6. El cliente envía por un WebSocket que aún no está abierto (S)**
- Problema: `send` apunta al socket nuevo antes de que se abra (`client/src/main.ts:88`). Durante la reconexión (`main.ts:185-186`) lo siguen llamando las Marcas de deriva (`main.ts:258-269`), el estado del micrófono (`main.ts:306`, desde `visibilitychange` y el Worklet) y la señalización del directo (`main.ts:122`). `WebSocket.send` lanza `InvalidStateError` cuando el socket está en `CONNECTING`, así que salen excepciones sin capturar justo durante un corte.
- Propuesta: `send` envía solo si `ws.readyState === WebSocket.OPEN`. No se pierde nada importante: la siguiente Marca de deriva llega a los 10 s, el estado del micrófono se reenvía en `onopen` (`main.ts:103-104`) y el directo vuelve a negociar con el roster.
- Riesgo: mínimo.

**A7. Duplicados y estado redundante en `Room` (S)**
- Problema: el `ParticipantView` inicial se construye dos veces, igual (`main.rs:119-131` y `main.rs:176-189`). `Room.take` (`main.rs:71`) siempre vale `takes.len()` (`main.rs:160`, `main.rs:285-287`), y dos fuentes del mismo dato acaban divergiendo.
- Propuesta: `Participant::new(name, role)` y un método `Room::take_count()` en lugar del campo.
- Riesgo: el compilador encuentra cada uso, y los tests de `Room` existentes lo cubren.

**A8. "Parte" no está en el glosario (S, solo documentación)**
- Problema: la parte de una Pista grabada tras reconectar (CU7) aparece en todo el código (`TrackView.part` en `coordinator/src/protocol.rs:59`, `track_stem` en `main.rs:676-682`, ficheros `_p2`), pero CONTEXT.md no la define.
- Propuesta: añadir **Parte** (en: **Part**) a CONTEXT.md: un trozo continuo de una Pista; la parte 1 empieza en el Tono de sincronía.

### Antes de crecer: necesarias para los siguientes pasos

**B1. Un solo esquema para `room.json` (M), antes de persistir Salas abiertas**
- Problema: el formato se escribe con `serde_json::json!` a mano (`main.rs:353-395`) y se lee con otras structs (`SavedRoom`/`SavedTake` en `main.rs:412-435` y `SavedPart` en `coordinator/src/tus.rs:63-81`). Son dos definiciones del mismo contrato: `durationMs` y `driftPpm` se escriben y no se leen, y nada impide que un campo cambie en un lado y no en el otro.
- Propuesta: structs `#[derive(Serialize, Deserialize)]` en un solo sitio, con `#[serde(default)]` para lo que falta en las Salas de 0a.
- Antes del cambio: tests con dos ficheros de ejemplo, uno de 0a (sin `room`, `created` ni `participants`, la rama de `main.rs:165-175`, que hoy no tiene test) y uno actual: cargar, guardar y comparar campo a campo.
- Al persistir Invitaciones: **no van en `room.json`**, porque `room.json` va dentro de las descargas (`coordinator/src/backoffice.rs:127`, `coordinator/src/download.rs:62-68`) y se filtrarían los tokens. Irían en un fichero aparte, fuera de los zips.

**B2. Partir `main.rs` (809 líneas) por responsabilidad (M)**
- Problema: `main.rs` mezcla reglas de la Sala (`Room`, `main.rs:51-410`), persistencia (`main.rs:350-452`), registro de Salas (`Coordinator`, `main.rs:456-488`), el WebSocket (`main.rs:526-674`), utilidades (`main.rs:490-524`, `676-682`) y el arranque (`main.rs:684-757`). JWT y la persistencia de Salas abiertas tocan justo estas piezas.
- Propuesta: solo mover código, sin cambiar comportamiento, un módulo por commit: `room_file.rs` (lo de B1), `room.rs` (`Room`, `Participant`, `Take`, `valid_name`, `track_stem` y sus tests), `ws.rs` (`ws_handler`, `handle_socket`). `main.rs` se queda con la configuración, `Coordinator` y el router.
- Riesgo: bajo; lo comprueba el compilador. No añadir traits ni capas: es una mudanza.

**B3. Las reglas del WebSocket, dentro de `Room` (M)**
- Problema: `handle_socket` (`main.rs:539-674`, 136 líneas) mezcla transporte y reglas: reconexión que reemplaza la conexión anterior, a qué parte va una Marca de deriva, que solo el Anfitrión graba y para, y la desconexión de una conexión vieja. Ninguna tiene test, porque para probarlas hace falta un socket.
- Propuesta: `Room::connect(name, tx) -> conn_id`, `Room::disconnect(name, conn_id)` y `Room::on_message(name, role, msg)`; `handle_socket` se queda solo con el bucle de lectura y escritura. Así `Room` es un módulo profundo: interfaz pequeña, reglas dentro.
- Antes: tests sobre `Room` con canales `mpsc`. Un Invitado no puede grabar; la Marca de deriva va a la última parte; reconectar avisa con `Replaced`; la desconexión de una conexión vieja no marca desconectado.
- Por qué ahora: con JWT cambia de dónde sale el rol, y conviene que la regla tenga test antes de tocarlo.

**B4. Tests del protocolo tus (M)**
- Problema: los handlers `create`, `head` y `patch` no tienen tests, y ahí están las reglas que protegen las Pistas: el offset (`tus.rs:277`), la longitud (`tus.rs:280-285`), `MAX_TRACK_BYTES` (`tus.rs:176`, `282`), que nadie toque la subida de otro Participante (`tus.rs:238`, `274`) y que una Sala cerrada ya no reciba nada (`tus.rs:153-157`).
- Propuesta: sacar la decisión de `patch` a una función pura, `Upload::check_patch(client_offset, new_length) -> Result<(), StatusCode>`, con tests. Para los handlers, pruebas con `tower::ServiceExt::oneshot`: `tower` ya está en el árbol de dependencias y entra solo como dev-dependency.

**B5. Leer los Ogg con el cerrojo de la Sala tomado (S)**
- Problema: cada `save_metadata` calcula `durationMs` de todas las partes (`main.rs:368`): abre cada Ogg y lee hasta 64 KB de su final (`tus.rs:125-127`, `338-353`). Lo hace con el cerrojo de la Sala tomado y en un hilo de Tokio, en cada parte nueva (`tus.rs:228`), en cada subida completada (`tus.rs:311`) y en cada parada (`main.rs:306`). Con 20 Tomas de 5 Participantes son unos 100 ficheros y unos 6 MB leídos por guardado, mientras los PATCH de esa Sala esperan. Además, `create_room` escribe en disco con el cerrojo del registro (`backoffice.rs:69-84`), que bloquea a todas las Salas.
- Propuesta: calcular la duración una vez, al completarse la parte y al cerrar la Sala, y guardarla en `Upload`. Así `save_metadata` solo serializa unos KB, y escribir eso bajo el cerrojo es aceptable. En `create_room`, crear la carpeta antes de tomar el cerrojo del registro.
- Riesgo: el test de duración sigue valiendo. Hay que añadir uno que compruebe que `durationMs` aparece en `room.json` tras completar una parte.

**B6. Límite de partes por Participante y Toma (S)**
- Problema: `create` acepta POST sin límite para cualquier Toma ya empezada, también si está parada (`tus.rs:196-209`). Cada parte puede ocupar hasta 4 GiB (`main.rs:47`) y reescribe `room.json`. Un cliente con un fallo que reconecta en bucle, o una Invitación filtrada, puede llenar el disco.
- Propuesta: rechazar a partir de un número alto de partes, por ejemplo 50 por Participante y Toma. No limitar a la Toma en curso: un POST que llega justo después de parar es legítimo.

**B7. Descarga de una Pista sin cargarla entera en memoria (S, paga el `shortcut:` de `download.rs:36`)**
- Problema: `tokio::fs::read` carga la Pista entera (`download.rs:36-39`). Una Pista de 1 h ocupa unos 115 MB.
- Propuesta: `tower_http::services::ServeFile`, que ya es dependencia (`main.rs:31`): transmite el fichero por partes y admite `Range`.
- Cuándo: antes de que el Anfitrión descargue Tomas largas durante la Sala.

**B8. Separar en `main.ts` la lógica que se puede probar (M)**
- Problema: `client/src/main.ts` (478 líneas) tiene unas 14 variables de módulo mutables (`main.ts:50-68`, `286-288`, `403`) y mezcla conexión, reloj, Tomas, micrófono, Subidas pendientes y la vista del Anfitrión. Solo `clock.ts` y `calibration.ts` tienen tests.
- Propuesta: sacar a módulos con test (`node --test`, como `clock.ts`) solo las funciones puras con riesgo: la prioridad de los problemas de micrófono (`main.ts:291-302`), el plan de una parte tardía (`main.ts:236-239`) y el registro de Subidas pendientes en `localStorage` (`main.ts:327-345`). El DOM se queda como está.
- No hacer: ni framework, ni store, ni componentes.

**B9. i18n preparada para un segundo idioma (S, cuando llegue)**
- Problema: `t()` solo conoce `en` (`client/src/i18n.ts:2`, `103-105`), y `lang="en"` está fijo en `index.html` y `backoffice.html`. Partes del texto se componen en el código con `·` y `⚠` (`main.ts:200-204`, `backoffice.ts:95`), así que una traducción no puede cambiar el orden. Los errores crudos (`String(e)`) llegan a la interfaz (`main.ts:358`, `main.ts:476`, con textos del Worker como `client/src/encoder-worker.ts:89`). `errorRoomFull` repite el 5 de `MAX_PARTICIPANTS` (`i18n.ts:95`, `main.rs:41`). Las etiquetas de rol y estado se eligen con ternarios en cuatro sitios (`main.ts:116`, `197`, `200`; `backoffice.ts:104-105`).
- Propuesta: catálogos tipados `Record<MessageKey, string>`, para que TypeScript detecte claves que faltan; el idioma se elige con `navigator.language` y se aplica en `document.documentElement.lang`; plantillas en el catálogo para las líneas compuestas (`rosterEntry: "{name} · {role} · {state}"`); el máximo como parámetro; mapas `ROLE_LABEL` y `STATUS_LABEL` como `ERROR_KEY` (`backoffice.ts:11-18`). Los errores crudos se quedan como detalle técnico detrás de un mensaje del catálogo.

**B10. Autenticación con JWT (L, ADR propio, paga el `shortcut:` de `backoffice.rs:3`)**
- Lo que ya está bien: la comprobación es una sola función, `check` (`backoffice.rs:21-27`), y todos los handlers la llaman primero.
- Al hacerlo: convertirla en un extractor de axum, para que ningún handler nuevo pueda olvidarla. Sacar los secretos de las URL, porque hoy acaban en los logs del proxy: el token en la ruta del backoffice, `?invite=` en el WebSocket y las descargas (`main.ts:87`, `main.ts:378`). La comparación de `check` no es de tiempo constante; con JWT desaparece, y no merece arreglo aparte.

**B11. Salas abiertas que sobreviven a un reinicio (L, ADR propio, paga el `shortcut:` de `main.rs:458`)**
- Depende de B1 (esquema único) y de A2 (escritura atómica). Las Invitaciones van en un fichero aparte (ver B1). Hay que decidir qué pasa con una Toma en curso en el momento del reinicio.

**B12. Índice de Invitaciones (S–M, cuando haya muchas Salas)**
- Problema: `by_invite` recorre todas las Salas, también las cerradas, y toma el cerrojo de cada una (`main.rs:471-482`) en cada PATCH (uno cada ~2 s por Participante) y en cada conexión. Además, `load_rooms` mete en memoria todas las Salas pasadas (`main.rs:438-452`). Hoy es despreciable.
- Propuesta, cuando haya cientos de Salas o se mida contención: un `HashMap<token, …>` en `Coordinator`, que se actualiza al invitar y al cerrar.

**B13. Estáticos dentro del binario (M, paga el `shortcut:` de `main.rs:686`)**
- Hoy la ruta por defecto se fija al compilar (`env!("CARGO_MANIFEST_DIR")`, `main.rs:689`). Para Docker no hace falta cambiar nada. Se paga cuando se distribuya el binario suelto, con un ADR que elija el crate (`include_dir` o `rust-embed`).

### Más adelante o no hacer

| Idea | Decisión y motivo |
|---|---|
| Traits, repositorios o inyección de dependencias para el almacenamiento | **No.** Hay una sola implementación (el disco). Una interfaz sin segunda implementación es un bolígrafo de la NASA. |
| Logging estructurado (`tracing`) | **Más adelante**, cuando haya varias Salas a la vez y haga falta filtrar por Sala. Mientras, cada `eprintln!` empieza por el id de la Sala o de la subida. `main.rs:598`, `645` y `658` solo ponen el nombre: añadir la Sala al tocarlos. |
| `parking_lot` o tratar el envenenamiento de los `Mutex` (27 `.lock().unwrap()`) | **No.** Un pánico con un cerrojo tomado es un bug; el acuerdo es no hacer nada que pueda fallar por una entrada externa mientras se tiene el cerrojo. |
| `tokio::sync::Mutex` | **No.** El `Mutex` de `std` es lo correcto porque nunca se mantiene a través de un `await`, y el compilador lo garantiza (los futuros de axum han de ser `Send`). |
| Renombrar `invite` a `invitation` en la red (`X-Invite`, `?invite=`, `localStorage`) | **No.** CONTEXT.md evita "invite token", pero cambiarlo rompe las Subidas pendientes de los navegadores (`main.ts:327`, `main.ts:468`). El código nuevo dice Invitación. |
| Framework o DOM virtual en el cliente | **No.** `el()` + `replaceChildren` + `textContent` basta y es seguro frente a XSS. |
| Canal `mpsc` sin límite por conexión (`main.rs:540`) | **Bien así.** 5 Participantes y mensajes pequeños. |
| `shortcut:` de `/dev/urandom` (`main.rs:500`) | **Más adelante**, solo si Windows importa. `getrandom` ya está en `Cargo.lock` como dependencia transitiva, así que pagarlo es casi gratis. |
| `shortcut:` de reescribir `room.json` entero (`main.rs:351`) | **Bien así**, una vez hechos A2 y B5: son unos KB. |
| DRY menor: `header_f64`/`header_u64` (`tus.rs:159-165`), la lista de ficheros de los tres zips (`backoffice.rs:123-129`, `182-187`; `download.rs:62-68`) | **No.** Repetición pequeña y clara; unirla añade parámetros sin ahorrar nada. |
| `Participant.view` guarda el DTO del protocolo como estado (`main.rs:54`) | **Bien así** mientras el estado y la vista coincidan. |
| `navigator.clipboard` fallido muestra "Copied" igual (`client/src/backoffice.ts:119-120`) | **Menor.** El enlace queda seleccionado y se puede copiar a mano; arreglarlo si se toca ese código. |

## Considered Options

- **Reescritura por capas (hexagonal, puertos y adaptadores)**: descartada. El código es pequeño, se entiende, y cada capa sin segunda implementación es coste sin retorno.
- **No tocar nada hasta el prototipo 1**: descartada. A1 y A2 pueden perder audio o una Sala, y B1–B3 son más baratos antes de JWT y de la persistencia que después.
- **Mejora incremental, ordenada por riesgo y por el siguiente paso de crecimiento**: elegida.

## Consequences

- Los fallos de A1–A6 se corrigen primero y con test, y no cambia ningún comportamiento visible.
- `make check` se convierte en la barrera antes de cada commit; el primer commit es solo de formato.
- `main.rs` queda en configuración y router; `Room` concentra las reglas y se prueba sin red. JWT y la persistencia de Salas abiertas tocarán módulos pequeños y con tests.
- `room.json` tiene un esquema único y tests con ficheros de ejemplo, incluidas las Salas de 0a. Los tokens de Invitación no entran nunca en él.
- Se mantienen el `Mutex` de `std`, `eprintln!`, `Result<_, String>` y el cliente sin framework. Se revisan cuando se cumpla su disparador, no antes.

## Orden sugerido

Cada paso es un commit independiente con `make test` (y, desde el paso 2, `make check`) en verde. Los que tocan grabación o subida se prueban en dev (Coolify despliega cada push a `main`) antes de pasar al siguiente.

1. `cargo fmt`, solo formato.
2. `make check` (A5).
3. A8: "Parte" en CONTEXT.md.
4. A1: el test de cancelación (rojo) y luego el guard.
5. A2: `room.json` atómico.
6. A3: el backoffice falla cerrado.
7. A4: límite de mensaje del WebSocket y log recortado.
8. A6: `send` solo con el socket abierto.
9. A7: `Participant::new` y sin `Room.take`.
10. B1, parte 1: tests con ficheros de ejemplo de `room.json` (0a y actual), sin cambiar código.
11. B1, parte 2: esquema único con serde.
12. B2: mover a `room_file.rs`, después a `room.rs`, después a `ws.rs` (tres commits).
13. B3: `Room::on_message` y sus tests.
14. B4: `Upload::check_patch` y tests de tus.
15. B5: duración en caché y la carpeta fuera del cerrojo del registro.
16. B6: límite de partes.
17. B7: `ServeFile` para una Pista.
18. B8: funciones puras de `main.ts` con tests.
19. Cuando llegue cada paso de crecimiento: B9 (segundo idioma), B10 (JWT), B11 (Salas abiertas persistentes), B12 (muchas Salas), B13 (binario suelto).
