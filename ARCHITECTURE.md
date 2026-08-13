# Architecture

The architecture we commit to. This is the stable contract — it changes rarely.
Decisions and rationale live in [docs/decisions/](docs/decisions/) and are cited
where relevant. Roadmap/todo lives in [README.md](README.md), not here.

## Stack

- **Base engine:** stock `@earendil-works/pi-coding-agent` (lean, TypeScript, MIT),
  taken as a pinned dependency — not forked (decision
  [0001](docs/decisions/0001-base-stock-pi-no-fork.md)).
- **Product layer:** a Bun-workspace **monorepo** (`carl-code`) holding the
  harness package, an agent sidecar, and a desktop GUI (decision
  [0004](docs/decisions/0004-desktop-gui-tauri-sdk-sidecar.md)).
- **Web/search/fetch:** the `pi-web-access` package (decision
  [0002](docs/decisions/0002-web-search-pi-web-access.md)).

## Component layout

```
carl-code/                       ← Bun-workspace monorepo root
├── apps/
│   └── gui/                     ← Tauri 2 desktop shell (THIN; no Rust logic)
│       ├── src/                 ← React + TS + Vite frontend (renders a projection)
│       └── src-tauri/           ← Rust: launches/manages sidecar, relays JSONL
├── packages/
│   ├── harness/                 ← the pi package (extensions, skills, prompts, themes)
│   ├── sidecar/                 ← Bun/Node TS agent host (embeds pi SDK)
│   └── shared/                  ← typed JSON IPC protocol (contract)
├── docs/decisions/              ← ADRs
├── AGENTS.md                    ← authoring/maintenance instructions for this repo
└── package.json                 ← workspace manifest (bun workspaces)
```

## Invariants

- **The agent sidecar is the source of truth** for session/agent state; the GUI
  only renders a projection of it. The GUI never touches pi directly.
- **Rust is a thin relay only** — it launches the sidecar and relays JSONL over
  stdio. No application logic in Rust.
- Extensions are the code; skills are the guidance. Extensions live in
  `packages/harness/extensions/` (or ship via a package).
- `~/.pi/` (settings, auth, sessions, caches) is machine-local and **not**
  versioned. Only what we write lives in the repo.
- Features are added via the extension surface; we do **not** fork the engine and
  do **not** adopt omp wholesale.

## Scope boundary

Everything we build lives in the pi extension/package surface and the GUI
projection layer. Agent-core and Rust-native capabilities (LSP, DAP, embedded
bash, tree-sitter AST edits, hashline at depth, **TTSR** stream rules) are
**out of scope** unless a decision reopens them (decision
[0003](docs/decisions/0003-defer-core-rust-omp-features.md)).

The GUI targets **behavioral parity with the TUI as it exists on this machine**
(pi 0.84.1 + carl-code + pi-web-access), not binary compatibility with arbitrary
`pi-tui` components (decision
[0004](docs/decisions/0004-desktop-gui-tauri-sdk-sidecar.md)).
