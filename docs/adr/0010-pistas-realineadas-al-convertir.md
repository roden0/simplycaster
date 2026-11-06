# Las Pistas se realinean al convertir a FLAC: un fichero por Participante y Toma

Una Pista puede perder audio de dos maneras: el navegador deja de capturar unos cientos de milisegundos (en la Sala `pruebalogin`, el Invitado perdió 276 ms mientras el Anfitrión reconectaba), o el Participante reconecta y graba una parte nueva (CU7) tras un hueco de segundos. En los dos casos, lo que viene después queda desplazado respecto al reloj del Coordinador, y la corrección de deriva (ADR-0004) además se desactiva, porque el salto le estropea la recta. Las marcas de deriva ya dicen cuánto audio falta y entre qué dos marcas; las partes, dónde empieza cada una.

Decidimos realinear en la **conversión a FLAC**, igual que la deriva y por la misma razón (ADR-0004): sin tocar la ruta de grabación, y sin estropear nunca la fuente. La entrega pasa a ser **un FLAC por Participante y Toma** (`<sala>_t01_<nombre>.flac`) que empieza en T, dura lo mismo que la Toma y lleva silencio donde faltó audio. Basta con colocar todas las Pistas en el cero del editor.

- **Pérdida**: entre dos marcas seguidas, el audio recibido se queda más de **10 ms** por detrás del tiempo del Coordinador. Por debajo es ruido de medida (±0,4 ms), y la deriva real (decenas de ppm) es despreciable en un intervalo. El silencio se pone en el **punto medio** del intervalo.
- **Marcas cada 2 s** (antes, cada 10 s): el error de dónde cae el silencio queda en ±1 s. Son unos 150 KB por hora y Participante en `room.json`.
- **Deriva por tramos**: la pendiente es común a todos los tramos entre pérdidas, cada uno con su desplazamiento. Así una pérdida ya no desactiva la corrección.
- **Exceso** (más audio del esperado): se anota y no se recorta, porque recortar borraría audio real.
- **Solapes** entre partes, por el error de ±25 ms de cada estimación de reloj: se conserva entera la parte anterior y se recorta el principio de la siguiente.
- `room.json` anota en cada parte sus huecos (`gaps`: posición y duración, en negativo si es un exceso).
- **El Ogg no se toca**: la descarga normal sigue siendo la fuente original, parte a parte.

## Considered Options

- **Rellenar en el navegador mientras se graba**: descartada, por lo mismo que ADR-0004. Es la ruta más delicada, y un error ahí estropea la fuente sin vuelta atrás.
- **Buscar el punto exacto de la pérdida en el propio audio**: frágil con habla y silencios. Las marcas densas bastan.
- **Un FLAC por parte, como antes**: deja al editor colocar cada `_p2` a mano con `startOffsetMs`, y eso casi nadie lo hace bien.

## Consequences

- El FLAC es la entrega alineada en toda su duración, también tras reconexiones y cortes. El Ogg empieza alineado y se separa con la deriva y con cada pérdida.
- La conversión hace una sola pasada de FFmpeg por Participante y Toma: corrige la deriva de cada parte, la corta en trozos y los coloca en su instante con silencio entre ellos.
- Las Salas convertidas antes de esta decisión conservan sus FLAC por parte. Para tener los nuevos, se borra su carpeta `flac/` y se convierten otra vez.
- Las Salas grabadas con marcas cada 10 s también se realinean, pero el silencio cae con un error de ±5 s.
- El desfase fijo de unos 15 ms entre Participantes sigue sin corregirse (ADR-0004).
