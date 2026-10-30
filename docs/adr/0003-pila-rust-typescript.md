# Coordinador en Rust, cliente en TypeScript sin framework

El Coordinador se escribe en Rust (Axum + Tokio, con WebSocket y el núcleo del protocolo tus integrados) para entregar un único binario autoalojable con poco consumo. El cliente se escribe en TypeScript con Vite y sin framework, compilado a estáticos que el propio binario sirve, porque casi todo el cliente son APIs del navegador (AudioWorklet, WebCodecs, OPFS, WebRTC) que desde Rust/WASM solo se alcanzan con fricción vía `web-sys`. Los tipos de los mensajes se generan desde Rust con `ts-rs` para no mantenerlos dos veces.

## Considered Options

- TypeScript en ambos lados (Node): un solo lenguaje, pero peor para autoalojar que un binario.
- Cliente en Rust/WASM (Leptos/Dioxus): descartado por la fricción con las APIs de audio del navegador.
- `rustus` como servidor tus aparte: descartado por ser un servicio más que desplegar.
