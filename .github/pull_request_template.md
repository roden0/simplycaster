## What and why

<!-- One or two sentences. Link the issue, use case (CU) or ADR step it belongs to. -->

## Checklist

- [ ] `make test` passes locally (CI runs it too).
- [ ] Rust message types changed? `make types` was run and `client/src/protocol/` is committed.
- [ ] New visible text goes through the message catalog; domain terms come from `CONTEXT.md`.
- [ ] Reverses or makes a hard-to-reverse decision? The ADR is written or updated here.
- [ ] Touches recording, upload, sync or live conversation? Tested on dev after merging, before the next step.
