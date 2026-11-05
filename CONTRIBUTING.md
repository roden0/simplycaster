# Contributing to SimplyCaster

SimplyCaster is a self-hosted, local-first distributed audio recording studio. Start with [AGENTS.md](AGENTS.md) for the project overview and tech stack.

## Language

- **Code, file names, UI and commit messages are in English.**
- Domain vocabulary comes from [CONTEXT.md](CONTEXT.md). It is bilingual: use the English term (`en:`) in code and UI, never the terms listed under _Avoid_. If you need a new domain term, add it to the glossary first.
- No user-visible string is hard-coded: every text goes through the message catalog (`en` is the base locale) so translations can be added later.

## Decisions

Architecture decisions live in [docs/adr/](docs/adr/). Read them before changing anything they cover. If your change reverses one, write a new ADR (or update the existing one) in the same pull request. Only record decisions that are hard to reverse, surprising without context, and the result of a real trade-off.

## Principle

Pragmatism first: the simplest solution that works ("the Russian pencil, not the NASA pen"). Avoid abstractions, options and dependencies nobody asked for.

## Development

The repository has two parts, `coordinator/` (Rust) and `client/` (TypeScript + Vite), driven by a root `Makefile`. You need Rust (stable) and Node.js 24+.

- `make run` builds everything and starts the Coordinator on http://127.0.0.1:3000. Create Rooms and Invitations in the backoffice, http://127.0.0.1:3000/backoffice/admin; it shows each Participant's link. On restart the Coordinator lists past Rooms again from each `room.json` in `coordinator/data/`, closed: they can be downloaded, not reopened. Converting a closed Room to FLAC (CU10) runs `ffmpeg`, so it must be on the `PATH`; the Docker image includes it.
- `make test` runs the Rust tests and the client tests (`node --test`).
- `make measure ROOM=coordinator/data/<room>_<date> TAKE=1` reports the sync error between the Tracks of a Take, from the Sync tone each Participant plays aloud and from cross-correlation of the audio, and the audio clock drift from the drift marks (needs `ffmpeg`).
- `make types` regenerates `client/src/protocol/` from the Rust message types with `ts-rs`. Never edit those files by hand; commit them with the Rust change.

Recording APIs (microphone, WebCodecs, OPFS) only work in a secure context: use `localhost` or HTTPS when testing from other devices.

## Deploying a test instance (Coolify)

The root `Dockerfile` builds one image with the Coordinator and the client. On Coolify:

- **Build pack**: Dockerfile; base directory `/`, Dockerfile location `/Dockerfile`.
- **Ports exposes**: `3000`. The platform proxy terminates HTTPS, which browsers require for recording; WebSockets pass through it.
- **Persistent storage**: mount a volume at `/data`, or Tracks are lost on every redeploy.
- **Environment**: `BACKOFFICE_TOKEN` with a long random token (e.g. `openssl rand -hex 16`). The backoffice is then `https://<domain>/backoffice/<token>`. Without it the backoffice is the guessable `/backoffice/admin`, so never deploy publicly without it. Invitation links get random tokens of their own.
- **Live conversation** (ADR-0005): set `TURN_PUBLIC_IP` to the server's public IPv4, not the domain (a proxied domain does not reach UDP). In Coolify's *Ports Mappings* add `3478:3478/udp,49160-49199:49160-49199/udp` and open the same UDP ports in the server firewall. The ports must keep the same numbers outside, because the Coordinator tells browsers to use them; change them with `TURN_PORT` and `TURN_RELAY_PORTS`. Without `TURN_PUBLIC_IP` only direct connections work, enough for a local network.

