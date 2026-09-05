# 0008 — Dual project resource roots

- **Status:** Accepted
- **Date:** 2026-09-03

## Context

Carl uses plain Pi and Carl Code in some of the same projects. Resources that
work in both should live in `.pi/`, while resources intended only for Carl Code
need a separate project location. Pi supports one project configuration root,
`.pi/`, and its public `main()` API does not accept a second managed project
root.

Loading `.carl-code` extensions as ordinary command line extensions without a
trust check would allow project code to execute before Carl approves the
project.

## Decision

Carl Code discovers both stock Pi resources and Carl specific project
resources:

- Pi continues to discover `.pi/` normally.
- The launcher treats `.carl-code/` as a local Pi package resource root. It uses
  Pi's package resolver, including package manifests and the conventional
  `extensions/`, `skills/`, `prompts/`, and `themes/` directories.
- `.carl-code/SYSTEM.md` and `.carl-code/APPEND_SYSTEM.md` follow the equivalent
  Pi prompt file behavior. A Carl specific `SYSTEM.md` takes precedence over
  `.pi/SYSTEM.md`; an explicit command line prompt takes precedence over both.
- The same project trust decision covers `.pi/` and `.carl-code/`. Carl Code
  checks its trust store before passing Carl specific resources to Pi. An
  unknown project follows `defaultProjectTrust`; interactive runs ask, while
  other modes skip resources unless the default or a command line override
  permits them.
- `.carl-code/settings.json` is not a second settings layer. Package installation
  and resource filters remain managed by Pi through `.pi/settings.json` or the
  Carl Code global settings file.

## Consequences

- Shared project resources can remain in `.pi/`; Carl specific or incompatible
  resources can live in `.carl-code/`.
- Carl Code does not patch or fork Pi.
- Carl specific resources are supplied through Pi's documented temporary
  resource path mechanism. They are discovered on startup but are not managed
  by Pi's project settings selector.
- Project trust is stored in `~/.carl-code/agent/trust.json`, independently of
  plain Pi's trust store.
- A session resumed into a different working directory may need a fresh Carl
  Code launch for that directory's `.carl-code/` resources to be selected.

## Revisit trigger

Replace the launcher integration if Pi adds public support for multiple managed
project resource roots or a resource loader hook in `main()`.
