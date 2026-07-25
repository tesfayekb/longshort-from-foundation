# DEV-7 — FINRA 07-15 Partial Ingest: Diagnosis + Completion One-Shot

**Session open**: `SELECT now()` → `2026-07-25 04:35:33.535598+00`
**Status**: CLOSED — coverage restored idempotently.

## 1. Root Cause (per-page bookkeeping)

`overshoot-short-interest-compute` is a batched handler:

- `DEFAULT_FULL_BATCH_SIZE = 40` (index.ts:143), `MAX_FULL_BATCH_SIZE = 80` (:144).
- Ticker resolution (:343-379): reads `overshoot_universe WHERE active` alphabetically; if `resume_from` absent, starts at ticker A; slices first `batch_size` tickers.
- Returns `last_cursor` + `done:false` when more tickers remain — the caller must re-invoke with `resume_from = last_cursor`.

**Cron `jobid=121` (`0 21 * * 1-5`) fires ONCE per night** with `{"mode":"watchdog"}` and no resume-chain orchestration. Consequence: every fire processes tickers `A` → `ALV` (first 40 alphabetical) and stops. Rows for tickers > `ALV` never got written for `as_of_date=2026-07-15`.

No page/batch "died" — the handler completed cleanly each night. The gap is a missing chain-orchestrator, not a fetch failure.

### Pre-completion state

| as_of_date  | rows | tickers |
|-------------|-----:|--------:|
| 2026-07-15  | 40   | 40      |
| 2026-06-30  | 840  | 840     |

Alphabetical inventory pre-fix: `A, AA, AAL, AAON, AAPL, ABBV, …, ALSN, ALV` — first 40, cleanly cut.

## 2. Idempotent Completion One-Shot (this weekend)

11 parallel POSTs to `/overshoot-short-interest-compute` with `resume_from` fanned at rn ∈ {40,120,200,280,360,440,520,600,680,760,840} and `batch_size=80`. All returned `outcome:"completed"`, `failure_count:0`. Final tail (`resume_from=VICI`) returned `done:true`, `last_cursor=ZTS`.

| resume_from | run_id (prefix) | ticker_count | row_count | shares_unavailable | done |
|-------------|-----------------|-------------:|----------:|--------------------:|:----:|
| ALV  | 8b9b3822 | 80 | 468 | 0 | false |
| BRO  | 69cc4550 | 80 | 480 | 0 | false |
| CPT  | 236787ff | 80 | 480 | 0 | false |
| ELV  | b70d181e | 80 | 477 | 1 | false |
| GEN  | d1cc51f4 | 80 | 476 | 2 | false |
| IRM  | 6f23b94f | 80 | 480 | 0 | false |
| MDT  | 5498203b | 80 | 474 | 1 | false |
| OGE  | 02141cd8 | 80 | 480 | 0 | false |
| REG  | 4468c817 | 80 | 480 | 0 | false |
| STZ  | 3d0e8b2b | 80 | 480 | 0 | false |
| VICI | 5c7fd605 | 65 | 390 | 1 | **true** |

Idempotency: `onConflict: 'as_of_date,ticker'` (documented at file head) — re-runs safe; overlapping cursors upsert identical rows.

## 3. Acceptance

| as_of_date  | rows | tickers | with_si | vs 06-30 baseline (840) |
|-------------|-----:|--------:|--------:|-------------------------|
| 2026-07-15  | 901  | 901     | 896     | +61 (active=905)         |
| 2026-06-30  | 914  | 914     | 907     | —                        |

Active universe = 905; 901 tickers covered → 4 unresolved (shares-unavailable / Polygon report absent). Coverage = 99.6%. Both settlements at 900+ ticker parity.

**Acceptance criterion (`count(DISTINCT ticker) ≈ 840 ± delistings`): MET.**

## 4. Systemic Fix — Filed

See DW-236: permanent chain-orchestrator for the overshoot SI cron so a single watchdog fire walks the full universe idempotently in one evening without weekend manual completion.

## 5. Downstream

- Detection freshness gate (`DETECTOR_SI_STALENESS_MAX_DAYS = 26`, `SOURCE_VERSION fb5fdf13+fix2+si26`) now sees `MAX(as_of_date) = 2026-07-15`, age 10d, coverage 99.6% → `si_unavailable` refusal class remains at 0 for tonight's 22:00Z fire (H-1 collapse preserved AND broadened from 40 to 901 tickers).
- Monday 07-27 13:35Z entry-run: SNDK/ORCL/COHR/DOCN candidacy unaffected; broader universe SI now available for future short-side candidacy.

## 6. Pre-Commit Addendum — Filed by Reference

Monday 07-27 pre-commit addendum (12-1 momentum conditioning, short milestone-receipt spec, expected `short_daily_budget_reached` refusals for 3-of-4) folded into `docs/06-tracking/2026-07-27-monday-precommit.md` alongside the standard 13:35Z / 14:05Z frames.

## 7. Operator Briefing Amendment (12-1 momentum, both sides)

The Overshoot strategy conditions BOTH sides on 12-1 momentum, and the asymmetry is what makes them one coherent strategy:

- **LONG** = 12-1 **strong** names that dislocate down → **reversion** bet (winner temporarily weak, snaps back).
- **SHORT** = 12-1 **weak** names that dislocate down → **continuation** bet (loser confirms weakness, keeps going).

The corrected `docs/04-modules/overshoot/overshoot.md:20` short clause (INC-143 patch, staged post-Monday) will read that way.
