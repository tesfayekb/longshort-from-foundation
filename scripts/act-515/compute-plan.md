# ACT-515 Compute Plan — RUNTIME HONESTY

**Frozen:** 2026-07-25T05:27:07Z. Per operator instruction §3: state the compute plan
up front (cells × configs, est. wall time); if it exceeds a turn, deliver per-config
with chains as they land — never a summary awaiting verification.

## 1. Current engine state (verified this turn)

`scripts/overshoot-backtest/` is a **SCAFFOLD** per its own README (2026-07-14):

- `engine/` — NOT PRESENT. No `types.ts`, `clock.ts`, `admit.ts`, `size.ts`, `margin.ts`, `regime.ts`, `replay.ts`, `report.ts` files exist. Only `README.md` lists the intended layout.
- `fixtures/validation-2023-Q2/` — NOT PRESENT.
- `run.ts` — NOT PRESENT.
- `tests/` — NOT PRESENT.

**Implication:** ACT-515 configs (a)-(e) cannot compute this turn because the
deterministic replay engine required to produce the numbers **does not exist in code**.
What CAN land this turn is the frozen table shape + verdict grammar + estimator block +
this compute plan — which is exactly the pre-commit the operator ordered (§1 of
instruction) and which INC-135/136 require BEFORE numbers exist.

## 2. Cells × configs count

**Primary matrix (verdict-table-template.md §1):** 5 rows × 12 cols = **60 cells**
(minus 8 by-construction zeros for R1/R2/R5 on C9/C10 and 2 n/a on R5 C11/C12 = **50 cells to compute**).

**Five-deepest-DDs (§2):** 5 rows × 5 DDs × 9 cols = **225 cells**.

**2022-H2 monthly (§3):** 7 rows × 5 cols = **35 cells**.

**Regime-exit per-event (§4):** 2 events × 3 mechanisms × 6 metrics = **36 cells**.

**Verdict summary (§6):** 3 mechanisms × 5 cols = **15 cells**.

**TOTAL cells:** ~361 cells across the full deliverable. Each computed exactly once per
config chain — no re-computation, no post-hoc adjustment.

## 3. Compute-time estimate (once engine exists)

**Corpus size:** 1,011 trading days × ~380 events/day peak × 5 configs = ~1.9M lot-days
of replay per full sweep. On a single-threaded deterministic replay kernel this is
minutes-of-order, not hours — the bottleneck is engine correctness (Layer-1 validity
gate), not wall time.

**Estimated turn budget once engine lands:**

| Chain | Deliverable | Est. wall time (compute) | Est. turns |
|---|---|---|---|
| C0 — Layer-1 validity | selection-parity replay green + hand-truth fixture green (see §5 Blockers B1) | 5–15 min | 1 turn (or 2 if fixture needs building) |
| C1 — R1 `1x-const` full sweep + §2 DDs + §3 monthly | Primary matrix R1 populated | 2–5 min | 1 turn |
| C2 — R2 `1x-comp` | Primary matrix R2 populated | 2–5 min | 1 turn |
| C3 — R3 `2x-const` incl. margin ledger | Primary matrix R3 populated (C9/C10 live) | 3–7 min | 1 turn |
| C4 — R4 `2x-comp` incl. margin ledger | Primary matrix R4 populated (Phase-L primary input) | 3–7 min | 1 turn |
| C5 — R5 `spy-bh` benchmark | Primary matrix R5 populated | <1 min | can fold into C1 turn |
| C6 — Regime-exit d1/d2/d3 per-event (§4) | 6 event×mechanism blocks | 5–10 min | 1 turn |
| C7 — Adoption verdicts (§6) + operator-read paragraphs (§7) | Deliverable close | n/a — analytical | 1 turn |

**Total once engine exists:** ~8 turns of chains-as-they-land, per-config delivery, no
premature summary. Aggregate wall-time compute is <1 hr; turn count is dominated by
per-config verification + operator-read discipline.

**Engine build itself (before any config runs):** an additional ~5–10 turns of kernel
build (types → clock → admit → size → margin → regime → replay → report), each with
unit tests, plus the hand-truth fixture build. This is a substantial multi-turn
workstream that has been chartered but not yet built.

## 4. Per-config delivery grammar

Every config chain delivers in one turn as:

1. **Chain-start line:** row ID, corpus SHA, selection-cell SHA, engine SHA, clock start/end.
2. **Cell fills:** each computed cell written into `verdict-table-template.md` (via patch), replacing `PENDING`. Un-computable cells stamp `INSUFFICIENT-N` per §5 rules.
3. **Chain-close receipt:** re-read of the affected rows, git-visible diff, and a §22.5.1-style read-back gate.

**No summary written until all chains close.** Per operator §3: "never a summary awaiting verification."

## 5. Blockers (pre-compute)

### B1 — Hand-truth fixture — **CLOSED** (INC-144)

Fixture verified PRESENT at HEAD, byte-exact sha
`d06bd24cadcb608c2525b042ec40a1db112fa6f363ac3ae288d3f4ac7ecff1a2`
(see `hand-truth-fixture-verification.md` and updated
`estimator-assumptions.md §5`). Prior "absent" claim was a
string-grep-for-a-hash fabrication — filed as INC-144 with
never-delete-class extension for `fixtures/**`. Layer-1 gate stands:
selection-parity replay green + hand-truth replay byte-exact-green
BEFORE any matrix cell computes. 2023-Q2 becomes fixture #2, built
during kernel `mark`/`equity` module bring-up.

### B2 — Sector-cap (e) — **GATED on sector-metadata ingest**

Operator ruling B2: charter amendment adds (e) sector-cap with
pre-committed levels, but evidence-first. Grep result:

| Table | Sector column? |
|---|---|
| `public.overshoot_universe` (MIG in `20260703044900_...`) | **NO** — columns are `ticker/source/added_as_of/active/timestamps` only |
| `public.universe_membership` (longshort lane) | YES — `gics_sector text` (MIG `20260605065818_...`) |

Overshoot substrate has **no sector metadata**. Amendment landed as
`charter-amendment-e-sector-cap.md`: (e) is defined with levels
{baseline uncapped, 30% notional/sector, 20% notional/sector} but its
compute is **BLOCKED on sector-metadata ingest**. Ingest source
candidates + cost documented in the amendment; no fabricated GICS
classifications will be written into the substrate. (a)–(d) proceed
independently.

### B3 — Kernel re-sequence — **ACCEPTED** (per operator ruling B3)

DEV-13 accepted. Engine kernel is a multi-turn workstream (one module
per turn: types → clock → admit → size → mark → exit → equity/DD,
each unit-tested; then both hand-truth fixtures green before the first
cell computes). It proceeds **in parallel** with SQL-only weekend
deliverables that need no engine:

1. **ACT-573 Phase-1** — refused-winners forensics (folds DEV-8 dual-side walkthrough + λ corpus rate). NOW.
2. **ACT-574** — entry-day offset grid.
3. **ACT-570 Phase-0/1**.
4. **ACT-515 matrix** — lands **mid-week**, when kernel + both fixtures go green. Register row and estimated turn count filed honestly (not "Monday").

Layer-1 validity replay (selection-parity + hand-truth) remains the
§22.5.1 read-back gate in the same turn as the first cell chain.

## 6. What lands this turn (pre-commit only)

- `scripts/act-515/README.md`
- `scripts/act-515/config-matrix.md` (frozen table shape)
- `scripts/act-515/verdict-table-template.md` (empty template, PENDING cells)
- `scripts/act-515/estimator-assumptions.md` (frozen assumptions + B1 deviation)
- `scripts/act-515/compute-plan.md` (this file)
- `scripts/act-515/hand-truth-fixture-verification.md` (B1 evidence)
- `scripts/act-515/charter-amendment-e-sector-cap.md` (B2 amendment)

**Zero numbers quoted. Zero compute run. Zero engine code touched.** Pre-commit is the
full turn deliverable, per operator §1 discipline.

## 7. What lands NEXT turn (subject to B1/B2 rulings)

Per B1/B2/B3 rulings:
- Kernel bring-up starts with `engine/types.ts` module (one turn), then
  `clock.ts`, `admit.ts`, `size.ts`, `mark.ts`, `exit.ts`,
  `equity.ts` — each with unit tests. In parallel: hand-truth fixture
  #2 (2023-Q2) built during `mark`/`equity` bring-up.
- SQL-only weekend chains (ACT-573 Phase-1 → ACT-574 → ACT-570) run
  independently and produce numeric deliverables that do NOT wait on
  the kernel.
- ACT-515 matrix computes when both fixtures green (mid-week
  expected; register row carries the honest date).

**END COMPUTE PLAN.**