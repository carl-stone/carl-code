# carl-code

Carl's personal agent harness, built on top of pi (the oh-my-pi coding agent).

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
