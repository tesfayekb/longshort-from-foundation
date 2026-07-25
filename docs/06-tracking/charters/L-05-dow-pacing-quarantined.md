# Charter L-05 — DoW Pacing (CHARTER-QUARANTINED)

**Filed:** 2026-07-25 17:10:20Z • **Source:** ACT-576 Phase-1 §B.2 (rank 1 on EV, rank last on evidence)
**Class:** Composition-alpha • **Status:** **QUARANTINED — STEP-0 corpus prior test blocks any live study**

## §1 — Why quarantined
ACT-576 §A.3 shows Wed=+229 bps / Thu=−248 bps / Fri=−286 bps at n=18/14/18. That is a 5-cell partition (5 DoWs) with the best cell selected post-hoc on 13 sessions — the exact ACT-570-P1 §4 data-snooping pattern that the frozen-gate protocol was written to reject. Publishing the "$25K/yr prize" claim in the wild without a corpus prior test would be governance-noncompliant.

## §2 — STEP-0 corpus prior test (BLOCKING gate — no live study without a PASS)

**Question:** does a Wed-vs-Thu/Fri forward-return tilt exist in the 523K-event historical corpus at n ≥ 10,000 per DoW?

**Substrate:** `overshoot_daily_bars` historical (2022-01-01 → 2026-07-24) filtered to the OVERSHOOT admit predicate (drawdown ≥ threshold at signal-day per detector v2 spec sha `df339497…`), producing the historical "would-have-admitted" universe.

**Pre-committed acceptance grammar (frozen):**

| gate | requirement | fail-open |
|---|---|---|
| S0-G1 corpus size | `n_per_dow ≥ 10,000` for each of Mon/Tue/Wed/Thu/Fri | REJECT — halt for corpus expansion |
| S0-G2 Wed lift | `mean(fwd_5d_Wed) − mean(fwd_5d_pooled_ThuFri) ≥ +25 bps` | REJECT — Wed lift is a 13-session artifact |
| S0-G3 monotonicity | Wed > Thu AND Wed > Fri on fwd-5d means | REJECT — non-monotone rejects the tilt hypothesis |
| S0-G4 CI separation | 95% bootstrap CI of (Wed − ThuFri_pooled) EXCLUDES zero at k=10,000 resamples | REJECT if CI includes 0 |
| S0-G5 regime robustness | Sign of Wed lift consistent across 2022 (bear) AND 2023 (mixed) AND 2024 (bull) AND 2025 (bull) sub-slices | REJECT if regime-flip |
| S0-G6 no confound with earnings clustering | Repeat S0-G2 after excluding all Wed admits with earnings ± 5d — residual Wed lift must remain ≥ +15 bps | REJECT if earnings-driven |

**PASS OUTCOME:** the pre-registered 2026-Q4 forward A/B (K=7 Wed, K=3 Thu/Fri) proceeds under a separate follow-on charter with n ≥ 200/DoW acceptance. The $25K/yr prize (§E.1 corrected basis) is a live target.

**FAIL OUTCOME:** **L-05 CLOSES as noise. The $25K/yr prize is RETRACTED from the ACT-576 menu.** Register notes the Q4-class save (Q4-class = the class of "large-EV-but-noise-at-n" levers we would have naively adopted; the save is the operator dollars not spent building infrastructure for a phantom). L-05 does not re-open without a new hypothesis; DoW-timing is filed as **NOT-A-SIGNAL** and the constitution's Rule 8 (Approved Plan Preservation) locks that verdict.

**PARTIAL:** any single-gate FAIL is a FAIL — no "3-of-6 → dig deeper". This is deliberately harsher than the L-01/L-02 grammar because the snooping risk is highest.

## §3 — Timing
STEP-0 study executes as a single-turn artifact in the next available slot; no operator-side prerequisites. Landing target: within 5 sessions of this charter. Results routed as `docs/06-tracking/L-05-step-0-corpus-prior-verdict.md`.

## §4 — What is EXPLICITLY forbidden pre-PASS
- No touching `overshoot_daily_entry_budget` per DoW.
- No editing `overshoot-entry-run` to condition K on `EXTRACT(dow FROM …)`.
- No publishing the "$25K/yr prize" figure outside this charter without the "QUARANTINED-PENDING-STEP-0" stamp attached.

## §5 — Rollback
None — no live changes until PASS.
