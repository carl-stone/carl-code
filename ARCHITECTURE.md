# Architecture

The architecture we commit to. This is the stable contract. It changes rarely.
Decisions and rationale live in [docs/decisions/](docs/decisions/) and are cited
where relevant. Roadmap and todo items live in [README.md](README.md), not here.

## Stack

- **Base engine:** stock `@earendil-works/pi-coding-agent` as an exact dependency,
  not a fork (decision [0001](docs/decisions/0001-base-stock-pi-no-fork.md)).
- **Runtime upgrades:** grouped exact Pi dependency bumps, staged installation
  and offline checks before explicit application. Uncommitted work is preserved;
  rollback restores only dependency files from the pre-upgrade working state.
  No startup or Pi self-updates; package and model updates are independent
  (decision [0007](docs/decisions/0007-carl-code-pi-distribution.md)).
- **Upgrade proposals:** scheduled/manual CI tests npm's latest stable Pi before
  opening a grouped dependency-only PR. Test execution and PR writing use
  separate jobs; merges remain manual (decision
  [0007](docs/decisions/0007-carl-code-pi-distribution.md)).
- **Product layer:** a thin Carl Code distribution that calls Pi's public CLI
  entry point, plus a Pi package containing extensions, skills, prompts, and
  themes (decision [0007](docs/decisions/0007-carl-code-pi-distribution.md)).
- **Interface:** the Pi TUI with launcher level Carl Code header and title,
  launched through the `carl` command. A
  separate GUI is deferred (decision
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
├── bin/                          ← carl executable, state setup, and TUI branding
├── packages/
│   └── harness/
│       ├── extensions/           ← agent behavior
│       ├── system/               ← Carl Code identity and core instructions
│       ├── skills/
│       ├── prompts/
│       └── themes/
├── docs/decisions/               ← architecture decision records
├── AGENTS.md                     ← repository instructions
└── package.json                  ← distribution manifest and pinned Pi dependency
```

## Runtime state

```
~/.carl-code/
├── agent/                        ← auth, settings, packages, models, and prompt override
└── sessions/                     ← Carl Code session history
```

The launcher sets Pi's documented agent and session directory overrides before
importing Pi. On first launch it may seed `auth.json` from `~/.pi/agent`, but it
does not copy settings or sessions. Plain Pi remains independent.

The repository `packages/harness/system/SYSTEM.md` is the default Carl Code
prompt. A machine local `agent/SYSTEM.md` takes precedence when present and can
be managed with `/system-prompt`.

## Invariants

- Carl Code owns its identity, purpose, command, resources, and state. Pi remains
  the stock underlying engine.
- The Pi TUI is the only supported interface. There is no separate GUI or
  interface projection layer.
- Extensions are code; skills are guidance. Harness resources live in
  `packages/harness/` or arrive through an installed Pi package.
- Features use the documented Pi CLI, SDK, extension, and package surfaces. We
  do not patch or fork Pi and do not adopt omp wholesale.
- Shared project configuration remains in `.pi/`. Carl specific project
  resources may also live in `.carl-code/` (decision
  [0008](docs/decisions/0008-dual-project-resource-roots.md)). Machine state
  under `~/.carl-code/` is not versioned.

## Scope boundary

Everything we build lives in the Carl Code launcher and Pi extension and package
surfaces. Agent core and Rust native capabilities such as LSP, DAP, embedded
bash, tree sitter edits, hashline at depth, and TTSR stream rules are out of
scope unless a decision reopens them (decision
[0003](docs/decisions/0003-defer-core-rust-omp-features.md)).

A separate desktop, web, or messaging interface is also out of scope until the
harness is mature and the TUI cannot meet a clear need (decision
[0004](docs/decisions/0004-desktop-gui-tauri-sdk-sidecar.md)). Any future
interface must reuse the same Carl Code identity and behavior.
