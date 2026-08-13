# carl-code

Carl's personal agent harness, built on top of pi.

This repo is a **pi package**. It bundles Carl's hand-written extensions, skills,
prompts, and themes — the "behavior" of his harness. It installs into pi globally
so it loads in every session, and it's versioned/synced here on GitHub.

## Install

```bash
pi install /Users/carlstone/carl-code
```

(`pi install` writes the package path into `~/.pi/agent/settings.json` under
`packages`, which loads it in every session.)

On a new machine you can pull this repo and install it from the git URL instead:

```bash
pi install git:github.com/carlstone/carl-code
```

## Verify

After installing, in any pi session:

- Run the command: `/carl`
- Or ask the agent to call the tool: `carl_hello`

## Structure

```
package.json        ← pi manifest (declares ./extensions)
extensions/         ← imperative behavior: pi.registerTool/Command/on(...)
skills/             ← SKILL.md instruction folders
prompts/            ← /template prompt templates
themes/             ← json theme files
```

## Design notes

- Extensions are the code; skills are the guidance. Extensions *must* live in
  `extensions/` (or a package); skills can ship here too but serve a different
  purpose.
- `~/.pi/` (settings, auth, sessions, caches) is intentionally **not** versioned —
  it's machine-local. Only what you *write* lives here.
- See [ARCHITECTURE.md](ARCHITECTURE.md) for the stable contract and
  [docs/decisions/](docs/decisions/) for decision records.

## Roadmap

Build order (single source of truth for todo — keep only here, not in
ARCHITECTURE.md):

1. ⬜ **Permission/safety gate** (spawn from pi's `permission-gate.ts` example)
2. ⬜ **Todo tool + `/todos` command** (pi example; state persisted via details)
3. ⬜ **Memory** — `retain` / `recall` / `reflect` tools, JSON file in `~/.pi`
4. ⬜ **Subagent runner** — port pi's `subagent/` example; a `task`-like tool + `/hub`
5. ⬜ **`/review`** — reviewer subagents over uncommitted changes (reuse #4)
6. ⬜ **hash-anchored `edit`** — spike tool-override with omp's hashline (optional)
7. ⬜ Decide on porting omp skills/templates as `.md` (semantic-compression, etc.)

### Built so far

- `extensions/carl-brand.ts` — `/carl` + `carl_hello` (starter/verifier)
- `extensions/context-guard.ts` — custom ctx-max auto-compact limit + live footer
  status (`ctx 43k/100k 43%`); settings in `~/.pi/agent/context-guard.json`

### Non-goals

- Forking pi or omp
- Rust-core features (LSP, DAP, embedded bash, AST, deep hashline) —
  see decision [0003](docs/decisions/0003-defer-core-rust-omp-features.md)
- Adopting omp wholesale — we add to a lean base instead
