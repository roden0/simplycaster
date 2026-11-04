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

- `make run` builds everything and starts the Coordinator on http://127.0.0.1:3000. In iteration 0a the Room and its two links are hard-coded: `/i/host` (Host) and `/i/ana` (Guest).
- `make test` runs the Rust tests and the client tests (`node --test`).
- `make measure ROOM=coordinator/data/room-<id> TAKE=1` reports the sync error between the Tracks of a Take from real claps picked up by every microphone, and the audio clock drift from the drift marks (needs `ffmpeg`).
- `make types` regenerates `client/src/protocol/` from the Rust message types with `ts-rs`. Never edit those files by hand; commit them with the Rust change.

Recording APIs (microphone, WebCodecs, OPFS) only work in a secure context: use `localhost` or HTTPS when testing from other devices.

## Deploying a test instance (Coolify)

The root `Dockerfile` builds one image with the Coordinator and the client. On Coolify:

- **Build pack**: Dockerfile; base directory `/`, Dockerfile location `/Dockerfile`.
- **Ports exposes**: `3000`. The platform proxy terminates HTTPS, which browsers require for recording; WebSockets pass through it.
- **Persistent storage**: mount a volume at `/data`, or Tracks are lost on every redeploy.
- **Environment**: `HOST_INVITE` and `GUEST_INVITE` with long random tokens (e.g. `openssl rand -hex 16`). The links are then `https://<domain>/i/<token>`. Without them the links are the guessable `/i/host` and `/i/ana`, so never deploy publicly without them.

The startup log lists both links.

