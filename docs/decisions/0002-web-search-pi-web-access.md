# 0002 — Web search & fetch via the `pi-web-access` package

- **Status:** Accepted
- **Date:** 2026-08-13

## Context

omp ships a built-in `web_search` with 23 providers and site-aware extraction.
Porting that ourselves is large; building a minimal search from scratch would be
worse and under-featured.

## Decision

Use the third-party pi package **`pi-web-access`** (installed via
`pi install npm:pi-web-access`) for web search, URL fetch, GitHub repo cloning,
PDF extraction, and video understanding. It provides `web_search`, `source_check`,
`fetch_content`, `get_search_content` + curator commands.

## Consequences

- 20+ search providers out of the box via one package; config (provider selection,
  API keys) lives in `~/.pi/web-search.json` / env vars.
- A third-party dependency we pin and review (it runs with our privileges).
- We do not duplicate search in `carl-code`.