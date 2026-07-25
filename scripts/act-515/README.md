# scripts/act-515/ — ACT-515 Engine Configs (a)-(e) Pre-Commit Bundle

**Status:** PRE-COMMIT LANDED · **Date:** 2026-07-25T05:27:07Z · **Mode:** Investigation (execution charter for a corpus-based read-only sim).

**Purpose.** This directory holds the FROZEN table shape, verdict grammar, estimator
block, and matrix definition for ACT-515 (Capped Stateful Sim, Tri-Config Leverage
Comparison) BEFORE any compute runs. Per operator ruling 2026-07-25 and INC-135/136
(anti-completion-theater, anti-post-hoc-shape-adjustment):

> **The table shape is frozen before the numbers exist.** Numbers are inserted per-config
> as chains land. Cells whose n < the pre-committed n-threshold are stamped
> `INSUFFICIENT-N` and NOT quoted as decision input. No column definition changes
> post-hoc without a filed INC and an amendment stamp.

## Files (this bundle)

| File | Role |
|---|---|
| `config-matrix.md` | The 5-row × 12-column matrix definition + regime-exit (d1/d2/d3) sub-matrix, n-thresholds, INSUFFICIENT-N rule. |
| `verdict-table-template.md` | The empty deliverable template — cells marked `PENDING` until numbers land. |
| `estimator-assumptions.md` | Leverage-cost model, fill/haircut assumptions, drawdown definition, compounding convention — all citations frozen here. |
| `compute-plan.md` | Cells × configs, est. wall time, per-config delivery order + chain plan. |

## Deferred (build turns after this pre-commit)

The tri-config sim ENGINE itself (`scripts/overshoot-backtest/engine/`) is a
`SCAFFOLD` per its own README — kernel code does not yet exist. This bundle exists so
that when the engine lands, its output slots into a frozen table, not a shape invented
post-hoc to fit the numbers.

**Sequence next turns:**

1. Engine kernel build (`engine/{types,clock,config,admit,size,margin,regime,replay,report}.ts`) with unit tests.
2. Hand-truth fixture build (see `estimator-assumptions.md` §5 — the operator's cited "2024-05-02 hand-truth fixture sha d06bd24c" is NOT present in repo; see deviation note there).
3. Layer-1 validity gate: selection-parity replay + hand-truth fixture green.
4. Per-config chains land into `verdict-table-template.md` cells one config at a time.

**END README.**