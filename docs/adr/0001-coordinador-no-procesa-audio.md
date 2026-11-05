# El Coordinador no procesa audio durante la grabación

Cada Participante graba su propia Pista en su navegador (Opus a máxima calidad: AudioWorklet → Worker con WebCodecs `AudioEncoder`, contenedor Ogg) y la sube progresivamente al Coordinador, que durante la Sala solo la almacena. Elegimos esto frente a grabar o mezclar en el servidor porque la calidad de la fuente no depende de la red, el servidor autoalojado puede ser modesto y la subida progresiva limita la pérdida si alguien cierra la pestaña. SimplyCaster entrega fuentes de calidad para editar en software externo; no es un editor.

La única excepción es la **conversión de entrega**: con la Sala ya cerrada, el Coordinador puede convertir las Pistas a FLAC con FFmpeg bajo demanda; la descarga por defecto es el Ogg original sin procesar. Se hace así porque Opus no lo importan con fiabilidad editores profesionales como Adobe Audition, y FLAC no añade pérdida sobre la fuente. Se descartó convertir en el navegador del Anfitrión (más frágil) y convertir a MP3 (recomprimir con pérdida).

## Consequences

- El inicio de las Pistas se alinea al editar mediante el Tono de sincronía, que cada navegador inserta en el mismo instante según el reloj del Coordinador. El Coordinador no mezcla; solo corrige la deriva al convertir a FLAC (ADR-0004).
- La copia local se conserva hasta que el Coordinador confirma cada fragmento; lo no subido al cerrar la Sala se pierde y la Pista queda marcada como incompleta.
- La instancia autoalojada necesita FFmpeg disponible (incluido en la imagen Docker).
