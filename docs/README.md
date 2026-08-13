# Docs

- [ARCHITECTURE.md](../ARCHITECTURE.md) — the architecture we commit to (stable).
- [decisions/](decisions/) — numbered decision records (ADR-style), cited from
  ARCHITECTURE.md.
- Roadmap: see **README.md** (single source).

## Docs policy

- **ARCHITECTURE.md** is the stable contract: what the architecture *is*, and
  consequences *of decisions* with citations. It should change rarely. Do not put
  process, rationale, evaluations, or a roadmap in it.
- **decisions/XXXXXXXX-title.md** — one file per decision. Number sequentially.
  Each decision: Context → Decision → Consequences (→ Revisit trigger).
- **Roadmap/todo lives in README.md only** — never in ARCHITECTURE.md.
- When you change behavior, first update/reopen the relevant decision file, then
  update ARCHITECTURE.md to match.