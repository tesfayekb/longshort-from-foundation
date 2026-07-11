# ACT-499 Track C — ROI Live Numbers: Entry Slippage (First Table)

**Status:** OPEN (slippage table delivered; borrow/commission/tax passes queued behind)
**Mode:** investigation (read-only against live audit + lots)
**Author:** AI (in-turn)
**Date:** 2026-07-11
**Ratifies against:** TRIP-502-A (ACT-502 tripwire), W5 haircut validation

---

## 1. Question

Per filled entry order: **limit_price vs filled_avg vs construction-snapshot mid, in bps, by day.** This number feeds:

- **TRIP-502-A** — re-run rigorous frame with measured entry slippage; re-open ACT-502 iff lower-CI 90% clears the 8 bp floor.
- **W5 haircut validation** — validates or invalidates the 5 bp/side assumption used across the W5 candidate register (RPSC / RHA / same-session recycling).

## 2. Method

**Sources (read-only):**
- `overshoot_audit_logs` where `action='overshoot.entry.submitted.entry'` — submit-time `limit_price`, `slippage_bps` (construction budget), `order_id`.
- `overshoot_lots` — realized `cost_basis / qty = filled_avg`; joined on `source_order_id = metadata->>'order_id'`.

**Construction-snapshot mid (inferred):** the entry engine constructs `limit = mid × (1 + budget_bps/10000)` on the LONG side (marketable-limit above mid). Therefore:

```
inferred_mid = limit_price / (1 + budget_bps/10000)
slip_vs_mid_bps = (filled_avg − inferred_mid) / inferred_mid × 1e4
slip_vs_limit_bps = (filled_avg − limit_price) / limit_price × 1e4
```

**Sign convention (LONG):** negative bps = filled *cheaper than* the reference (favorable); positive = paid up.

**Corpus:** all 50 live LONG entry fills to date (2026-07-08, 07-09, 07-10). No shorts yet. Notional = $119,336.

**Caveat:** `inferred_mid` reconstructs the mid from the emitted `limit_price` and `slippage_bps` budget. It matches the engine's construction path deterministically but is not an independent quote snapshot. A follow-on pass could persist the raw Polygon snapshot mid to `overshoot_audit_logs.metadata.reference_mid` for direct measurement (queued as **INC-103**, below).

## 3. Per-day table

| day | n | avg slip vs limit (bps) | **avg slip vs mid (bps)** | median vs mid | min | max | sd |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-07-08 | 18 | −49.73 | **+0.02** | −0.06 | −3.38 | +9.03 | 2.61 |
| 2026-07-09 | 14 | −49.27 | **+0.49** | +0.09 | −2.79 | +7.29 | 2.14 |
| 2026-07-10 | 18 | −50.75 | **−1.00** | −0.21 | −6.01 | +0.69 | 1.91 |

## 4. Corpus aggregate (n=50)

| metric | value |
|---|---:|
| mean slip vs mid | **−0.22 bps** |
| median | −0.02 bps |
| notional-weighted mean | **−0.16 bps** |
| stdev | 2.29 bps |
| p10 / p90 | −2.65 / +0.69 bps |
| total notional | $119,336 |

**90% CI on mean** (t, n=50, sd=2.29): mean ± 1.677 · 2.29/√50 = **−0.22 ± 0.54 bps → [−0.76, +0.32] bps**.

## 5. Findings

**F-C-01 (headline):** Measured entry slippage vs construction-snapshot mid is **statistically indistinguishable from zero** (−0.22 bps mean, 90% CI [−0.76, +0.32]). The 5 bp/side assumption used across W5 (RPSC / RHA / ACT-502 rigorous frame) is **materially conservative** — over-stated by ~5 bps/side on LONG entries.

**F-C-02:** All fills consumed **at or well inside** the 50 bp marketable-limit budget (`slip_vs_limit_bps` cluster tight around −50). Zero adverse-selection tails observed; worst single fill was +9.03 bps vs mid (2026-07-08, one name). No fill exceeded the budget → **zero "would have missed" candidates** in this corpus.

**F-C-03:** Day-level variance is small and driven by the same 1–2 tail names each day; 07-10 was net favorable (−1.00), 07-09 was net slightly adverse (+0.49), 07-08 essentially flat. No cross-day drift pattern in n=3 sessions.

**F-C-04 (methodology):** The inferred-mid reconstruction is deterministic-from-log but not independent-quote. Persisting `reference_mid` to submit metadata (INC-103) would replace the inference with direct measurement; expected effect on the number is small (the construction math is byte-verified in `_shared/entry-construction`).

## 6. Impact on tripwires and candidates

### TRIP-502-A (ACT-502 re-open test)

Re-running ACT-502's rigorous frame with **measured** entry slippage (0 bp/side vs assumed 5 bp/side):

| frame | net_cycle_bps | 90% CI | pass 8 bp | verdict |
|---|---:|---:|:---:|:---:|
| Rigorous (charter, 5 bp/side assumed) | +6.7 | [5.2, 8.2] | ❌ | NO-GO (filed) |
| **Rigorous + measured entry slip (0 bp entry side)** | **+6.7 + ~5 = +11.7** | **[10.2, 13.2]** | **✅** | **RE-OPEN CANDIDATE** |
| Rigorous + measured entry + 5 bp EXIT haircut (exit not yet measured) | +6.7 | [5.2, 8.2] | ❌ | NO-GO |

**Ruling:** TRIP-502-A **does not fire on entry-side data alone**. The +11.7 bps figure removes only one leg of the round-trip; the tripwire text requires *"measured frictions"* — plural, covering both entry and exit — before ACT-502 re-opens. **Exit-side slippage must be measured before re-opening ACT-502.**

Queued: **W5-04 EXIT SLIPPAGE MEASUREMENT** (Track C sub-pass) — same methodology against `overshoot_lots.closed_at` + exit audit rows when the first exit cohort matures (T+10 from 2026-07-08 → 2026-07-22).

### W5 haircut validation

**Entry-side 5 bp/side haircut across W5 candidates (RPSC, RHA, same-session recycling): CONFIRMED CONSERVATIVE.** All W5 net-alpha tables that apply a 5 bp/side entry haircut are understating net alpha by ~5 bps/side. Re-scoring is deferred to when RPSC/RHA promote to Era-3 gate evaluation — the sign of the promotion decision does not flip on a favorable haircut correction.

## 7. Deliverables

- ✅ Per-day slippage table (§3)
- ✅ Corpus aggregate + CI (§4)
- ✅ TRIP-502-A ruling (§6)
- ✅ W5 haircut ruling (§6)
- ⏳ Exit-side slippage pass — queued as **W5-04**, blocked on T+10 exit maturation (earliest 2026-07-22)
- ⏳ Direct-mid instrumentation — queued as **INC-103** (log `reference_mid` on submit)

## 8. Track C remaining passes (queued behind exit slippage)

1. **Exit slippage** (W5-04, blocked 2026-07-22)
2. **Borrow cost** — measure realized borrow bps/day on any SHORT fills once SHORT side activates (not yet in corpus)
3. **Commissions** — per-lot commission bps from broker (not yet ingested; check whether `overshoot_lots` cost_basis is gross or net)
4. **Tax drag** (short-term cap gains) — analytical, not measured; deferred to Track D or later

## 9. INC / charter deltas

- **INC-103** filed: log construction-snapshot `reference_mid` on `overshoot.entry.submitted.entry` metadata so slippage measurement is direct-quote, not inferred-from-limit. Cosmetic (measurement-quality); no engine behavior change.
- **W5-04** filed: Exit-side slippage measurement, blocking TRIP-502-A ruling on the exit leg.

---

**Track C status:** Entry-slippage table CLOSED. Exit-slippage pass, borrow, commissions PENDING. Track C remains OPEN.