# Architecture

The architecture we commit to. This is the stable contract — it changes rarely.
Decisions and rationale live in [docs/decisions/](docs/decisions/) and are cited
where relevant. Roadmap/todo lives in [README.md](README.md), not here.

## Stack

- **Base engine:** stock `@earendil-works/pi-coding-agent` (lean, TypeScript, MIT),
  taken as a pinned dependency — not forked (decision [0001](docs/decisions/0001-base-stock-pi-no-fork.md)).
- **Product layer:** `carl-code` — a pi **package** (extensions, skills, prompts,
  themes) that composes on top of the base via the extension/package API.
- **Web/search/fetch:** the `pi-web-access` package, not built-in-house (decision
  [0002](docs/decisions/0002-web-search-pi-web-access.md)).

## Component layout

```
carl-code/
├── package.json   ← pi manifest (declares ./extensions); pinned pi engine
├── extensions/    ← imperative behavior (registerTool / registerCommand / on …)
├── skills/        ← SKILL.md instruction folders
├── prompts/       ← /template prompt templates
├── themes/        ← json themes
├── docs/decisions/ ← decision records (ADRs)
└── AGENTS.md      ← authoring/maintenance instructions for this repo
```

## Invariants

- Extensions are the code; skills are the guidance. Extensions must live in
  `extensions/` (or ship via a package).
- `~/.pi/` (settings, auth, sessions, caches) is machine-local and **not**
  versioned. Only what we write lives in the repo.
- Features are added via the extension surface; we do **not** fork the engine and
  do **not** adopt omp wholesale.

## Scope boundary

Everything we build lives in the pi extension/package surface. Agent-core and
Rust-native capabilities (LSP, DAP, embedded bash, tree-sitter AST edits,
hashline at depth, **TTSR** stream rules) are **out of scope** unless a decision
files reopens them (decision [0003](docs/decisions/0003-defer-core-rust-omp-features.md)).