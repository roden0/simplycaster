# Salas efímeras que no se reabren

Una Sala solo tiene dos estados: abierta (se llena de Tomas) y cerrada (cristalizada, inmutable, solo borrable). No se puede reabrir: si se cierra por error, el Anfitrión crea otra Sala (p. ej. "sesion1-continuacion") y vuelve a invitar. Preferimos esto a estados de pausa/reapertura porque elimina casos excepcionales; rehacer una Sala es barato.

## Consequences

- Las Invitaciones caducan al cerrar la Sala, así que la reconexión solo es posible mientras está abierta.
