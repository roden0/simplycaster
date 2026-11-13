# Correo por SMTP opcional, y los emails de Cuenta solo como huella

Hasta ahora no se envía ningún correo: quien crea una Invitación o un Enlace de alta lo copia y lo manda por donde quiere. ADR-0011 descartó el enlace mágico por esa razón, y guardaba el email de cada Cuenta «sin verificar hasta que algo lo use». Decidimos que el Coordinador **envíe correo por SMTP genérico, opcional**: Invitaciones, Enlaces de alta (alta y recuperación) y un nuevo **Enlace de acceso** para entrar sin passkey. Sin las variables `SMTP_*` no aparece ninguna opción de envío y todo funciona como antes, copiando el enlace. Grabar nunca depende del correo.

- **Transporte:** SMTP configurado por variables, con el remitente en `SMTP_FROM`. Sirve con Resend o con cualquier otro proveedor. Los correos son texto plano, desde el catálogo de mensajes (`en`).
- **Enlace de acceso:** otra forma de entrar, al mismo nivel que la passkey, solo para Cuentas (los Invitados entran con su Invitación). Es de un solo uso y vale 15 minutos. Va en el fragmento de la URL, como el Enlace de alta, y el Coordinador guarda solo su hash. Al pedirlo, la respuesta es la misma exista o no la Cuenta, y hay un límite de ritmo por dirección y general.
- **Emails de Cuenta:** no se guardan. Solo se guarda una **huella** (HMAC con una clave propia, `DATA_DIR/email.key`, `0600`, generada al primer arranque) y una **pista** para reconocerla (`r•••@gmail.com`). Para pedir un Enlace de acceso, la persona escribe su email: el Coordinador calcula la huella, encuentra la Cuenta y envía a la dirección que acaba de recibir. La unicidad se comprueba sobre la huella. Al arrancar, las Cuentas con el email en claro pasan a huella y pista.
- **Normalización antes de la huella:** quitar espacios y pasar a minúsculas. Para `gmail.com` y `googlemail.com`, además, quitar los puntos de la parte local y lo que va desde el `+`, y tratar `googlemail.com` como `gmail.com`. Con otros proveedores no, porque un punto o un `+` pueden distinguir buzones distintos y el enlace llegaría a otra persona.
- **Emails de Invitados:** se usan para enviar la Invitación y no se guardan. Reenviarla es volver a escribirlo.
- **Fallo de envío:** se muestra el error y el enlace para copiarlo a mano. En el Enlace de acceso, como no hay nada que copiar, solo un error genérico.

## Considered Options

- **Botón `mailto:`**: sale del buzón de quien invita, sin nada que configurar, pero no sirve para el Enlace de acceso, que manda el Coordinador.
- **API HTTP de Resend**: más simple que SMTP, pero ata la instancia a un proveedor.
- **Emails en claro, como hasta ahora**: quien lee `DATA_DIR` tiene ya todo lo demás, pero `accounts.json` puede filtrarse solo (un volcado, una copia compartida por error) y con la huella no expone direcciones.
- **Emails cifrados con una clave fuera de `DATA_DIR`**: protegen también ante una copia filtrada, pero añaden una variable obligatoria, y si se pierde la clave se pierden los emails.
- **Clave del HMAC derivada de `session.key`**: ninguna variable ni fichero más, pero regenerar `session.key` para cerrar todas las sesiones rompería todas las huellas sin forma de recalcularlas.
- **Verificar el email**: solo prueba que alguien controla ese buzón; quien reciba una dirección mal escrita podría verificarla igual.

## Consequences

- La seguridad de una Cuenta pasa a ser también la de su buzón. Un email mal escrito por el Administrador da acceso a quien lo reciba, igual que ya pasaba al enviarle el Enlace de alta.
- El Administrador ya no ve los emails completos, solo la pista. Para enviar por correo un Enlace de alta de recuperación tiene que volver a escribir el email.
- Perder `email.key` deja inservibles las huellas: nadie puede entrar por Enlace de acceso hasta que un Administrador vuelva a escribir los emails. Va en las copias de `/data` con todo lo demás.
- Sustituye en ADR-0011 «el email de la Cuenta se guarda, único y sin verificar»: sigue siendo único y sin verificar, pero solo como huella.
