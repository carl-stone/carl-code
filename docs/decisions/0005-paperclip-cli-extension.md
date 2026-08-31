# 0005 — Paperclip CLI as a harness extension

- **Status:** Accepted
- **Date:** 2026-08-18

## Context

Carl is a computational biologist. A core reason to have a personal agent harness
is to read, search, and synthesize the primary scientific literature (papers, FDA
regulatory docs, clinical trials, protein databases) — exactly what the Paperclip
service (https://paperclip.gxl.ai) exposes across 11M+ papers, 225K+ regulatory
documents, 1M+ clinical trials, and biological databases (UniProt, PDB, ChEMBL).

Paperclip ships a CLI (`paperclip`) plus a Python SDK and a hosted MCP server. We
need a way for the agent in a session to drive the corpus: search → read/grep →
`map` (parallel AI readers) → `reduce` (synthesize), plus SQL and figure analysis.

## Decision

Wrap the local **Paperclip CLI** as a single custom tool in the harness package:
`packages/harness/extensions/paperclip.ts`. It registers a `paperclip` tool that
takes the argv tokens that would follow `paperclip` and spawns the binary directly
via `node:child_process`.

Rationale for CLI-over-spawn rather than alternatives:

- **CLI over MCP server:** a local install gives the full command set (MCP server
  drops native CLI commands) and lets the agent compose Unix-style. The CLI is the
  source of truth for the corpus interface.
- **Direct spawn over `pi.exec`:** `pi.exec`'s `ExecOptions` has no `env` field,
  and the Paperclip CLI never persists API keys to disk. Spawning directly lets the
  extension inject `PAPERCLIP_API_KEY` into the child environment, resolved from
  the process env first, then `~/.paperclip/api_key` (chmod 600). This works in
  non-interactive sessions where no OAuth browser flow is possible.
- **One flexible argv tool over many typed subcommand tools:** the CLI surface is
  large and changes upstream; a single `args: string[]` tool keeps the harness thin
  and tracks the CLI without an enum-per-command maintenance burden. Prompt
  guidelines teach the search → map → reduce workflow and the `-s/--source`
  requirement for `search`.

Authentication is API-key only (no OAuth browser flow from the harness). The key
file is local and gitignored; it is not part of this repo.

## Consequences

- The agent gains first-class scientific-literature access as a discoverable tool
  in the system prompt (via `promptSnippet`/`promptGuidelines`), not just a skill
  it has to remember to load.
- `map`/`reduce`/`fetch`/`sync` are long-running; the tool gives them a 600s ceiling
  and forwards the abort signal for cancellation. Output is truncated to 60k chars
  to protect the context budget (the CLI truncates most commands already).
- A runtime dependency on an externally installed CLI at `~/.local/bin/paperclip`
  (installed via the Paperclip one-line installer, binary portion only; login was
  skipped because it requires a browser). The tool falls back to that absolute path
  if `paperclip` is not on PATH.
- This is a harness extension for the pi TUI.
- Revisit trigger: if Paperclip's MCP server gains feature parity and a key-header
  auth path that fits the harness better, reconsider CLI-over-spawn vs MCP.
