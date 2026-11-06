# Las Salas abiertas sobreviven a un reinicio del Coordinador

Hasta ahora un reinicio (un redeploy, una caída) devolvía todas las Salas cerradas, porque sus Invitaciones solo vivían en memoria: una sesión en curso se perdía aunque su audio estuviera a salvo. Decidimos guardar las Invitaciones de cada Sala abierta en `invitations.json`, junto a `room.json`, y cargar abierta toda Sala que estaba abierta y tiene ese fichero. Los enlaces siguen valiendo, y los navegadores, que ya se reconectan solos (CU7), vuelven a la misma Sala.

Una Toma que se estaba grabando **sigue abierta** tras el reinicio. Los navegadores no dejan de grabar mientras el Coordinador no responde: al reconectar reciben la misma Toma y siguen, y tus reanuda las Subidas. El Anfitrión la para como siempre. Así un redeploy corto no se nota en la grabación.

## Considered Options

- **Guardar las Invitaciones en `room.json`**: descartada. `room.json` va dentro de todas las descargas, y los tokens se filtrarían.
- **Parar la Toma en curso al cargar**: descartada. Cortaría Pistas que los navegadores siguen grabando bien, justo lo que el reinicio no debería tocar.
- **Seguir como antes (cerrar al reiniciar)**: descartada. Obliga a crear otra Sala e invitar de nuevo tras cada despliegue.

## Consequences

- `invitations.json` (nombre, rol y token, en orden de Invitación, que fija el Tono de cada uno) se escribe de forma atómica en cada Invitación y **se borra al cerrar la Sala**: los secretos no quedan en disco. Ninguna descarga lo incluye, porque los zips listan sus ficheros uno a uno.
- Las Salas guardadas antes de esta decisión no tienen el fichero y se siguen cargando cerradas.
- Al cargar, cada parte sin terminar retoma su `offset` del tamaño real del fichero, no del `bytes` de `room.json`, que puede ir por detrás. Si no, un cliente que reanuda desde ese offset viejo escribiría bytes dos veces.
- Las copias de seguridad de `/data` incluyen ahora los tokens de las Salas abiertas: cifrarlas (restic ya lo hace) deja de ser opcional.
