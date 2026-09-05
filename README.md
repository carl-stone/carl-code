# Carl Code

Carl's personal agent for computational biology, science, practical software,
learning, and general assistance. Carl Code is a thin distribution built on the
stock Pi runtime. It owns its command, identity, behavior, resources, and local
state without copying or patching Pi.

## Set up

Requirements: Node 22 or newer and Bun.

```bash
bun install
chmod +x bin/carl.mjs
mkdir -p ~/.local/bin
ln -sf "$PWD/bin/carl.mjs" ~/.local/bin/carl
```

Start Carl Code from any directory:

```bash
carl
```

The first launch creates:

```text
~/.carl-code/
├── agent/
└── sessions/
```

If `~/.pi/agent/auth.json` exists and Carl Code has no authentication file, the
launcher copies it once. Existing settings, packages, and sessions are not
copied. Fresh settings select `openai-codex/gpt-5.6-sol` with high reasoning;
change this through `/model` or `~/.carl-code/agent/settings.json`. Plain `pi`
remains independent.

Set `CARL_CODE_HOME` before launching to use a different state root.

## Behavior

Carl Code adjusts its depth to the work:

- Scientific work favors complete inspectability, reproducibility, provenance,
  explicit assumptions, and exact explanations of code and data changes.
- Practical software favors a reliable result and a useful conceptual
  walkthrough without unnecessary implementation detail.
- General assistance uses only connections that really exist and asks before
  consequential external actions.

The editable core instructions live in
[`packages/harness/system/SYSTEM.md`](packages/harness/system/SYSTEM.md). The
identity extension preserves Pi's generated tool guidance, project context,
skills, and working directory.

Run `/system-prompt` or `/system-prompt show` to view the complete assembled
prompt, including dynamic Pi context. Use `/system-prompt edit` to edit the
current Carl Code instructions, `/system-prompt replace` to start a replacement
from an empty editor, or `/system-prompt reset` to restore the repository
default. Local edits are stored at `~/.carl-code/agent/SYSTEM.md` and are not
versioned. The viewer has scroll controls plus shortcuts to edit, replace,
reset, or close.

## Project resources

Carl Code loads normal `.pi/` project resources and also recognizes a Carl
specific `.carl-code/` root:

```text
.carl-code/
├── extensions/
├── skills/
├── prompts/
├── themes/
├── SYSTEM.md
└── APPEND_SYSTEM.md
```

The resource directories follow Pi's package discovery rules, including an
optional `package.json` Pi manifest. One project trust decision covers both
roots. Shared resources can remain in `.pi/`; resources intended only for Carl
Code can live in `.carl-code/`.

`.carl-code/settings.json` is not loaded. Carl specific resources are startup
resources and do not appear in `/packages`; use `.pi/settings.json` or
`~/.carl-code/agent/settings.json` for managed resource configuration.

## Verify

```bash
carl --version
carl auth check --provider openai-codex
```

## Controlled Pi upgrades

Keep Pi pinned; do not use its self-updater for Carl Code. Choose an exact
stable version after reviewing upstream release notes. Both Pi dependencies
are upgraded together.
The GitHub Actions workflow in `.github/workflows/compatibility.yml` runs the
offline suite on pushes and pull requests once committed and pushed; it does
not automatically propose or merge upgrades.

```bash
bun run test
bun run update-pi <version>          # preview only; active Pi does NOT change
bun run update-pi <version> --apply  # test, then install in this checkout
bun run update-pi --rollback        # undo last applied dependency upgrade only
```

Uncommitted work is fine. The updater never resets Git, discards source changes,
or commits anything. Preview installs only into a temporary copy and ends with
`NOT APPLIED`; no rollback is needed. Installation/test chatter and dependency
diffs go into the printed log directory rather than looking like a live update.

`--apply` tests a temporary copy first, then snapshots your **current**
`package.json` and `bun.lock` (including uncommitted infrastructure) into ignored
`.upgrade-backups/` before replacing those two files and installing dependencies.
It refuses to overwrite dependency files edited while staging. Failed installs
or checks restore the snapshots and attempt to reinstall the prior dependencies.
If another process edits the files during application, it stops rather than
overwriting that work. Avoid simultaneous edits/upgrades while applying.

`--rollback` restores those dependency snapshots, never a Git commit. Your
launcher, update tools, and other source files stay intact. If you have edited
either dependency file since upgrading, rollback refuses rather than destroying
those edits. Recovery records remain in `.upgrade-backups/` for manual recovery.

Candidate copying excludes Git, dependencies, project state roots, and recovery
records. Installation requires network access and uses normal Bun behavior;
it is not a security sandbox. Restart Carl Code after an applied upgrade.

Offline tests run with temporary home/state directories and no API calls.
They check exact matching versions, launcher imports/help/version, blocked
self-updates, extension loading and resource-loader reload, prompt identity
and context preservation, tool registration, and existing wake-channel tests.
They do **not** prove interactive reload, TUI rendering, provider behavior,
session migration compatibility, or complete project-resource discovery.

Before applying, launch the printed candidate from a disposable working
directory with isolated state:

```bash
candidate=/path/printed/by/updater/candidate
canary=$(mktemp -d)
mkdir -p "$canary/home" "$canary/work"
(cd "$canary/work" && HOME="$canary/home" CARL_CODE_HOME="$canary/state" node "$candidate/bin/carl.mjs")
```

The canary intentionally starts without real credentials or installed packages.
Authenticate explicitly if testing a provider. Check the header/title,
`/system-prompt`, `/reload`, trusted and untrusted `.pi/`/`.carl-code/` fixtures,
a harmless file-read tool call followed by another turn, and resume of a
disposable session. Also test copies of your actual package configuration and
a representative session before relying on a new version. Keep credentials
out of Git and remove temporary canary state when finished.

Before first use with real state, close Carl Code and make a private backup of
`~/.carl-code`. A runtime downgrade alone cannot undo state migrations.
Use `bun run update-pi --rollback` to undo the dependency update. This does not
restore runtime state. Restore backed-up state only if needed, taking care not
to discard new sessions. Applied changes remain uncommitted for review.

`carl update` and self-update combinations are blocked. Use
`carl update --extensions` or `carl update --models` for those independent
updates; they do not change the pinned runtime. There are no automatic updates
or scheduled update checks.

## Structure

```text
bin/carl.mjs               ← launcher, state setup, header, and terminal title
packages/harness/          ← extensions, system instructions, skills, prompts, themes
docs/decisions/            ← architecture decision records
ARCHITECTURE.md             ← stable architecture contract
```

## Design notes

- Pi is an exact dependency and the underlying runtime, not Carl Code's
  identity.
- The Pi TUI is the only supported interface for now.
- Shared project configuration remains in `.pi/`; Carl specific resources may
  live in `.carl-code/`.
- Machine state under `~/.carl-code/` is not versioned.
- See [ARCHITECTURE.md](ARCHITECTURE.md) and
  [decision 0007](docs/decisions/0007-carl-code-pi-distribution.md).

## Roadmap

This is the single source of truth for planned and completed work.

### Distribution

1. ✅ **Carl launcher** — `carl` calls the pinned stock Pi entry point.
2. ✅ **Independent state** — authentication is seeded once; settings and
   sessions start clean under `~/.carl-code/`.
3. ✅ **Carl identity** — editable core instructions distinguish scientific,
   practical software, learning, and general assistance work.
4. ✅ **System prompt viewer and editor** — `/system-prompt` shows the complete
   prompt; explicit actions edit, replace, or reset the local instructions.
5. ✅ **TUI branding** — launcher level Carl Code header and terminal title,
   without a harness branding extension.
6. ✅ **Controlled runtime upgrades and offline smoke checks** — staged grouped
   dependency bumps, preservation of uncommitted work, dependency-only rollback,
   and checks for
   launch, identity, extension loading, and resource-loader reload.
   ⬜ Extend coverage to interactive reload, project-resource discovery, TUI
   rendering, and provider/tool continuation; use the manual canary meanwhile.
7. ⬜ **Persistent access** — consider a hosted service and messaging interface
   after the core agent behavior is mature.

### Harness

1. ✅ **Todo tool** — provided by `@juicesharp/rpiv-todo` in plain Pi.
2. 🧷 **Memory** — `retain`, `recall`, and `reflect` tools. Pinned because the
   value is uncertain; revisit before choosing an integration.
3. ✅ **Subagent runner** — provided by `pi-subagents` in plain Pi.
4. ⬜ **`/review`** — reviewer subagents over uncommitted changes.
5. ✅ **Unified edit** — row anchored fuzzy edits through
   `packages/harness/extensions/unified-edit.ts`.
6. ⬜ Decide whether to port omp skills and templates as Markdown.
7. ✅ **Package configuration** — `/packages` enables or disables package
   resources and reloads them. Decision 0006.
8. ✅ **Paperclip literature access** — search, read, map, reduce, query, and
   figure analysis over papers, regulatory documents, trials, and biological
   databases. Decision 0005.
9. ✅ **Carl project resources** — discover extensions, skills, prompts, themes,
   and prompt files from `.carl-code/` alongside stock `.pi/` resources.
   Decision 0008.

Plain Pi currently has these third party packages installed. Carl Code does not
inherit them automatically:

- `@juicesharp/rpiv-ask-user-question` — structured questions with typed options
- `@juicesharp/rpiv-btw`
- `@juicesharp/rpiv-todo` — todo list tool
- `@ff-labs/pi-fff` — fuzzy file and content search
- `pi-subagents` — subagent runner
- `pi-web-access` — web search and fetch, decision 0002
