# Instructions for agents

## Project overview

This is a pi package for developing and tracking Carl's personal agent harness, Carl Code.
While named Carl Code, it is for much more than coding. 
Carl is a computational biologist, but he is not a software engineer.
Always ask questions to elicit more information from him on the desired *behavior* of what you are building, 
but make reasonable decisions around software engineering defaults when it comes to stacks, architecture, and coding conventions.

## Monorepo map

Bun-workspace monorepo. Three packages plus a GUI:

- `packages/harness/` — the pi package (extensions/, skills/, prompts/, themes/).
  This is what pi loads; extensions register via `package.json` `pi.extensions`.
- `packages/sidecar/` — Bun/Node agent host embedding the pi SDK. **Source of truth**
  for session/agent state. Speaks JSONL IPC on stdio (see `packages/shared/`).
- `packages/shared/` — typed JSON IPC protocol (one file, dependency-free).
- `apps/gui/` — Tauri 2 (thin Rust relay) + React/TS/Vite projection of sidecar state.

## Architecture invariants (keep these true)

1. The **sidecar is the source of truth**. The GUI never touches pi directly — it
   only renders projections pushed over the shared protocol.
2. **Rust is a thin relay.** `src-tauri` only launches the sidecar and relays JSONL
   over stdio. No application logic in Rust.
3. Extension logic lives in `packages/harness/`; GUI mirrors are React components
   in `apps/gui/src/` projecting the same underlying state.
4. We do **not** fork pi or adopt omp wholesale.

## Writing a GUI feature

1. Add/reuse behavior in the sidecar (`packages/sidecar/src/index.ts`): a request
   method + any agent events to forward.
2. Extend `packages/shared/src/protocol.ts` with the message shapes (GUI + sidecar
   both import this — it's the single contract).
3. Render the resulting projection in `apps/gui/src/components/`.

Add a slash command or tool? Put it in `packages/harness/extensions/` so the TUI
also gets it. If it needs GUI-specific rendering, mirror it with a React component.

## Maintaining repo docs

Keep these three sources consistent and at the right level:

- **ARCHITECTURE.md** — the *stable* contract: what the architecture *is* and
  consequences that follow from decisions, each with a citation link to a
  decision file (e.g. [0001](docs/decisions/0001-base-stock-pi-no-fork.md)).
  No process, no rationale, no roadmap. Change rarely.
- **docs/decisions/XXXXXXXX-title.md** — one numbered ADR per decision
  (Context → Decision → Consequences; add a Revisit trigger when relevant).
  New decision = next number. When behavior changes, reopen/update the relevant
  decision *first*, then align ARCHITECTURE.md.
- **README.md** — single home for the **roadmap/todo/built list**. Never put it
  in ARCHITECTURE.md; don’t duplicate it under docs/.

When you change architecture or behavior: update the decision file, then
ARCHITECTURE.md, then (if it affects work) the README roadmap.

## Maintaining repo docs

Keep these three sources consistent and at the right level:

- **ARCHITECTURE.md** — the *stable* contract: what the architecture *is* and
  consequences that follow from decisions, each with a citation link to a
  decision file (e.g. [0001](docs/decisions/0001-base-stock-pi-no-fork.md)).
  No process, no rationale, no roadmap. Change rarely.
- **docs/decisions/XXXXXXXX-title.md** — one numbered ADR per decision
  (Context → Decision → Consequences; add a Revisit trigger when relevant).
  New decision = next number. When behavior changes, reopen/update the relevant
  decision *first*, then align ARCHITECTURE.md.
- **README.md** — single home for the **roadmap/todo/built list**.

When you change architecture or behavior: update the decision file, then
ARCHITECTURE.md, then (if it affects work) the README roadmap.
