# 0003 — Defer omp core/Rust features (incl. TTSR and deep hashline) as out of scope

- **Status:** Accepted (with a stated revisit trigger)
- **Date:** 2026-08-13

## Context

During evaluation, omp's highest-val features turned out to be the ones least
portable to pi:

- **TTSR** (time-traveling stream rules): a private `TtsrCoordinator` in
  AgentSession that intercepts `message_update`, aborts the stream, injects a
  system reminder, and resumes via `scheduleAgentContinue`/`promptGeneration()`.
  pi extensions get a read-only `message_update` hook — no abort+resume — so this
  is **not** reachable via the extension API. Fork-only.
- **Rust-core features** (LSP ops, DAP debugger, embedded bash, tree-sitter AST
  edits, in-process grep, hashline at full depth): welded to the native addon.

## Decision

These are **non-goals** for now. Do not build against them and do not pull them in.
The single acceptable path to TTSR would be a fork-level change to
`pi-agent-core`'s `AgentSession` porting omp's `TtsrCoordinator`; we have not
chosen that.

## Revisit trigger

Reconsider only if TTSR (or a given Rust feature) becomes a hard product
requirement — an inability to ship without it — not a nice-to-have. Reopen this
decision with evidence before spending on a fork.

## Consequences

- Our feature work in `carl-code` is limited to the extension surface.
- We keep a lean base; no fork maintenance tax.
- We accept that some omp capabilities are simply unavailable on our stack.