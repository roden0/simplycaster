# AGENTS.md

**SimplyCaster** es un estudio de grabación de audio distribuido, local-first y autoalojado (hasta 5 Participantes por Sala). Cada Participante graba su Pista con calidad en su propio navegador; el Coordinador (servidor) solo coordina las conexiones, da el reloj de referencia y guarda el audio. La edición se hace fuera, en software profesional.

- Vocabulario del dominio: [CONTEXT.md](CONTEXT.md). Es bilingüe: el término en español para conversar y documentar; su equivalente en inglés (`en:`) es el único válido en código, nombres de ficheros e interfaz.
- Decisiones: [docs/adr/](docs/adr/). Alcance actual: `docs/prototipo-0.md` (interno, no versionado).
- Idiomas: la conversación con el equipo es en español; **la aplicación está en inglés**. Ningún texto visible se escribe directamente en el código: todo sale de un catálogo de mensajes por idioma (`en` como base) para poder añadir traducciones más adelante.
- Principio: pragmatismo ("lápiz ruso frente al bolígrafo de la NASA"); la solución más simple que funcione.

## Stack

| Pieza | Tecnología |
|---|---|
| Coordinador (`coordinator/`) | Rust, Axum + Tokio; WebSocket; núcleo del protocolo tus para subidas |
| Cliente (`client/`) | TypeScript + Vite, sin framework; estáticos servidos por el propio binario |
| Tipos compartidos | Generados desde Rust con `ts-rs` |
| Grabación | AudioWorklet → Worker → WebCodecs `AudioEncoder` (Opus) → Mediabunny (Ogg) → OPFS |
| Subida | `tus-js-client`, progresiva y reanudable |
| Datos | Estado en directo en memoria; lo duradero en `room.json` dentro de la carpeta de cada Sala |
| Entrega | Ogg original; FLAC bajo demanda con FFmpeg, solo con la Sala cerrada |
| Textos de la UI | Catálogo de mensajes por idioma (`en` por defecto) y una función de traducción; sin librería hasta que haga falta |
| Tareas | `Makefile` en la raíz |
| Navegadores | Chrome, Firefox y Safari 26+ (requiere HTTPS) |

## Comandos

`make run` (compila y arranca en http://127.0.0.1:3000), `make test`, `make types` (regenera `client/src/protocol/` desde Rust; no editar a mano). Detalle en [CONTRIBUTING.md](CONTRIBUTING.md).
