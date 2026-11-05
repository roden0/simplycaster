# Conversación en directo por WebRTC, con un TURN dentro del Coordinador

Para que los Participantes se oigan mientras graban (iteración 0c), cada navegador envía su micrófono a los demás por WebRTC, en una malla: con 5 Participantes son 4 conexiones por persona y unos 200 kbps solo de audio, lo que la malla aguanta sin servidor de medios. El Coordinador hace de señalización por el WebSocket de la Sala que ya existe. El navegador se ocupa del jitter, de las pérdidas y de la latencia baja por UDP. El directo es un flujo aparte de la Pista: no se graba, y la Pista se sigue grabando y subiendo como hasta ahora.

Entre el 10 % y el 25 % de las conexiones no logran conectarse de forma directa (4G con CGNAT, redes corporativas) y necesitan un TURN que reenvíe sus paquetes. Decidimos integrarlo en el binario del Coordinador con el crate `turn` de webrtc-rs, para que autoalojar siga siendo un único binario sin servicios externos. El mismo servidor responde a STUN, así que tampoco dependemos de un STUN público. Las credenciales de TURN son temporales, firmadas con un secreto del Coordinador, y solo se entregan a quien entra con una Invitación válida.

## Considered Options

- **TURN externo** (Cloudflare TURN, gratis hasta 1000 GB al mes, o coturn): menos código, pero añade una cuenta o un servicio que quien se autoaloje tendría que montar.
- **Audio por el WebSocket**, reenviado por el Coordinador: funciona en cualquier red sin puertos nuevos, pero va por TCP, con picos de latencia cuando se pierden paquetes, obliga a programar el búfer de jitter y la reproducción, y Chrome no cancela el eco del audio reproducido con Web Audio.
- **Servidor de medios (SFU)** en el Coordinador: innecesario para 5 Participantes solo con audio.

## Consequences

- El servidor necesita abiertos un puerto UDP para TURN (3478) y un rango UDP para los relays, además de HTTPS. En Coolify van como mapeo de puertos del contenedor, al margen del proxy, y el Coordinador necesita conocer su IP pública. El rango limita cuántas conexiones con relay caben a la vez (unas 20 por Sala llena).
- Sin UDP no hay directo: en una red que solo deje salir HTTPS, el Participante graba su Pista igual, pero no oye a los demás. TURN sobre TCP o TLS en el 443 no es posible mientras el proxy ocupe ese puerto.
- El directo usa la misma captura del micrófono que la Pista, sin procesado y sin cancelación de eco, para no abrir dos capturas del mismo micrófono (fallos conocidos en WebKit). Por eso **los auriculares son necesarios**: sin ellos, cada uno oye su propio eco y las voces de los demás se cuelan en su Pista.
- El TURN reenvía paquetes cifrados sin descifrarlos ni procesar el audio, así que se mantiene el ADR-0001.
- El crate `turn` está en la rama 0.17 de webrtc-rs, que sigue publicándose aunque el proyecto ha pasado a una arquitectura nueva (sans-IO). Si se abandonara, `turn-server-proto` es la alternativa.
