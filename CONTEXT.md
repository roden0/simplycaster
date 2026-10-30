# SimplyCaster

Estudio de grabación de audio distribuido y local-first: cada Participante graba su propia fuente con calidad en su navegador, y el Coordinador (el servidor autoalojado) solo coordina las conexiones y guarda el audio. La edición se hace después, en software externo.

Glosario bilingüe: el término en español se usa en la conversación y la documentación; el término en inglés (`en:`) es el canónico en el código y la interfaz.

## Language

### Personas

**Participante** (en: **Participant**):
Cualquier persona conectada a una Sala; todos graban su Pista con la misma tecnología, en su propio navegador.
_Avoid_: Usuario, miembro, peer / User, member

**Anfitrión** (en: **Host**):
El Participante con privilegios: es el dueño de la instancia y el único con cuenta; crea Salas e Invitaciones, controla grabar/parar y cierra la Sala. Graba igual que cualquier otro Participante.
_Avoid_: Admin, propietario / Owner, admin

**Invitado** (en: **Guest**):
Participante sin privilegios que entra a una Sala con su Invitación, sin cuenta. Tiene un nombre fijado por el Anfitrión (único en la Sala, usado para nombrar sus Pistas) y un nombre visible que él mismo puede corregir.
_Avoid_: Participante externo / Visitor, attendee

**Invitación** (en: **Invitation**):
Acceso personal de un Invitado a una Sala, creado por el Anfitrión con el nombre del Invitado (y su email si se envía por correo); puede reutilizarse para reconectar y caduca al cerrarse la Sala.
_Avoid_: Enlace, token / Link, invite token

### Estudio

**Coordinador** (en: **Coordinator**):
No es una entidad ni un actor del dominio, sino el conjunto de reglas y mecanismos de software que conviven en el servidor donde está alojada SimplyCaster: coordinan las conexiones de los Participantes en la Sala, guardan las Pistas recibidas y dan el reloj de referencia para la sincronía. No graba ni procesa audio, y no es el navegador del Anfitrión.
_Avoid_: Servidor, backend / Server, backend

**Sala** (en: **Room**):
Espacio con nombre, efímero y de un solo uso, creado por el Anfitrión con sus Invitados asignados (máximo 5 Participantes en total); es una carpeta en el Coordinador que se llena de Tomas mientras está **abierta** (en: *open*). Al **cerrarla** (en: *closed*), el Anfitrión la cristaliza: queda inmutable (Tomas y metadatos), no se puede reabrir y solo puede borrarse.
_Avoid_: Estudio, sesión / Studio, session

**Toma** (en: **Take**):
Cada intervalo entre "grabar" y "parar" dentro de una Sala, numerado secuencialmente; empieza con un Tono de sincronía y contiene una Pista por Participante.
_Avoid_: Sesión, grabación / Session, recording

**Pista** (en: **Track**):
El audio de un único Participante en una Toma, grabado con calidad en su propio navegador y subido progresivamente al Coordinador.
_Avoid_: Grabación, stream / Recording, stream

**Tono de sincronía** (en: **Sync tone**):
Marca audible insertada en todas las Pistas de una Toma en el mismo instante según el reloj del Coordinador, para alinearlas al editar.
_Avoid_: Clap, beep, marca de sincronización / Clap, beep, marker

**Sincronizando** (en: **Syncing**):
Estado de un Participante cuyas Pistas aún tienen audio pendiente de subir al Coordinador; visible para todos en la Sala, junto a "conectado" (en: *connected*).
_Avoid_: Subiendo / Uploading
