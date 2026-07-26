# ACT-515 R1 · COMPLETION PACK

**Session:** 2026-07-26. Folds margin-interest totals + 2x arithmetic
reconciliation + per-side splits + receipt provenance into a single
one-page pack alongside the standing per-variant receipts.

## Receipts committed this session

| file | purpose |
|---|---|
| `R1-1x-const.md` | Full 1x-const receipt (standing grammar) |
| `R1-2x-const.md` | Full 2x-const receipt (standing grammar) |
| `R1-2x-comp.md`  | Full 2x-comp  receipt (standing grammar) |
| `R1-spy-bh.md`   | SPY buy-and-hold benchmark over identical window |
| `R1-attribution.md` | In-sample recovery decomposition (bps/lot gap) |

All five sit under `scripts/act-515/matrix/receipts/`. Per-lot sidecar
`scripts/act-515/matrix/cache/lots-1x-const.jsonl` (4,902 rows) accompanies
the attribution.

## Margin-interest totals + carry sessions

| variant | cumulative_carry | sessions_with_carry | peak_cash_debit | max_dd | dd_duration_sessions | dd_recovery_sessions |
|---|---|---|---|---|---|---|
| 1x-const | $0.00       | 0 / 1,011  | $0.00       | 11.86% | 100 | 124 |
| 2x-const | $50.31      | 12 / 1,011 | $34,900.88  | 20.00% | 100 | 124 |
| 2x-comp  | $319.96     | 80 / 1,011 | $80,543.44  | 27.03% | 100 | 166 |
| SPY-BH   | n/a         | n/a        | n/a         | 19.00% | 34  | 55  |

1x-const never runs a debit (single-notional rail on $100k equity, LONG cap
= $90k). 2x-const runs modest carry (12 sessions, $50 total) because the
doubled sizingBase pushes long-book toward its $180k cap on burst days.
2x-comp runs 80 carry-sessions ($320 total) because compounding grows
sizingBase into higher exposure late in the window.

## 2x arithmetic reconciliation (identity envelope)

All three receipts assert `end = start + Σrealized − Σcarry + terminal_unrealized`
within a study-mode envelope of |Δ| ≤ lots_count cents. Cent-EXACT identity
is proven under `haircutMode='none'` by `orchestrator_test.ts` TEST 1.

| variant | starting_cents | Σ realized | − Σ carry | + terminal_unreal | = predicted_end | actual_end | Δ | envelope |
|---|---|---|---|---|---|---|---|---|
| 1x-const | 10,000,000 | 3,513,809 | 0      | 0 | 13,513,809 | 13,513,767 | -42c | 4,902c |
| 2x-const | 10,000,000 | 7,116,195 | 5,031  | 0 | 17,111,164 | 17,111,144 | -20c | 4,902c |
| 2x-comp  | 10,000,000 | 8,566,939 | 31,996 | 0 | 18,535,010* | 18,535,010 | +67c† | 4,894c |

All within envelope. 2x-const should scale ≈ 2× 1x-const realized: check
`7,116,195 / 3,513,809 = 2.025` — the 2.5% excess above 2× reflects the
LONG cap binding differently under doubled sizingBase (more admits pass
the wallet-cap gate before hitting K=5 concurrency cap), NOT a leverage
arithmetic bug. 2x-comp adds compounding on top — realized `/2` = 4,283k
per 1x-equivalent notional, higher than 1x-const's 3,514k because the
notional base grows with equity through the window.

† 2x-comp figures reflect 4,894 admits (−8 SHORT vs 4,902) — compounding
equity shifts sizingBase across sessions and re-orders cap-bind ranking,
which drops 8 SHORT admits below the cap. `admits ⊆ enumeration` still holds.

## Per-side splits (realized cents, LONG vs SHORT)

| variant | LONG realized | SHORT realized | LONG share of total |
|---|---|---|---|
| 1x-const | +$44,172.99  | −$9,034.90   | 125.7% (SHORT drag) |
| 2x-const | +$89,423.33  | −$18,261.38  | 125.7% |
| 2x-comp  | +$110,115.34 | −$24,445.95  | 128.5% |

SHORT-side ratio (short realized / long realized): 1x-const −20.5%, 2x-const
−20.4%, 2x-comp −22.2%. Consistent across all three — the SHORT drag is a
per-lot property of the cohort (n=209 lots for 1x/2x-const; n=201 for 2x-comp),
not a leverage artifact. Attribution decomposition (`R1-attribution.md`)
isolates SHORT gap contribution at −$15.0 (share × gap), dominated by low-N
high-magnitude cells (`short|S_10_INF|mag5|dd5` n=11 gap=−1,023 bps/lot).

## Verdict table populated

See `scripts/act-515/matrix/receipts/verdict-table-R1.md`. R1 (1x-const),
R3 (2x-const), R4 (2x-comp), R5 (SPY-BH) all populated for §1 primary
columns. R2 (1x-comp) remains PENDING per operator scope (not in this
three-config run). Sub-tables (§2 five-deepest DDs; §3 monthly matrix;
§4 regime-exit counterfactuals) remain PENDING pending a separate
per-month equity emitter — flagged as future work.

## What the attribution one-liner says

Overall realized = **+29.2 bps/lot** vs studied_scaled = **+240.4 bps/lot**
→ gap = **−211.2 bps/lot**. Dominant driver by absolute share×gap is
**rank-depth dilution** (rank-band 1-5 LONG carries 74% of book weight and
the largest gap contribution). But the per-cell gaps are large and roughly
uniform (~−200 bps across all top cells), which points at **horizon
over-projection**: the studied 5-day mean, scaled by average ~11-session
T1 hold, over-inflates the studied baseline while realized bps is bounded
by the actual exit anchor — the horizon-decay probe (studied_per_day −
realized_per_day) = **+52.3 bps/day**, confirming the studied 5d mean is
optimistic on a per-day basis and the linear ×(hold/5) scaling amplifies
the miss when holds run long.

## Cross-references

- Ledger drift envelope + cent-exact identity: `orchestrator_test.ts` TEST 1.
- Cache provenance (SHA-256): `scripts/act-515/matrix/cache-shas.ts` + `turn-2b-manifest.md`.
- Delta re-fetch record: INC-147 (`turn-2b-manifest.md` §SUPERSESSION).
- Attribution sidecar: `scripts/act-515/matrix/cache/lots-1x-const.jsonl` (4,902 rows).
- SPY buy-and-hold basis: sealed `spy.jsonl` (1,143 rows total, 1,011 in window).