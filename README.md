# carl-code

Carl's personal agent harness, built on top of pi. The pi package in
`packages/harness` contains the extensions, skills, prompts, and themes that
shape the agent. The pi TUI is the only supported interface.

## Install

```bash
pi install /Users/carlstone/carl-code/packages/harness
```

This writes the package path into `~/.pi/agent/settings.json`, so pi loads it in
every session.

On a new machine:

```bash
pi install git:github.com/carlstone/carl-code
```

Then set the installed package path to `packages/harness`.

## Verify

After installing, in any pi session:

- Run `/carl`.
- Or ask the agent to call `carl_hello`.

## Structure

```
packages/harness/    ← pi package: extensions, skills, prompts, themes
docs/                ← decision records and documentation index
ARCHITECTURE.md       ← stable architecture contract
```

## Design notes

- Extensions are code; skills are guidance.
- The desktop GUI, SDK sidecar, and shared interface protocol were removed to
  keep work focused on the agent. See [decision 0004](docs/decisions/0004-desktop-gui-tauri-sdk-sidecar.md).
- `~/.pi/` settings, authentication, sessions, and caches are local to the
  machine and are not versioned.
- See [ARCHITECTURE.md](ARCHITECTURE.md) for the stable contract and
  [docs/decisions/](docs/decisions/) for decision records.

## Roadmap

This is the single source of truth for planned and completed work.

### Harness

1. ✅ **Permission and safety gate** — `packages/harness/extensions/permission-gate.ts`.
   Blocks destructive and irreversible bash commands such as `rm -rf`, `mkfs`,
   writes to devices, force push, and `reset --hard`. It also guards writes to
   critical machine paths. Configuration lives in
   `~/.pi/agent/permission-gate.json`.
2. ✅ **Todo tool** — provided by `@juicesharp/rpiv-todo`.
3. 🧷 **Memory** — `retain`, `recall`, and `reflect` tools. Pinned because the
   value is uncertain; revisit before choosing an integration.
4. ✅ **Subagent runner** — provided by `pi-subagents`.
5. ⬜ **`/review`** — reviewer subagents over uncommitted changes.
6. ✅ **Unified edit** — row anchored fuzzy edits through
   `packages/harness/extensions/unified-edit.ts`.
7. ⬜ Decide whether to port omp skills and templates as Markdown.
8. ✅ **Package configuration** — `/packages` enables or disables package
   resources and reloads them. Decision 0006.
9. ✅ **Paperclip literature access** — search, read, map, reduce, query, and
   figure analysis over papers, regulatory documents, trials, and biological
   databases. Decision 0005.
10. ✅ **Context guard** — `/ctxmax` sets an automatic compaction limit and a
    footer widget reports context use. Configuration lives in
    `~/.pi/agent/context-guard.json`.

Other installed third party packages:

- `@juicesharp/rpiv-ask-user-question` — structured questions with typed options
- `@juicesharp/rpiv-btw`
- `@juicesharp/rpiv-config` — package configuration
- `@juicesharp/rpiv-todo` — todo list tool
- `@ff-labs/pi-fff` — fuzzy file and content search
- `pi-subagents` — subagent runner
- `pi-web-access` — web search and fetch, decision 0002
