# 0006 — `/packages` resource config command

- **Status:** Accepted
- **Date:** 2026-08-18

## Context

The built-in `pi config` opens a TUI to enable/disable package resources
(extensions, skills, prompts, themes) by rewriting `packages` and the resource
arrays in `~/.pi/agent/settings.json`. It is only reachable from the shell, and
its component (`ConfigSelectorComponent`) is **not** exported from the pi package,
so a harness extension cannot reuse it directly.

Carl wants the same capability as a **slash command inside pi** (`/packages`), plus
a package-wide toggle that flips every resource of a package at once, and an
automatic `/reload` when the flow closes after a change so the new resource set
takes effect without a manual reload.

## Decision

Add `packages/harness/extensions/packages.ts`, registering a `/packages` command
that opens a custom TUI via `ctx.ui.custom`.

The selector mirrors the built-in `pi config` view:

- Groups packages and top-level resources by source; each group has
  Extensions/Skills/Prompts/Themes subgroups with per-item `[x]` toggles.
- Space toggles the selected row, up/down/page navigates, esc (or ctrl+c) closes.
- Tab switches between **global** and **project** scope when the project is
  trusted; writes go to the matching scope's settings. In project scope,
  inherited-global items are dimmed and read-only (only project-local resources
  are toggleable) — this is a simplification vs. the built-in's three-state
  load/unload/inherit cycle.
- A package-wide **"All"** row appears under each package group. Space on it
  flips every resource of that package at once: "all on" collapses the entry to
  plain source (string) form; "all off" sets empty arrays for all four resource
  types (which `resolve()` treats as "disable everything but stay listed").

Writes go through the public `SettingsManager` API (`setPackages`,
`setExtensionPaths`, `setSkillPaths`, `setPromptTemplatePaths`, `setThemePaths`,
and their `setProject*` variants), exactly the same patterns the built-in writes.
On close, if anything changed, the manager is flushed to disk and `ctx.reload()`
is called (the session's `reload` re-reads settings from disk, so no manual
`/reload` is needed).

Why a custom component rather than calling the built-in or reusing `pi config`:

- The built-in `ConfigSelectorComponent` is intentionally internal (not exported).
- The extension surface gives us `ctx.ui.custom`, the same theme/keybindings the
  TUI uses, and `ctx.reload()`, so the feature stays inside the harness.
- Per the repo invariant, the GUI would reach this via the sidecar + protocol,
  not by calling this component directly.

## Consequences

- `/packages` gives in-session access to enable/disable package resources with
  the same settings-file semantics as `pi config`, plus a package-wide "All"
  toggle and auto-`/reload`.
- The project-scope view is intentionally simpler than the built-in: inherited
  global items are shown but read-only; it does not create load/unload/inherit
  overrides. That richer cycle remains available in `pi config` at the shell.
- The "All off" representation (empty arrays for all four resource types) keeps
  the package visible but disabled; `resolve()` lists it with all items off, so a
  later "All" or per-item toggle can restore it.
- Non-TUI modes (print/rpc/json) notify that the command requires the interactive
  TUI and do nothing.
- Revisit trigger: if the pi package starts exporting the config selector, or we
  want the full project override cycle in-session, extend this command rather than
  reimplementing from scratch.
