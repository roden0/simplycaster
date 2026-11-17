# El Gestor de feeds publica podcasts, aparte del Coordinador

Hasta ahora SimplyCaster termina al entregar las Pistas: la edición se hace fuera (ADR-0001) y el episodio terminado se publica en otro sitio. Decidimos que la instancia también **publique Podcasts**: un Anfitrión sube el mp3 ya editado de cada Episodio y el servidor sirve el feed (RSS 2.0 con `itunes` y `podcast`, y JSON Feed 1.1), una página por Episodio y el audio. Lo hace el **Gestor de feeds**, en el mismo binario que el Coordinador pero sin compartir responsabilidades con él: Publicación y Estudio son mundos aparte, y nada enlaza un Episodio con una Sala o una Toma. El Coordinador sigue sin servir nada público y ADR-0001 no cambia.

- **Permisos:** cualquier Cuenta crea y edita cualquier Podcast (sus datos, Episodios y Claves de suscripción): un Podcast es del equipo, no de una persona. Borrar un Podcast entero solo puede su Creador o un Administrador.
- **Ficheros estáticos:** `feed.xml`, `feed.json`, la página del Podcast y la de cada Episodio (JSON-LD `PodcastSeries` / `PodcastEpisode`, `og:type`, `og:audio`, `og:image`) se generan como ficheros al guardar o borrar algo, y además a mano con un botón que muestra la fecha de la última generación (p. ej. cuando llega la fecha de un Episodio programado). Se sirven con ETag, Last-Modified y un `max-age` corto, fuera del `no-cache` del resto.
- **Feeds privados:** un Podcast puede ser privado. Entonces el feed, las páginas y cada fichero exigen una **Clave de suscripción** como segmento de la ruta (`/podcasts/<podcast>/k/<clave>/feed.xml`), y sin ella responden 404. En la ruta y no en `?key=`: así todas las direcciones del feed y de las páginas salen de una misma base, y el marcador queda en un solo sitio. Hay una clave por suscriptor (de pago o una aplicación), con nombre y revocable una a una. Los ficheros estáticos llevan un marcador donde va la clave, que se sustituye al servir, así que el feed sigue siendo uno por Podcast. El feed lleva `<podcast:locked>yes</podcast:locked>` e `<itunes:block>Yes</itunes:block>`. Se guarda solo el hash de la clave, con prefijo de algoritmo (`sha256:…`) para poder cambiarlo sin invalidarlas, y se enseña una sola vez. Hay límite de ritmo por IP sobre las respuestas 404 (30 en 10 minutos, después 429); detrás de un proxy en la misma máquina o red, la IP es la última de `X-Forwarded-For`. El backoffice muestra el último uso de cada clave y cuántas IPs distintas la usaron en 24 h, sin bloqueo automático; ese uso vive en memoria y se pierde al reiniciar. En un Podcast público la clave se ignora y las claves se conservan.
- **Identidad estable:** la etiqueta del Podcast y la de cada Episodio se fijan al crearlos y no cambian con el nombre (a-z, 0-9 y guiones, 40 caracteres como máximo; `-2` si se repite; `feed` y `cover` reservadas). Cada Episodio tiene un `guid` UUID propio; reemplazar su mp3 lo conserva.
- **URLs públicas:** `/podcasts/:slug`, `/podcasts/:slug/feed.xml`, `/podcasts/:slug/feed.json`, `/podcasts/:slug/cover.jpg|png` y `/podcasts/:slug/:episode` (página) con `.mp3`, `.jpg|png` y `.vtt|srt` a su lado.
- **Datos del Podcast:** título, descripción, portada, idioma, categoría de Apple, explícito, autor, tipo (`episodic` o `serial`), copyright, email del propietario (`itunes:owner`, público en el feed, nunca el de la Cuenta) y `podcast:guid` (UUIDv5 de la URL del feed).
- **Datos del Episodio:** título, notas (HTML básico en CDATA), fecha de publicación (vacía, borrador; futura, programado), duración, explícito (hereda el del Podcast y se puede cambiar), tipo (`full`, `trailer`, `bonus`), temporada, número, imagen opcional y transcripción opcional (VTT o SRT).
- **Subidas:** POST normal escrito en disco a medida que llega: mp3 (`audio/mpeg`) hasta unos 500 MB, imágenes JPEG o PNG hasta unos 10 MB. El navegador lee la duración del audio y comprueba que la imagen sea cuadrada y de 1400 a 3000 px; el servidor no procesa audio ni imágenes.
- **Requisito:** sin `PUBLIC_URL` la sección de Podcasts no aparece, porque feeds y páginas necesitan URLs absolutas.

## Considered Options

- **Feed generado en cada petición**: siempre al día, sin botón ni marcador, pero preferimos ficheros estáticos para la caché y para ver cuándo se publicó cada cambio.
- **Un fichero de feed por clave**: sin sustitución al servir, pero N ficheros que regenerar al crear o revocar cada clave.
- **HTTP Basic para los feeds privados**: estándar, pero no todas las aplicaciones de podcasts lo soportan bien; el token en la URL es lo habitual en los servicios de pago.
- **Claves guardadas en claro**: permitirían volver a copiar la URL, pero `podcasts` pasaría a guardar secretos que dan acceso.
- **Bloquear una clave usada desde muchas IPs**: aplicaciones como Overcast descargan desde sus servidores, así que daría falsos positivos.
- **Un servicio aparte para publicar**: aísla el tráfico público de la grabación, pero obliga a compartir Cuentas y sesión entre dos procesos y a desplegar y copiar dos piezas.
- **Subida reanudable con tus**: el tus actual está atado a las Tomas, y un mp3 de una hora (unos 60 MB) se puede volver a subir si falla.
- **410 Gone al borrar**: indica a los agregadores que dejen de consultar, pero obliga a recordar las etiquetas borradas.

## Consequences

- La instancia sirve tráfico público y sin sesión por primera vez (salvo `/i/:token`): el disco y el ancho de banda del servidor pasan a depender de la audiencia, no solo de las Salas.
- Los mp3 viven en `DATA_DIR` y entran en las copias de `/data`, que crecerán en consecuencia.
- Los cambios no se ven en el feed hasta la siguiente generación; un Episodio programado aparece cuando se regenera después de su fecha, no en su hora exacta.
- La clave en la URL acaba en los registros de los proxies y en las aplicaciones de quien la recibe; revocarla es la única defensa si se filtra.
- El email del propietario del Podcast es público en el feed.
- Las páginas públicas usan los textos del catálogo `en`; traducirlas según el idioma del Podcast queda para más adelante.
- El README tiene que explicar en detalle cómo usar la Publicación: crear un Podcast, subir Episodios, hacerlo privado y repartir Claves de suscripción, y dar la URL del feed a Apple Podcasts u otras aplicaciones.
