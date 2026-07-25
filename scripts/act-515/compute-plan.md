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

### B1 — Hand-truth fixture DEVIATION (from `estimator-assumptions.md` §5)

Operator cited "2024-05-02 hand-truth fixture (sha `d06bd24c`)". Repo state:
- `d06bd24c` sha absent from every file in HEAD.
- `2024-05-02` in `selection-parity_test.ts` is an EMPTY-MAP negative-control date, not a hand-truth fixture.
- Engine README plans a `2023-Q2` validation window; not built.

**Cannot proceed to Layer-1 validity gate (C0) without operator ruling on:**
- (i) Build the 2023-Q2 hand-truth fixture as the engine README plans, then run selection-parity + fixture as the L1 gate; OR
- (ii) `d06bd24c` lives on a branch — provide branch name; OR
- (iii) Use the 2024-05-02 empty-map date as the L1 gate (trivial coverage — not recommended).

### B2 — "Sector-cap variants (d)-(e) per charter" — SCOPE CLARIFICATION

Operator instruction §2 says "(d) sector-cap variants (state the cap levels from the
charter), (e) per charter". The charter's §1 defines:
- **(a)** 1.0× baseline
- **(b)** 2.0× leverage
- **(c)** SPY buy-and-hold
- **(d)** regime-exit counterfactual (d1/d2/d3)
- **(e)** — **NOT PRESENT in charter**. Charter §1 has (a)/(b)/(c)/(d) only.

Sector-cap does NOT appear as a charter config; it is referenced in the operator's
earlier ACT-515(e) filings as a separate control (see conversation summary
"ACT-515(e) sector-cap"). This is a SCOPE DEVIATION — either:
- (i) The operator wants a NEW charter amendment adding (e) sector-cap as a config row with cap levels named; OR
- (ii) Sector-cap analysis is out-of-scope for this deliverable and lives in a companion ACT (charter as-written).

**Cannot compute (e) without operator ruling on scope + cap-level values.** Charter
amendment recommended if (i).

### B3 — Layer-1 validity re-verification prerequisite

Charter §2 of user instruction: "the engine must prove it still reproduces known truth
first." Selection-parity replay tests exist at
`supabase/functions/_shared/overshoot/detector/selection-parity_test.ts` and are the
standing Layer-1 gate. They need re-run green in the SAME turn as the first config
chain lands, per §22.5.1 read-back discipline.

## 6. What lands this turn (pre-commit only)

- `scripts/act-515/README.md`
- `scripts/act-515/config-matrix.md` (frozen table shape)
- `scripts/act-515/verdict-table-template.md` (empty template, PENDING cells)
- `scripts/act-515/estimator-assumptions.md` (frozen assumptions + B1 deviation)
- `scripts/act-515/compute-plan.md` (this file)

**Zero numbers quoted. Zero compute run. Zero engine code touched.** Pre-commit is the
full turn deliverable, per operator §1 discipline.

## 7. What lands NEXT turn (subject to B1/B2 rulings)

- If B1 ruling = (i): engine kernel build begins (`engine/types.ts` first, then
  `clock.ts`, then `admit.ts`, etc. — unit-tested per file).
- If B2 ruling = (i): charter amendment lands as `ACT-515-CHARTER-AMENDMENT-sector-cap.md`
  with cap-level values pre-committed BEFORE compute.
- If B1/B2 ruling = defer: the pre-commit bundle stands complete; the engine build
  workstream proceeds under its own tracker without ACT-515 numeric deliverable this
  weekend.

**END COMPUTE PLAN.**