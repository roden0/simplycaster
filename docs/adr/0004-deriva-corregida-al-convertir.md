# La deriva se corrige al convertir a FLAC, no al grabar

El reloj de audio de cada dispositivo avanza a un ritmo ligeramente distinto del real: en UP2, dos Pistas de una Toma de 36 minutos se separaron unos 54 ms (unos 30 ppm), lo bastante para oírse como eco cuando una voz se cuela en el micrófono del otro. Para medirla, cada navegador manda cada 10 s una marca de deriva: cuántas muestras lleva grabadas en ese instante del reloj del Coordinador. La pendiente de esas marcas coincidió con la deriva medida en el propio audio. La cifra cambia de una prueba a otra (58,7, 40 y 30 ppm en el mismo portátil), así que no sirve un valor fijo por dispositivo.

Decidimos corregirla en la conversión de entrega del ADR-0001: al convertir a FLAC, el Coordinador remuestrea cada Pista según la pendiente de sus propias marcas de deriva, de modo que una hora de Pista dure una hora del reloj del Coordinador. El Ogg original se entrega tal como se grabó. Se descartó corregir en el navegador mientras se graba, porque complica la ruta más delicada y cualquier error ahí estropea la fuente sin vuelta atrás. También se descartó dejar la corrección al editor, porque exige un estiramiento manual por Pista que casi nadie sabe hacer.

## Consequences

- El FLAC, y no el Ogg, es la entrega alineada en toda su duración; el Ogg empieza alineado y se va separando a lo largo de la Toma.
- Las marcas de deriva pasan a ser parte necesaria de `room.json`: una Pista sin marcas suficientes se convierte sin corregir.
- El desfase fijo entre Pistas no se corrige. La sincronización de reloj por la red no puede medir si la ida y la vuelta tardan lo mismo, y queda un error de unos 15 ms (Wi-Fi o 4G, con un ida y vuelta de 47–74 ms). Lo aceptamos: con Participantes en lugares distintos y con auriculares, 15 ms entre voces no se notan.
- Sin calibrar la latencia, ese desfase sube a unos 100 ms. Calibrar forma parte del uso normal, como los auriculares; no se obliga por ahora.
