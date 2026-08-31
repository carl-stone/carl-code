# Architecture

The architecture we commit to. This is the stable contract. It changes rarely.
Decisions and rationale live in [docs/decisions/](docs/decisions/) and are cited
where relevant. Roadmap and todo items live in [README.md](README.md), not here.

## Stack

- **Base engine:** stock `@earendil-works/pi-coding-agent` as a pinned dependency,
  not a fork (decision [0001](docs/decisions/0001-base-stock-pi-no-fork.md)).
- **Product layer:** a pi package containing extensions, skills, prompts, and
  themes. The pi TUI is the only supported interface (decision
  [0004](docs/decisions/0004-desktop-gui-tauri-sdk-sidecar.md)).
- **Web search and fetch:** the `pi-web-access` package (decision
  [0002](docs/decisions/0002-web-search-pi-web-access.md)).
- **Scientific literature:** the Paperclip CLI, wrapped as a harness extension
  (decision [0005](docs/decisions/0005-paperclip-cli-extension.md)).
- **Resource configuration:** `/packages`, a harness command that enables or
  disables package resources and reloads them (decision
  [0006](docs/decisions/0006-packages-resource-config-command.md)).

## Component layout

```
carl-code/
├── packages/
│   └── harness/                 ← pi package: extensions, skills, prompts, themes
├── docs/decisions/              ← architecture decision records
├── AGENTS.md                    ← repository instructions
└── package.json                 ← Bun workspace manifest
```

## Invariants

- The pi TUI is the only supported interface. There is no separate GUI, sidecar,
  or interface projection layer.
- Extensions are code; skills are guidance. Harness resources live in
  `packages/harness/` or arrive through an installed pi package.
- `~/.pi/` settings, authentication, sessions, and caches remain local to the
  machine and are not versioned.
- Features use the pi extension and package surfaces. We do not fork pi or adopt
  omp wholesale.

## Scope boundary

Everything we build lives in the pi extension and package surfaces. Agent core
and Rust native capabilities such as LSP, DAP, embedded bash, tree sitter edits,
hashline at depth, and TTSR stream rules are out of scope unless a decision
reopens them (decision
[0003](docs/decisions/0003-defer-core-rust-omp-features.md)).

A separate desktop or web interface is also out of scope until the harness is
mature and the TUI cannot meet a clear need (decision
[0004](docs/decisions/0004-desktop-gui-tauri-sdk-sidecar.md)).
