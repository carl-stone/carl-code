# 0007 — Carl Code as a thin Pi distribution

- **Status:** Accepted
- **Date:** 2026-08-31

## Context

Carl Code needs a distinct identity, purpose, command, and state directory while
retaining Pi's extension model and agent runtime. Carl uses it for computational
biology, practical software, learning, and general personal assistance.

The desired behavior depends on context. For ordinary software, Carl usually
wants a useful result and a clear conceptual walkthrough without unnecessary
implementation detail. For scientific work, he needs complete inspectability,
reproducibility, assumptions, provenance, and an exact account of what code does.

Forking Pi would provide complete branding control but create ongoing merge and
release work. A Pi package alone cannot provide a separate command and runtime
state.

## Decision

Build Carl Code as a thin distribution around the stock
`@earendil-works/pi-coding-agent` package:

- Expose a `carl` executable that calls Pi's public `main()` entry point.
- Pin the Pi package to an exact version and update it through normal dependency
  upgrades rather than copying or patching Pi source.
- Upgrade both direct Pi dependencies together to an explicitly selected stable
  version. Stage the current source in a temporary directory, install with Bun,
  and pass offline compatibility checks before applying the candidate.
- Applying requires explicit `--apply`, not a clean Git checkout. Snapshot the
  current manifest and lockfile, including uncommitted work, and refuse to apply
  if either changes during staging. Keep dependency-only rollback records in
  ignored `.upgrade-backups/`; never reset Git or auto-commit. Preview clearly
  reports that the active runtime has not changed. Pi self-update through
  `carl update` is blocked; package-only and model-only updates remain separate.
- Set `PI_CODING_AGENT_DIR` to `~/.carl-code/agent` and
  `PI_CODING_AGENT_SESSION_DIR` to `~/.carl-code/sessions` before importing Pi.
- On first launch, copy existing Pi authentication into Carl Code if Carl Code
  has no authentication file. Do not copy settings or sessions.
- Load the Carl Code extensions explicitly on every launch.
- Replace Pi's generic coding identity through an extension while preserving its
  generated tool guidance, project context, skills, and working directory.
- Keep the repository prompt as the default. `/system-prompt` and
  `/system-prompt show` display the complete assembled prompt, while its edit,
  replace, and reset actions manage a machine local override in the active
  agent directory.
- Set the Carl Code header and terminal title through a hidden launcher UI hook,
  not a harness extension or installed package.
- Keep project configuration in `.pi/` and leave the plain `pi` command and
  `~/.pi/agent` state independent.
- Do not patch Pi internals or add the synthetic package manifest branding layer
  unless remaining Pi labels become a real problem.

## Consequences

- Carl Code has its own command, identity, settings, packages, and session
  history without maintaining an agent runtime.
- The copied authentication file is a one time seed, not a live link. Later
  authentication changes remain separate.
- Carl Code starts with clean settings. Packages configured for plain Pi are not
  inherited automatically.
- System prompt edits made through the slash command are local and are not
  versioned. Resetting removes the local override and restores the repository
  default.
- The startup header and terminal title identify Carl Code. Built in help,
  errors, and documentation continue to use Pi's name.
- Pi upgrades require a dependency bump and compatibility checks for launch,
  prompt identity, extension loading, reload, and tool continuation.
- Automated smoke tests are an initial gate, not a compatibility guarantee.
  A manual isolated TUI/provider canary must check branding, reload, session
  resume, and tool continuation before adopting an upgrade for everyday use.
- A future persistent service or messaging interface must reuse this same Carl
  Code behavior rather than create a second agent definition.

## Revisit trigger

Reconsider a fork or deeper branding only if a required Carl Code behavior
cannot be implemented through Pi's documented CLI, SDK, or extension surfaces.
