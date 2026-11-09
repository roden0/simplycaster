# SimplyCaster

Estudio de grabación de audio distribuido y local-first: cada Participante graba su propia fuente con calidad en su navegador, y el Coordinador (el servidor autoalojado) solo coordina las conexiones y guarda el audio. La edición se hace después, en software externo.

Glosario bilingüe: el término en español se usa en la conversación y la documentación; el término en inglés (`en:`) es el canónico en el código y la interfaz.

## Language

### Personas

**Participante** (en: **Participant**):
Cualquier persona conectada a una Sala; todos graban su Pista con la misma tecnología, en su propio navegador.
_Avoid_: Usuario, miembro, peer / User, member

**Anfitrión** (en: **Host**):
El Participante con privilegios dentro de una Sala: controla grabar/parar. Graba igual que cualquier otro Participante. No implica tener Cuenta: quien crea la Sala puede dejar que la conduzca otra persona.
_Avoid_: Admin, propietario / Owner, admin

**Cuenta** (en: **Account**):
Identidad duradera de una persona en la instancia, con identificador interno propio. Es de **Anfitrión** (crea Salas e Invitaciones y puede borrar las Salas que creó o sus Tomas, una vez cerradas) o de **Administrador**. No confundir con el Anfitrión de una Sala, que es un papel de Participante.
_Avoid_: Usuario, perfil / User, profile

**Administrador** (en: **Admin**):
Cuenta que puede todo lo de una Cuenta de Anfitrión y además gestiona las Cuentas y puede ver, descargar y borrar las Salas de cualquiera.
_Avoid_: Superusuario, dueño / Superuser, owner

**Creador** (en: **Creator**):
La Cuenta desde la que se creó una Sala. Una Sala puede no tener Creador, si es anterior a las Cuentas o si su Cuenta se borró; en ese caso solo la ve un Administrador y no se reasigna.
_Avoid_: Dueño, Anfitrión / Owner, Host

**Invitado** (en: **Guest**):
Participante sin privilegios que entra a una Sala con su Invitación, sin Cuenta. Tiene un nombre fijado al invitarlo (único en la Sala, usado para nombrar sus Pistas) y un nombre visible que él mismo puede corregir.
_Avoid_: Participante externo / Visitor, attendee

**Invitación** (en: **Invitation**):
Acceso personal de un Participante a una Sala, creado desde una Cuenta con el nombre del Invitado (y su email si se envía por correo); puede reutilizarse para reconectar y caduca al cerrarse la Sala.
_Avoid_: Enlace, token / Link, invite token

### Estudio

**Coordinador** (en: **Coordinator**):
No es una entidad ni un actor del dominio, sino el conjunto de reglas y mecanismos de software que conviven en el servidor donde está alojada SimplyCaster: coordinan las conexiones de los Participantes en la Sala, guardan las Pistas recibidas y dan el reloj de referencia para la sincronía. No graba ni procesa audio, y no es el navegador del Anfitrión.
_Avoid_: Servidor, backend / Server, backend

**Sala** (en: **Room**):
Espacio efímero y de un solo uso, creado desde una Cuenta con sus Participantes asignados (máximo 5 en total). Tiene un **nombre visible** (en: *display name*), libre y repetible, para que quien la crea se organice (p. ej. «Mi programa S01E01 - temática»), y una **etiqueta** (en: *slug*) derivada de él, con solo a-z, 0-9 y guiones, de 40 caracteres como máximo. Es una carpeta en el Coordinador que se llena de Tomas mientras está **abierta** (en: *open*). Al **cerrarla** (en: *closed*), su Anfitrión, su Creador o un Administrador la cristaliza: queda inmutable (Tomas y metadatos), no se puede reabrir y solo puede borrarse, entera o Toma a Toma.
_Avoid_: Estudio, sesión / Studio, session

**Toma** (en: **Take**):
Cada intervalo entre "grabar" y "parar" dentro de una Sala, numerado secuencialmente; empieza con un Tono de sincronía y contiene una Pista por Participante.
_Avoid_: Sesión, grabación / Session, recording

**Pista** (en: **Track**):
El audio de un único Participante en una Toma, grabado con calidad en su propio navegador y subido progresivamente al Coordinador.
_Avoid_: Grabación, stream / Recording, stream

**Parte** (en: **Part**):
Trozo continuo de una Pista. La parte 1 empieza en el Tono de sincronía; si el navegador se recarga o se reconecta durante la Toma (CU7), lo que graba después es una parte nueva (2, 3…), con su desfase respecto al Tono y sus propias Marcas de deriva, en su propio fichero (`_p2`, `_p3`…).
_Avoid_: Segmento, trozo, chunk / Segment, chunk

**Tono de sincronía** (en: **Sync tone**):
Marca audible insertada en todas las Pistas de una Toma en el mismo instante según el reloj del Coordinador, para alinear su inicio al editar. Alinea el inicio con un margen de unos 15 ms, pero no la duración: de eso se ocupa la corrección de deriva (ADR-0004).
_Avoid_: Clap, beep, marca de sincronización / Clap, beep, marker

**Marca de deriva** (en: **Drift mark**):
Anotación que cada navegador manda cada 2 s mientras graba: cuántas muestras lleva su Pista en ese instante del reloj del Coordinador. Su pendiente mide la deriva del reloj de audio de esa Pista, y con ella se corrige al convertir a FLAC; un salto entre dos marcas señala audio perdido, que se rellena con silencio (ADR-0010).
_Avoid_: Timestamp, checkpoint

**Sincronizando** (en: **Syncing**):
Estado de un Participante cuyas Pistas aún tienen audio pendiente de subir al Coordinador; visible para todos en la Sala, junto a "conectado" (en: *connected*).
_Avoid_: Subiendo / Uploading
