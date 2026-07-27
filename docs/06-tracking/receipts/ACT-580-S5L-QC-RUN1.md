# ACT-580 S5-L — THREE-RULER RECEIPT (QC-RUN1, independent replication)

**SELECT now():** 2026-07-27 04:51:12 UTC
**Mode:** documentation-only (evidence filing)
**Charter:** `docs/06-tracking/charters/ACT-581-paper-arm-lock.md`
  (status: DESIGN-VALIDATED-NOT-BUILT)
**Substrate:** S5-L = 12-1 cross-sectional momentum, D10 decile,
equal-weight long-only, first-Monday monthly non-overlapping.

## Deviations first
- None. This receipt files an **operator-executed** independent
  replication on QuantConnect (LEAN cloud). Lovable did not run the
  QC job; numbers are transcribed verbatim from the operator's QC
  run summary and treated as the reference ruler.
- No re-tuning, no k-consumption on the house side (this is an
  external ruler check, not a new refinement look).

## The three rulers (build-window class)

| ruler | window | CAGR | maxDD | notes |
|---|---|---|---|---|
| **House build** (`ACT-580-S5-TREND.md`) | 2022-08 → 2025-11 | +22.39% | −18.36% | 2026-snapshot roster, §7 survivorship caveat |
| **House holdout** (`ACT-580-S5L-HOLDOUT.md`) | 2026-01 → 2026-06 | +117.09% ann. (+47.34% 6-mo) | −4.48% | single-look, LOCKED; small-window annualization |
| **QC-RUN1** (operator, LEAN cloud) | operator-set (incl. 2022-06/07 pre-build tail) | **+17.11%** | **−25.5%** | net +85.5%, 2,650 orders, fees $2,644, capacity est. $150M |

### QC-RUN1 construction (as reported)
- Platform: QuantConnect LEAN cloud, operator-executed.
- Universe: **IVV + IJH point-in-time ETF-constituent membership**
  (true historical constituents, no re-pointing).
- Prices: adjusted (splits + dividends).
- Costs: QC default fee model + spread-based slippage model.
- Signal / construction / cadence: S5-L as chartered (12-1, D10,
  equal-weight long-only, monthly first-Monday).

## Divergence decomposition (candidates ranked; no false precision)

House build **+22.39%** vs QC-RUN1 **+17.11%** = **~5.3pp gap**,
with QC also showing a deeper maxDD (**−25.5%** vs **−18.36%**).
Direction on both metrics is consistent with a flattered house
backtest. Candidates in likely-magnitude order:

1. **Universe reconstruction — PRIME SUSPECT.**
   House roster is the 2026 composite-universe snapshot
   re-pointed backward with the §7 survivorship caveat
   documented in the ACT-571/ACT-580 charter. QC uses **true
   point-in-time IVV+IJH membership**. Direction matches: a
   re-pointed roster silently excludes names that were in the
   index during the build window but were deleted before the
   snapshot (typically the weakest performers → survivorship
   flattery on the long-D10 side). Both the CAGR overstatement
   and the shallower maxDD are consistent with this bias.

2. **Window edges.** QC run includes **2022-06 and 2022-07** in
   the pre-build bear tail that the house build excludes
   (house starts 2022-08). Adding two bear months lowers CAGR
   and can widen maxDD. Non-trivial contributor; smaller than
   (1).

3. **Adjusted vs unadjusted prices — works the OTHER way.**
   House pipeline uses total-return-adjusted series consistent
   with QC's adjusted prices. Any residual adjustment
   difference would nudge QC **up** by ~1–2pp (dividend
   reinvestment), so this candidate cannot explain the gap;
   noted to prevent double-counting.

4. **Execution / cost model.** QC fees are tiny ($2,644 across
   2,650 orders ≈ 1 bp/order), slippage is spread-based. House
   uses a flat 38 bps round-trip per leg (ACT-506). On monthly
   cadence with D10 (~80 names) turnover, the two models are
   in the same order of magnitude; differences are small
   relative to (1) and (2).

**Conclusion (decomposition):** The 5.3pp CAGR gap and 7pp DD gap
are dominated by (1), with (2) as a real but smaller secondary
contributor, and (3)/(4) as second-order corrections that partially
offset. No single-candidate false precision is claimed.

## Register impact

- **S5-L expected-performance band REVISED** (build-window class):
  **17–19%/yr CAGR at ~25% DD class**, pending the QC deep-history
  run below. The house's +22.39%/−18.36% is now treated as an
  upper-bound flattered estimate, not the reference.
- **ACT-581 design doc gains a mandatory line** (to be added when
  the doc is next edited):
  > *"House backtest is known-flattered by universe reconstruction;
  > QC point-in-time replication is the reference ruler."*
- **Holdout 2026 H1 verdict is unaffected** by this receipt — the
  single-look PASS at +117% annualized / −4.48% DD stands, but is
  a 6-month small-window annualization and does not set the
  expected steady-state band. The build-window class ruler is what
  moves.
- **k-ledger:** unchanged. This is an external-ruler evidence
  filing, not a new refinement look. Survivor count remains 1
  (S5-L bare), OPERATOR-RULING-PENDING per M-7 close.

## Next-evidence row (gates any build ruling)

**QC DEEP-HISTORY 2010-2026** — operator-executed, LEAN cloud,
same construction as QC-RUN1 (IVV+IJH point-in-time, adjusted
prices, QC fee + spread-slippage). Deliverables:

| field | purpose |
|---|---|
| CAGR (2010-2026) | full-cycle expected-performance anchor |
| maxDD | crash-regime headline |
| worst calendar year | tail-year discipline |
| **2020-Feb + 2020-Mar month returns** | COVID crash-regime verdict — the specific months that gate any build ruling |

Until QC-DEEP-HISTORY lands, **no build ruling on ACT-581 may
proceed**; the paper-arm remains DESIGN-VALIDATED-NOT-BUILT and
the revised 17-19%/25%-class band is provisional.

## Cross-references
- House build: `docs/06-tracking/charters/ACT-580-S5-TREND.md`
- Robustness: `docs/06-tracking/receipts/ACT-580-S5L-*.md`
- Holdout co-sign: `docs/06-tracking/receipts/ACT-580-S5L-HOLDOUT.md`
- Paper-arm design record: `docs/06-tracking/charters/ACT-581-paper-arm-lock.md`
- Universe/survivorship caveat: ACT-571 composite-universe charter, §7
- Cost basis: `ACT-506` slippage/half-spread model

## Status
**FILED.** External-ruler evidence on record. Register band revised.
Awaiting QC-DEEP-HISTORY 2010-2026 before any ACT-581 build ruling.