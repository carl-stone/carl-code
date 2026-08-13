# 0001 — Base on stock pi; do not fork; add via the package/extension API

- **Status:** Accepted
- **Date:** 2026-08-13

## Context

We evaluated adopting omp (oh-my-pi) and the possibility of forking pi to reach
omp features. omp is the same TS agent core as pi plus ~80k LoC of Rust compiled
as a native addon (shell/grep/AST/PTY) built with Bazel on Bun; reusing its Rust
pieces requires adopting that whole build. Both pi-mono and omp are MIT, so
forking is legal but would mean owning all upstream churn.

## Decision

Base on stock `@earendil-works/pi-coding-agent` (lean, TypeScript, MIT). Do **not**
fork pi. Do **not** use omp as a base. Implement our own behavior as a pi
**package** (`carl-code`) using the extension/package API — add, don't strip.

## Consequences

- We inherit pi's forward-compat: upstream updates flow in; our code stays a
  small, versioned package, not a divergent diff.
- Only features reachable through the extension/package API are in scope.
  Features that require agent-core or Rust internals are out of scope
  (see 0003).
- The product/releasable artifact is `carl-code` + a pinned pi engine.