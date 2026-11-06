# Contributing to SimplyCaster

SimplyCaster is a self-hosted, local-first distributed audio recording studio. Start with [AGENTS.md](AGENTS.md) for the project overview and tech stack.

## Language

- **Code, file names, UI and commit messages are in English**, and so are the public documents (README, CONTRIBUTING, SECURITY). The team talks in Spanish, and the ADRs and internal documents are in Spanish.
- Domain vocabulary comes from [CONTEXT.md](CONTEXT.md). It is bilingual: use the English term (`en:`) in code and UI, never the terms listed under _Avoid_. If you need a new domain term, add it to the glossary first.
- No user-visible string is hard-coded: every text goes through the message catalog (`en` is the base locale) so translations can be added later.

## Decisions

Architecture decisions live in [docs/adr/](docs/adr/). Read them before changing anything they cover. If your change reverses one, write a new ADR (or update the existing one) in the same pull request. Only record decisions that are hard to reverse, surprising without context, and the result of a real trade-off.

## Principle

Pragmatism first: the simplest solution that works ("the Russian pencil, not the NASA pen"). Avoid abstractions, options and dependencies nobody asked for.

The full set of rules (module structure, errors and logs, concurrency, persistence, trust boundaries, tests, dependencies) is in the [engineering agreements](docs/acuerdos-de-ingenieria.md), in Spanish. Items marked **[pendiente]** are not met yet; [ADR-0006](docs/adr/0006-revision-de-codigo-y-mejoras.md) lists the steps that fix them.

## Workflow

- `main` is protected: nobody pushes to it directly, admins included, and it cannot be force-pushed or deleted. There is no `dev` branch: `main` is the integration branch.
- Branch from `main` with a short prefix: `feat/`, `fix/`, `docs/`, `chore/`. Keep one change per pull request; each ADR-0006 step is its own pull request.
- Small commits that make sense on their own, in English. A commit that only formats or moves code does not change behaviour and goes separately.
- Open a pull request and fill in its checklist. **CI must pass** before merging: `make check` and the Docker image build.
- Merging to `main` deploys the dev instance (https://dev.simplycaster.com) automatically. A change to recording, upload, sync or live conversation is tested there on real devices before the next step starts.
- Fixing a bug starts with a test that fails.
- Dependabot opens monthly update pull requests; they follow the same rules.

## Development

The repository has two parts, `coordinator/` (Rust) and `client/` (TypeScript + Vite), driven by a root `Makefile`. You need Rust (stable) and Node.js 24+.

- `make run` builds everything and starts the Coordinator on http://127.0.0.1:3000. Create Rooms and Invitations in the backoffice, http://127.0.0.1:3000/backoffice/admin; it shows each Participant's link. On restart the Coordinator loads every Room in `coordinator/data/` again: open ones stay open with the same links, and a Take being recorded goes on (ADR-0007); closed ones can be downloaded, not reopened. Converting a closed Room to FLAC (CU10) runs `ffmpeg`, so it must be on the `PATH`; the Docker image includes it.
- `make test` runs the Rust tests and the client tests (`node --test`).
- `make check` is what CI requires: `make test`, then `cargo fmt --check`, `cargo clippy -D warnings`, `tsc --noEmit` and no uncommitted changes in `client/src/protocol/`. Run it before every commit.
- `make measure ROOM=coordinator/data/<room>_<date> TAKE=1` reports the sync error between the Tracks of a Take, from the Sync tone each Participant plays aloud and from cross-correlation of the audio, and the audio clock drift from the drift marks (needs `ffmpeg`).
- `make types` regenerates `client/src/protocol/` from the Rust message types with `ts-rs`. Never edit those files by hand; commit them with the Rust change.

Recording APIs (microphone, WebCodecs, OPFS) only work in a secure context: use `localhost` or HTTPS when testing from other devices.

## Versioning and releases

SimplyCaster follows [SemVer](https://semver.org). The single source of the version is `version` in `coordinator/Cargo.toml`. While we are on 0.x, a minor version may break compatibility (the `room.json` format, the protocol, the configuration); the release notes say so.

To cut a release:

1. Open a pull request that sets the new `version` in `coordinator/Cargo.toml` (and `Cargo.lock`, via `cargo build`), and merge it.
2. Tag that commit of `main` and push the tag:
   ```sh
   git switch main && git pull
   git tag -a v0.2.0 -m "v0.2.0"
   git push origin v0.2.0
   ```
3. The *Release* workflow checks that the tag matches `Cargo.toml`, publishes `ghcr.io/roden0/simplycaster:0.2.0` (also `0.2` and `latest`), and creates the GitHub Release with notes generated from the merged pull requests. Edit the notes to mention anything that breaks.

Production never follows `main`: it runs a pinned image version and is upgraded by hand after reading the notes.

## Security

Report vulnerabilities privately, as explained in [SECURITY.md](SECURITY.md). Never commit secrets: real configuration goes in `.env`, which git ignores; `.env.example` is the template.

## Self-hosting

[README.md](README.md) explains how to run an instance with `docker-compose.yml`: Caddy for HTTPS, and restic for backups of `/data`.

## Deploying on Coolify

Our dev instance runs on Coolify and builds the root `Dockerfile` on every merge to `main`. A production instance on Coolify should use the *Docker Image* build pack with a pinned `ghcr.io/roden0/simplycaster:X.Y.Z` instead. Coolify does not back up volumes: copy `/data` yourself, for example with the `backup` service from `docker-compose.yml`. For the Dockerfile build:

- **Build pack**: Dockerfile; base directory `/`, Dockerfile location `/Dockerfile`.
- **Ports exposes**: `3000`. The platform proxy terminates HTTPS, which browsers require for recording; WebSockets pass through it.
- **Persistent storage**: mount a volume at `/data`, or Tracks are lost on every redeploy.
- **Environment**: `BACKOFFICE_TOKEN` with a long random token (e.g. `openssl rand -hex 16`). The backoffice is then `https://<domain>/backoffice/<token>`. Without it the Coordinator refuses to start unless it listens on loopback, where the backoffice is the guessable `/backoffice/admin` (fine for `make run`). Invitation links get random tokens of their own.
- **Live conversation** (ADR-0005): set `TURN_PUBLIC_IP` to the server's public IPv4, not the domain (a proxied domain does not reach UDP). In Coolify's *Ports Mappings* add `3478:3478/udp,49160-49199:49160-49199/udp` and open the same UDP ports in the server firewall. The ports must keep the same numbers outside, because the Coordinator tells browsers to use them; change them with `TURN_PORT` and `TURN_RELAY_PORTS`. Without `TURN_PUBLIC_IP` only direct connections work, enough for a local network.

