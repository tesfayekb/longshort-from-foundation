# OVERSHOOT (FP-069) — MASTER PLAN v2

> **Owner:** Project Lead | **Last Reviewed:** 2026-07-10
> **Status:** Supersedes the prior W-notation task list (W0–W5).
> **As of:** Fri 2026-07-10 evening

## Purpose

Authoritative phase plan for the Overshoot (FP-069) strategy. Replaces the earlier W-notation
working list; all future references should use Phase N. Historical W-notation is preserved only
in the mapping below for traceability.

## W → Phase Mapping (historical)

| Old (W-notation)     | New (v2)                              |
| -------------------- | ------------------------------------- |
| W0–W2.7              | Phase 1 — Research & Validation       |
| W3                   | Phase 2 — Execution Engines           |
| W4                   | Phase 3 — Console v1                  |
| (implicit)           | Phase 4 — First Light                 |
| W3.8                 | Phase 5 — Deployment Maximization     |
| (implicit)           | Phase 6 — Live Execution Begins       |
| (attended ops)       | Phase 7 — Daily Operations            |
| (hardening)          | Phase 8 — Hardening                   |
| (arm sequence)       | Phase 9 — ARM (unattended)            |
| W5                   | Phase 10 — Measurement                |
| (gate)               | Phase 11 — Live Gate                  |
| (capital)            | Phase 12 — Live Capital               |
| (expansion)          | Phase 13 — Expansion                  |

## Phases

### Phase 1 — Research & Validation ✅ (was W0–W2.7)
5-yr study, 839 tickers, ~483K events, ratified run `1888e113`.

### Phase 2 — Execution Engines ✅ (was W3)
detection / entry / exit / SI + Alpaca acct #2, deployed disarmed.

### Phase 3 — Console v1 ✅ (was W4)
seven pages + config RPC.

### Phase 4 — First Light ✅
attended brackets, zero-select baselines.

### Phase 5 — Deployment Maximization ✅ (was W3.8)
T2 frontier `b7cdfcd8`, T+10 longs, 0.90/36, regime governor.

### Phase 6 — Live Execution Begins ✅
first fills 07-08; H1 fill adoption; τ_long=1.00 DEC; 36/4 caps; console v2.

### Phase 7 — Daily Operations (attended) ✅ effectively complete
First live week done: 3 entry days, 50 lots, ~$119K deployed, A5 reconciled daily.
Defect harvest all fixed: INC-90 → INC-101 (NaN refs, snapshot bounds, capacity, fill-sweep trio,
RLS class, aggregate allocation cap, cron-auth parity, secret-echo, URL typos).

### Phase 8 — Hardening 🔄 mostly done, reshaped by events
- ✅ H2 alerting — built, smoke-tested, CRITICAL page proven to inbox (ZZINC97, double-receipted)
- ✅ H4-equivalent — superseded by better: dispatcher's independent broker-vs-ledger A5 every 5 min (not nightly)
- ✅ H5 — snapshot cron armed, E3 receipt banked tonight (autonomous, 50/50 priced)
- ✅ H3-equivalent — the ghost-row drill was a kill-switch-path test
- ⬜ Residual: ACT-499 P0 burn-down (exit catch-up + half-day handling → folded into ACT-493;
  external heartbeat + second alert channel; CRON_SECRET vault-ref) — these gate walk-away-for-a-week,
  not Tuesday.

### Phase 9 — ARM (unattended) 🔄 in flight, evidence-gated
- ✅ Wave 1 armed: dispatcher, SI, detection, snapshot, fill-sweep (sweep proved autonomous adoption 07-10 15:14Z)
- ✅ Binding rule (3rd-occurrence lesson): **artifact rows are the only arming attestation**
- ⏳ Tonight 22:00Z: E4 — first autonomous detection (Monday's book)
- ⬜ Mon: checklist → last manual entry bracket → (D) cap probe → same-day autonomous adoption proof
- ⬜ Tue ~09:20: arm entry → slot-a's first autonomous fire 09:35
- ⬜ Exit arm: gated on ACT-493 (deadline 07-17; first exits ≈ 07-22; book converges to cap ≈ 07-24)

### Phase 10 — W5 Measurement (~4–6 wks) ⬜
Slippage vs haircuts (ACT-499 Track C started it), overnight-gap live, tier/regime attribution,
τ tripwires, short verdict, survivorship deflator, **1.22× window annotation (mandatory)**.

### Phase 11 — Live Gate ⬜
≥20 round-trips + criteria + operator sign-off. Decisions:
- long-only auto-election
- Alpaca vs IBKR (FP-CANDIDATE-vii: margin spread ~4%/yr at 2:1, borrow desk, W5 fill quality)
- margin > 1.0
- **CRON_SECRET rotation (INC-100 binding gate item)**

### Phase 12 — Live Capital ⬜
small → scaled, margin ratchet evidence-gated, IBKR build if elected.

### Phase 13 — Expansion ⬜ (parallel from Phase 9)
- ACT-498 self-healing ladder STEP B (after 493)
- gap-breaker study (ACT-487e candidate — strategy question, not ops patch)
- shadow universe expansion — **GATED on PERF-D-A (detection-kernel sharding)** per ACT-499 Track D DEC 2026-07-11; kernel busts 150s wall-clock at ~1.6× universe (~1,350 symbols), so no expansion beyond current 839 until sharding lands. 10× economics additionally gated on **PERF-D-C** (capacity-dilution study).
- FINRA SI procurement (named, uncharted)
- PEAD
- CROSSWIND resumes

## Carried Parked Items (nothing evaporates)
- DW-212 confirmation
- curl-tool defect escalation
- Track B F2–F13 report (queued)
- Tracks C/D of ACT-499 (queued)
- digest cap-compliance line (next dispatcher touch)

## Dependencies
- [Master Plan](master-plan.md)
- [Approved Decisions](approved-decisions.md)
- [Incidental Findings](../06-tracking/incidental-findings.md)
- [Banned Patterns](../banned-patterns.md)

## Used By / Affects
Overshoot strategy execution, arming sequence, hardening burn-down, and live-gate criteria.

## Risks If Changed
HIGH — phase ordering and arming gates encode ratified operator rulings and money-path safety.

## Related Documents
- [Master Plan](master-plan.md)
- [Deferred Work Register](deferred-work-register.md)
- [Incidental Findings](../06-tracking/incidental-findings.md)
