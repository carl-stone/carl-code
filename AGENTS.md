# Instructions for agents

## Project overview

This is a pi package for developing and tracking Carl's personal agent harness,
Carl Code. While named Carl Code, it supports more than coding. Carl is a
computational biologist, not a software engineer.

Ask questions to understand the desired behavior, but make reasonable software
engineering choices about architecture and conventions.

## Repository map

- `packages/harness/` — the pi package with extensions, skills, prompts, and
  themes. This is what pi loads.
- `docs/decisions/` — architecture decision records.
- `ARCHITECTURE.md` — the stable architecture contract.
- `README.md` — setup, current features, and roadmap.

## Architecture invariants

1. The pi TUI is the only supported interface. Do not add a GUI, sidecar, or
   separate interface unless decision 0004 is reopened first.
2. Agent behavior lives in `packages/harness/` or an installed pi package.
3. We do not fork pi or adopt omp wholesale.

Add commands and tools to `packages/harness/extensions/`. Add agent guidance to
`packages/harness/skills/`, prompts to `packages/harness/prompts/`, and themes to
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
