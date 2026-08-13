# Instructions for agents

## Project overview

This is a pi package for developing and tracking Carl's personal agent harness, Carl Code.
While named Carl Code, it is for much more than coding. 
Carl is a computational biologist, but he is not a software engineer.
Always ask questions to elicit more information from him on the desired *behavior* of what you are building, 
but make reasonable decisions around software engineering defaults when it comes to stacks, architecture, and coding conventions.

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
