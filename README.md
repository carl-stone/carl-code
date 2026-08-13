# carl-code

Carl's personal agent harness, built on top of pi. A **Bun-workspace monorepo**
holding three things:

1. **`packages/harness`** — a pi package (extensions, skills, prompts, themes),
   the "behavior" of the harness. Installs into pi globally so it loads in every
   TUI session.
2. **`packages/sidecar`** — a Bun/Node TS agent host. Embeds pi via the SDK and
   talks JSONL IPC.
3. **`apps/gui`** — a Tauri 2 desktop shell + React/TS/Vite frontend that renders
   a projection of the sidecar's state.

Shared typed IPC protocol lives in `packages/shared`.

## Install the harness (TUI)

```bash
pi install /Users/carlstone/carl-code/packages/harness
```

(`pi install` writes the package path into `~/.pi/agent/settings.json` under
`packages`, loading it in every session. Because `carl-code` is a monorepo, the
harness package install path is now `…/packages/harness`.)

On a new machine:

```bash
pi install git:github.com/carlstone/carl-code  # then adjust path to packages/harness
```

## Verify (TUI)

After installing, in any pi session:

- Run the command: `/carl`
- Or ask the agent to call the tool: `carl_hello`

## Structure

```
apps/gui/            ← Tauri 2 desktop shell (thin) + React/TS/Vite frontend
packages/harness/    ← the pi package: extensions/, skills/, prompts/, themes/
packages/sidecar/    ← Bun/Node agent host embedding the pi SDK
packages/shared/     ← typed JSON IPC protocol
docs/                ← stable architecture (../ARCHITECTURE.md) + ADRs (decisions/)
```

## Design notes

- **Extensions are the code; skills are the guidance.** Extensions live in
  `packages/harness/extensions/`. GUI extensions mirror the machine's TUI
  extensions as react components projecting sidecar state.
- `~/.pi/` (settings, auth, sessions, caches) is intentionally **not** versioned —
  it's machine-local. Only what we write lives here.
- See [ARCHITECTURE.md](ARCHITECTURE.md) for the stable contract and
  [docs/decisions/](docs/decisions/) for decision records.

## Developing the GUI

Prereqs: `bun`, Rust (`cargo`), and the Tauri system deps for macOS (Xcode CLT).

```bash
bun install                    # install workspace deps
bun run --cwd apps/gui tauri dev   # launch the desktop app (builds Rust + sidecar)
```

The GUI launches the sidecar automatically (thin Rust relay over stdio JSONL).

## Roadmap

Single source of truth for todo — keep only here, not in ARCHITECTURE.md.

### Harness (TUI extensions)
1. ⬜ **Permission/safety gate** (spawn from pi's `permission-gate.ts` example)
2. ⬜ **Todo tool + `/todos` command** (pi example; state persisted via details)
3. ⬜ **Memory** — `retain` / `recall` / `reflect` tools, JSON file in `~/.pi`
4. ⬜ **Subagent runner** — port pi's `subagent/` example; a `task`-like tool + `/hub`
5. ⬜ **`/review`** — reviewer subagents over uncommitted changes (reuse #4)
6. ⬜ **hash-anchored `edit`** — spike tool-override with omp's hashline (optional)
7. ⬜ Decide on porting omp skills/templates as `.md` (semantic-compression, etc.)

### GUI (desktop app) — 🧷 PAUSED

Scaffolded and verified runnable (Tauri window boots, sidecar child created a
persisted `AgentSession`, no errors). **Put on hold** while we focus on the
harness itself; revisit later with clearer requirements.

Status: working v1 scaffold. Known rough edges to tackle on return: markdown
rendering (raw text now), thinking toggle, tool-card diffs, mid-stream
steer/follow-up, model/abort controls, session tree, GUI mirrors of harness
commands. The environment was verified headless; manual run is
`bun run --cwd apps/gui tauri dev`.

- v1 ✅ **chat projection** — streaming messages, tool events, composer, status bar, session create
- ⬜ markdown rendering of assistant messages (marked)
- ⬜ thinking-token rendering + toggle
- ⬜ tool cards: collapsible output + diff view
- ⬜ steer / follow-up queueing controls
- ⬜ model / thinking-level selectors, abort button
- ⬜ session tree, fork, resume
- ⬜ `/` command palette + GUI mirrors of harness commands
- ⬜ GUI status widget mirroring `context-guard` footer status

### Non-goals
- Forking pi or omp
- Rust-core features (LSP, DAP, embedded bash, AST, deep hashline) —
  see decision [0003](docs/decisions/0003-defer-core-rust-omp-features.md)
- Adopting omp wholesale — we add to a lean base instead
