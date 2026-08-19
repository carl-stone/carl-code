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
1. ✅ **Permission/safety gate** — `packages/harness/extensions/permission-gate.ts`.
   Blocks destructive & irreversible bash (rm -rf, mkfs, dd→/dev, force-push,
   reset --hard); does NOT block insecure-but-recoverable commands (chmod, sudo).
   Also guards writes to machine-critical paths. Prompts via `tool_call`; config
   in `~/.pi/agent/permission-gate.json`. Verified end-to-end.
2. ✅ **Todo tool** — via `@juicesharp/rpiv-todo` (installed).
3. 🧷 **Memory** — `retain` / `recall` / `reflect` tools. **PINNED**: not sure it's wanted; revisit before committing to an integration.
4. ✅ **Subagent runner** — via `pi-subagents` (installed).
5. ⬜ **`/review`** — reviewer subagents over uncommitted changes (reuse #4)
6. ✅ **Marked done** — superseded by `unified-edit` extension (row-anchored fuzzy
   edits via public API; installed in harness). Original omp-hashline spike not needed.
7. ⬜ Decide on porting omp skills/templates as `.md` (semantic-compression, etc.)
8. ✅ **In-session package config** — `packages/harness/extensions/packages.ts`.
   `/packages` opens a TUI to enable/disable each package's bundled resources
   (extensions, skills, prompts, themes) — the same view `pi config` shows —
   plus a package-wide "All" toggle and auto-`/reload` on change. Tab switches
   global/project scope when the project is trusted. Decision 0006.
9. ✅ **Paperclip literature access** — `packages/harness/extensions/paperclip.ts`.
   Wraps the Paperclip CLI as a `paperclip` tool: search, read/grep, map (parallel
   AI readers), reduce, sql, and figure analysis over 11M+ papers, FDA docs, trials,
   and bio databases (UniProt, PDB, ChEMBL). Spawns the binary directly to inject
   the API key from env or `~/.paperclip/api_key`. Decision 0005. Verified
   end-to-end (search → map).
10. ✅ **Context guard** — `packages/harness/extensions/context-guard.ts`.
    `/ctxmax` sets a custom max-context auto-compact limit; a footer widget shows
    current context usage vs. the limit (tokens + %). Config persists in
    `~/.pi/agent/context-guard.json`.

Other installed third-party packages:
- `@juicesharp/rpiv-ask-user-question` — structured questionnaire (typed options)
- `@juicesharp/rpiv-btw`
- `pi-subagents` — subagent runner
- `pi-web-access` — web search/fetch (decision 0002)
- `@ff-labs/pi-fff` — FFF-powered fuzzy file & content search (fffind / ffgrep)
 - `@juicesharp/rpiv-todo` — todo list tool
 - `@juicesharp/rpiv-config` — package config
 - `pi-subagents` — subagent runner
 - `pi-web-access` — web search/fetch (decision 0002)
 - `@ff-labs/pi-fff` — FFF-powered fuzzy file & content search (fffind / ffgrep)
