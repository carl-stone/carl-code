# 0004 — Desktop GUI: Tauri + React app, pi SDK sidecar (not RPC)

- **Status:** Accepted
- **Date:** 2026-08-13

## Context

We want a reliable, native desktop surface for the harness, built incrementally
alongside it while still evolving. Evaluated RPC mode (`pi --mode rpc`, JSONL over
stdio) vs. embedding the SDK directly. The TUI (InteractiveMode) is merely a *view*
over `AgentSession`; the engine is fully exposable via the
`@earendil-works/pi-coding-agent` SDK (events, prompt/steer/follow-up, session
tree, model/credential control, run modes).

RPC was rejected because it cannot do everything we want (arbitrary in-process
control over extensions, direct state access, deep custom UI). We embed the SDK.

## Decision

- A **Tauri 2** shell (Rust: window, native capabilities).
- **Frontend:** React + TypeScript + Vite in the webview.
- **Agent engine:** pi running the agent loop with **all existing extensions** —
  via a **Bun/Node TypeScript sidecar** that runs the pi SDK directly
  (`createAgentSession*`, event streaming). The GUI ↔ sidecar bridge can be
  custom JSON over stdio/local protocol (not pi's RPC mode).
- **Scope:** parity with the TUI *as it exists on this machine today* (see
  inventory in ARCHITECTURE.md). Not a general host for arbitrary third-party TUI
  extensions.
- **Monorepo:** `carl-code` becomes the monorepo; the GUI lives inside it.
  Existing pi package (extensions/skills/prompts/themes) stays in the repo.

## Consequences

- GUI extensions are created to mirror behavior of the current machine's TUI
  extensions (e.g. `context-guard` status widget → GUI status surface).
- TUI-specific extension UI (`ctx.ui.custom`, `ctx.ui.editor`, footer widgets)
  must be re-implemented against a webview surface where we use them.
- The pi package install path changes as the layout becomes a monorepo; update
  `~/.pi/agent/settings.json` `packages` accordingly (re-install unaffected).
- Rust toolchain becomes a new hard dependency (present but not previously required).
- Revisit if a true webview-agnostic extension host becomes a requirement
  (currently a non-goal).
