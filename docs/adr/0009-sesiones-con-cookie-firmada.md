# Sesiones con cookie firmada en vez de secretos en las URL

El token del backoffice iba en la ruta (`/backoffice/<token>`) y el de cada Invitación en la consulta del WebSocket y de las descargas (`?invite=`). Las URL acaban en los logs del proxy y en el historial del navegador. Decidimos **cambiar cada secreto por una cookie de sesión** la primera vez que se usa:

- **Backoffice:** `/backoffice` pide `BACKOFFICE_TOKEN` en un formulario. El token viaja una vez, en el cuerpo, y se compara en tiempo constante. La respuesta deja una cookie `sc_admin` válida 12 h, y un extractor de axum (`Admin`) la exige en cada ruta del API: un handler nuevo no puede olvidar la comprobación.
- **Participantes:** el enlace de Invitación (`/i/<token>`) sigue siendo la invitación, como un enlace mágico. Al cargar, la página lo cambia por una cookie `sc_<sala>.<nombre>` válida 7 días, y el WebSocket y las descargas solo llevan `?room=&name=`, que no son secretos. Hay una cookie por Sala y Participante, para que dos Invitaciones abiertas en el mismo navegador no se pisen.

Cada cookie lleva un JWT HS256 (crate `jsonwebtoken`, backend `rust_crypto`) cuyo sujeto es `backoffice` o `<sala>/<nombre>`. La clave se genera al primer arranque en `DATA_DIR/session.key`, así que las sesiones sobreviven a un reinicio (ADR-0007). Las cookies son `HttpOnly`, `Secure` y `SameSite=Strict`, y eso último también evita CSRF.

## Considered Options

- **Cuentas de Anfitrión con contraseña**: descartada por ahora. Cambia el modelo (cada Anfitrión ve solo sus Salas) y necesita descubrimiento propio.
- **Sesiones opacas en memoria**: menos código, pero se pierden en cada reinicio, justo lo que ADR-0007 evita.
- **Solo el extractor, sin cookie**: no saca los secretos de las URL.

## Consequences

- Los enlaces antiguos `/backoffice/<token>` dejan de funcionar: se entra por `/backoffice`.
- tus sigue usando la cabecera `X-Invite`: no es una URL y los proxies no la registran, y las Subidas pendientes la guardan para reanudar tras recargar.
- Cerrar la Sala invalida las sesiones de sus Participantes, porque cada petición comprueba que la Sala sigue abierta. Una Invitación no se revoca por separado, igual que antes.
- Borrar `session.key` cierra todas las sesiones. Cambiar `BACKOFFICE_TOKEN` no cierra las del backoffice hasta que caducan (12 h).
- `Secure` funciona en `http://localhost` en Chrome y Firefox. Safari puede rechazarla fuera de HTTPS.
- Si se abandona `jsonwebtoken`, la alternativa es firmar con HMAC a mano (`ring` ya está en el árbol por TURN).
