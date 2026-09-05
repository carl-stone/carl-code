# Instructions for agents

## Project overview

This is Carl's personal agent, built as a thin distribution over stock Pi. Carl
Code supports computational biology, practical software, learning, and general
assistance. Carl is a computational biologist, not a software engineer.

Ask questions to understand the desired behavior, but make reasonable software
engineering choices about architecture and conventions.

## Repository map

- `bin/carl.mjs` — the Carl Code launcher and state setup.
- `packages/harness/` — extensions, system instructions, skills, prompts, and
  themes loaded by the launcher.
- `docs/decisions/` — architecture decision records.
- `ARCHITECTURE.md` — the stable architecture contract.
- `README.md` — setup, current features, and roadmap.

## Architecture invariants

1. The Pi TUI is the only supported interface. Do not add a GUI, sidecar, or
   separate interface unless decision 0004 is reopened first.
2. Carl Code owns its identity, command, resources, and state. Stock Pi remains
   the underlying engine.
3. Agent behavior lives in `packages/harness/` or an installed Pi package.
4. We do not fork or patch Pi and do not adopt omp wholesale.

Add commands and tools to `packages/harness/extensions/`. Put Carl Code's core
identity in `packages/harness/system/`, reusable guidance in
`packages/harness/skills/`, prompts in `packages/harness/prompts/`, and themes in
`packages/harness/themes/`.

## Maintaining repository docs

Keep these three sources consistent and at the right level:

- **ARCHITECTURE.md** — the stable contract and consequences of accepted
  decisions, with links to decision records. It contains no process, rationale,
  or roadmap.
- **docs/decisions/XXXXXXXX-title.md** — one numbered record per decision with
  Context, Decision, Consequences, and a Revisit trigger when relevant. When
  behavior changes, update the relevant decision first, then ARCHITECTURE.md.
- **README.md** — the only home for the roadmap, todo list, and completed list.

When architecture or behavior changes, update the decision record, then
ARCHITECTURE.md, then the README roadmap if the work status changed.

Keep the README installed package list in sync with the global install at
`~/.pi/agent/npm/node_modules` when a pi package is added or removed.
