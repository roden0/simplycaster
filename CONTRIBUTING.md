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

The repository has two parts, `coordinator/` (Rust) and `client/` (TypeScript + Vite), driven by a root `Makefile`. Build, run and test commands will be documented here once the skeleton exists.

Recording APIs (microphone, WebCodecs, OPFS) only work in a secure context: use `localhost` or HTTPS when testing from other devices.
