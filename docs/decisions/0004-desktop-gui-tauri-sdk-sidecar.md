# 0004 — Defer the desktop GUI

- **Status:** Accepted, revised
- **Date:** 2026-08-13
- **Revised:** 2026-08-18

## Context

A Tauri and React desktop GUI was prototyped with a Bun sidecar that embedded the
pi SDK. Building and maintaining a second interface shifted attention away from
the agent harness and its core behavior.

The harness is still evolving. A desktop interface would add product and
presentation work before the agent itself is mature enough to justify it.

## Decision

Remove the desktop GUI, SDK sidecar, and shared GUI protocol from the repository.
Focus `carl-code` on the pi harness and resources that improve the agent directly.
Do not maintain a second interface or GUI specific projections for now.

The removed prototype remains available in git history.

## Consequences

- The pi TUI is the only supported interface.
- Rust, Tauri, React, Vite, and the SDK sidecar are no longer project dependencies.
- Features only need to work through the pi package and extension surfaces.
- The repository keeps `packages/harness` as the installed pi package path.

## Revisit trigger

Reconsider a separate interface only when the harness is mature and a clear need
cannot be met through the TUI or extension surface.
