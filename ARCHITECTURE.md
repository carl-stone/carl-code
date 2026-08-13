# Carl-code: Architecture & Roadmap

Status of the "what's my harness" investigation, mid-2026. Keep this updated as
features land.

## The decision (set in stone — for now)

**Base: stock `@earendil-works/pi-coding-agent` (lean, TypeScript, MIT), extended
via the extension/package API. Do NOT fork pi. Do NOT use omp as a base.**

Rationale (verified against actual omp source, not PR claims):
- pi publishes a real "add, don't strip" surface: extensions, skills, prompts,
  themes, packages, custom providers. That's the exact mental model we want.
- omp is the *same* TypeScript agent core lineage plus ~80k LoC of Rust compiled
  into a native addon (shell, grep/glob, tree-sitter AST, PTY) — built with Bazel
  on Bun. Reusing its Rust pieces means adopting that whole build, so they are
  effectively "welded to omp."
- Forking either base = owning all upstream churn forever, for a handful of changes.

## What we evaluated from omp → verdict

| omp feature | Portability | Verdict |
|---|---|---|
| `web_search` (23 providers) | pure TS/package | ✅ **Done** — `pi-web-access` installed |
| subagent fan-out (`task`) | pure TS | 🟡 Build — mirrors pi's `subagent` example |
| `/review` reviewer subagents | pure TS | 🟡 Build — reuse #5 |
| memory tools (`retain`/`recall`/`reflect`) | pure TS + store | 🟡 Build — JSON/SQLite file backend |
| `todo` / `/todos` | pure TS | 🟡 pi ships `todo.ts` example |
| hash-anchored edits (`hashline`) | TS, 1 Rust call (`diffLineRuns`, swappable) | 🟡 Feasible as `edit` tool-override; real effort (~47KB apply.ts) |
| **TTSR (time-traveling stream rules)** | **agent-core, NOT extension-portable** | ❌ **Fork-only.** Needs `AgentSession` internals (`scheduleAgentContinue`, generation counters, abort+resume). Revisit only if it becomes a hard req. |
| read-summarizing, LSP ops, DAP, embedded bash, AST edits, browser/desktop | Rust-core | ❌ Not portable via extension |

TTSR proof (omp source): `session/agent-session.ts` constructs a private
`TtsrCoordinator` and calls `this.#ttsr.checkMessageUpdate(event)` inside its own
`message_update` handler; the coordinator's host gets `agent`,
`scheduleAgentContinue`, `promptGeneration()`. None of that is exposed to pi
extensions (their `message_update` hook is read-only, no abort+resume).

## Backlog — build in this order

1. ⬜ **Permission/safety gate** (spawn from pi's `permission-gate.ts` example)
2. ⬜ **Todo list tool + `/todos` command** (pi example, state persisted via details)
3. ⬜ **Memory** — `retain` / `recall` / `reflect` tools backed by a JSON file in `~/.pi`
4. ⬜ **Subagent runner** — port pi's `subagent/` example; a `task`-like tool + `/hub`
5. ⬜ **`/review`** — reviewer subagents over uncommitted changes / a diff (reuse #4)
6. ⬜ **hash-anchored `edit`** — spike tool-override with omp's hashline (defer/optional)
7. ⬜ Decide on Pi around templates/skills (semantic-compression etc.) — prefer port-as-`.md`

## Built so far

- `extensions/carl-brand.ts` — `/carl` command + `carl_hello` tool (starter/verifier)
- `extensions/context-guard.ts` — custom ctx-max auto-compact limit + `ctx 43k/100k 43%`
  status in footer. Settings in `~/.pi/agent/context-guard.json`.

## Non-goals (explicitly deferred)

- Forking pi or omp
- Porting Rust-core features (LSP, DAP, embedded bash, AST, hashline-at-full-depth)
- Adopting omp wholesale (bloat) — we add to a lean base instead