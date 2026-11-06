# El cliente va dentro del binario del Coordinador

El Coordinador servía el cliente (`client/dist`) desde una carpeta del disco, cuya ruta por defecto se fijaba al compilar (`CARGO_MANIFEST_DIR`). Fuera de Docker eso obligaba a llevar la carpeta junto al binario y en la ruta correcta. Decidimos meterlo dentro con **`rust-embed`**: un build release incrusta `client/dist` y el binario es la aplicación entera; un build de depuración lo lee del disco en cada petición, así que basta con reconstruir el cliente para ver un cambio.

## Considered Options

- **`include_dir`**: incrusta siempre, también en depuración, así que cada cambio del cliente obliga a recompilar el Coordinador. No adivina el tipo de los ficheros.
- **Dejarlo en el disco (`ServeDir`)**: suficiente con Docker, pero un binario suelto no funciona sin su carpeta.
- **`rust-embed`**: elegida. Lee del disco en depuración, guarda el tipo de cada fichero (`mime-guess`) y admite `allow_missing`.

## Consequences

- El orden de compilación cambia: en release, el cliente se construye antes que el Coordinador. `make build` ya lo hace así, y el `Dockerfile` copia `client/dist` a la etapa de Rust antes de `cargo build`.
- `allow_missing`: `make types` compila el Coordinador antes de que exista el cliente. Si se olvida construirlo, la página responde "client not built" en vez de fallar al compilar.
- Desaparece `CLIENT_DIST`. Los ficheros no admiten `Range` ni ETag; la capa `Cache-Control: no-cache` sigue obligando a revalidar.
- Si se abandona `rust-embed`, la alternativa es volver a `ServeDir` con la ruta en una variable de entorno.
