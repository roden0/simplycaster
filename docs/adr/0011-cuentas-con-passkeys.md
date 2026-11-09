# Cuentas con passkeys dentro del Coordinador

Una instancia pasa a servir a un equipo pequeño: varios Anfitriones que crean sus propias Salas y Administradores que gestionan Cuentas y contenidos. El `BACKOFFICE_TOKEN` compartido no distingue a nadie (ADR-0009). Decidimos **Cuentas propias con passkeys, dentro del binario** (`webauthn-rs`), guardadas en `DATA_DIR/accounts.json`. Los Invitados siguen sin Cuenta, y **la Sala no sabe nada de Cuentas**: el Anfitrión de una Sala sigue entrando por su Invitación, de modo que grabar no depende de esta capa.

- **Alta y recuperación:** un Administrador genera un enlace de un solo uso, válido 72 h, y lo envía por donde quiera. Va en el fragmento (`/backoffice#enrol=…`), que ni el servidor ni los proxies registran. El Coordinador guarda solo su hash.
- **Primer Administrador:** al arrancar sin ningún Administrador se crea la Cuenta «Admin inicial», cuya credencial es el `BACKOFFICE_TOKEN` (32 caracteres o más fuera de loopback). Borrarla inutiliza el token aunque siga en el entorno. No se puede borrar un Administrador si no queda otro capaz de entrar. Si un día no queda ninguno, quitándolo a mano del fichero, el arranque la recrea.
- **Sesión:** la cookie firmada de ADR-0009, ahora de 7 días, cuyo sujeto es `account:<uuid>` (`:` no cabe en un id de Sala). Cada petición busca la Cuenta en memoria, así que borrarla o cambiarla surte efecto en su siguiente petición.
- **Permisos:** cada Sala guarda su Creador (UUID; las Salas anteriores a las Cuentas no lo tienen). Si su Cuenta se borra, el UUID ya no corresponde a nadie y nunca se reasigna. Un Anfitrión ve y gestiona las suyas; un Administrador, todas.
- **Borrado:** Salas enteras, solo cerradas y sin conversión a FLAC en marcha. Una Sala cerrada no puede tener una Toma en curso.

## Considered Options

- **Hanko**: backend AGPLv3 con passkeys listas, pero exige Postgres o MySQL, un paso de migración y SMTP. Tres piezas más que operar y copiar en cada instalación autoalojada.
- **Keycloak**: el más estándar (OIDC), pero añade una base de datos externa y recomienda 2 GB de memoria para despliegues pequeños; desproporcionado para unas pocas Cuentas.
- **Enlace mágico por correo**: necesita SMTP en cada instalación y hoy no se envía ningún correo. Puede añadirse cuando exista el envío de Invitaciones.
- **Correo y contraseña**: el camino clásico, con más fricción y un secreto que robar.
- **Redis o una base NoSQL**: las Cuentas son pocas, y un fichero con escritura atómica ya entra en las copias de `/data`. Se revisará si aparece un disparador concreto, como cientos de Salas (ADR-0006, B12).
- **Solo Administración sin Cuentas**: resolvía el borrado, pero no los varios Anfitriones.

## Consequences

- `accounts.json` tiene permisos `0600` y queda fuera de las carpetas de Sala, así que ninguna descarga lo incluye. No guarda secretos que den acceso: de las passkeys solo hay clave pública. Sí datos personales (nombres y emails), que además permanecen en las copias hasta que caduquen.
- Las passkeys quedan ligadas al dominio: cambiar `PUBLIC_URL` obliga a registrarlas de nuevo. Sin `PUBLIC_URL` fuera de loopback, el Coordinador arranca y solo funciona el token, para que un error de configuración no impida grabar.
- El login es «descubrible»: un toque, sin escribir el email. El email de la Cuenta se guarda, único y sin verificar, hasta que algo lo use.
- `invitations.json` pasa a escribirse también con permisos `0600`.
- `room.json` añade `uuid` (sin usar aún; candidato a clave principal), `creator` y `displayName`. La etiqueta sigue formando el id y los nombres de fichero. Las Salas antiguas no tienen ninguno.
- El audio borrado sigue en las copias hasta su caducidad, configurable con `BACKUP_KEEP` o `KEEP`, ahora de un mes por defecto.
- Sustituye en ADR-0009 la cookie `sc_admin`: quien tuviera una sesión abierta debe entrar de nuevo.
