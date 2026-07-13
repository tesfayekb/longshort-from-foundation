# ACT-511 — CHARTER: T1 SUPPLY EXPANSION STUDY

**Status:** FILED, OPEN. Mode: INVESTIGATION (read-only). Sequenced behind nothing; interleaves with the W5 set (ACT-506 / ACT-508 / ACT-509-followups / ACT-510). Runs when compute is free. Does NOT gate ACT-510 landing.

**Filed:** 2026-07-13, evening. **Governance basis:** Operator standing order (filed same day) — evidence-passing ROI items are first-class captures; ACT-510's T1 uplift is not a footnote, and neither is the question of whether that edge can be scaled by supply.

---

## 1. Motivation

ACT-509 Stage-1 established the T1 edge at **+33.4% per-deployed-dollar-per-day** on `(entry=T+2, exit=T+6, hold=4)` versus the current uniform config. ACT-510 chartered the implementation. The uplift is real but **SUPPLY-CONSTRAINED**:

- Current ratified universe: **839 names** (`1888e113-f9b3-43f5-856c-d91666a3c121` / detector `b7cdfcd8`).
- T1-grade arrivals in that universe: **~400 events/yr** (1,711 events over the study window / ~4.28 yr window).
- At 2.5% slot concentration and 4-session hold, arrival rate supports **~6 T1 slots**.

The operator challenge: **does universe expansion unlock proportionally more T1 arrivals, and at what honest cost?**

---

## 2. Pre-committed method (frozen BEFORE any number is computed)

### 2.1 T1 qualification predicate (verbatim from ACT-509 / ACT-510, no loosening)
```
LONG_T1_ELIGIBLE(cell) ≡
  side='LONG'
  ∧ mean_fwd_return_5d ≥ 0.0010    -- 2× haircut, ratified
  ∧ arrival_count ≥ 1
  ∧ tier='T1' per ratified detector b7cdfcd8 cell-membership rules
  ∧ passes ratified liquidity floors (ADV, price, borrow-available, no ADR/OTC)
```
No predicate change. Any relaxation would invalidate parity with the ACT-509 economics constant.

### 2.2 Universe increments (nested, monotone U0 ⊂ U1 ⊂ U2 ⊂ U3)
| Increment | Definition | Approx gross count |
|---|---|---|
| **U0** | Current ratified universe (baseline). | 839 |
| **U1** | U0 ∪ (Russell-1000 members not in U0, liquidity-floored). | +≈150 |
| **U2** | U1 ∪ (Russell-2000 top-half by ADV, liquidity-floored). | +≈800 |
| **U3** | U2 ∪ (Russell-3000 top-quartile by ADV, liquidity-floored). | +≈500 |

Membership is **point-in-time** (see cost 3 below). No forward-looking survivorship.

### 2.3 Deliverable per increment Uk
1. Added tickers gross; net after liquidity floor; refusal breakdown per floor.
2. Additional T1-grade **events/yr** (net over U0 baseline).
3. Marginal **slot count** at 2.5% concentration and 4-session hold.
4. Projected **$/yr at ACT-510 economics** (36.89 bps/slot-day × slot-days/yr × slot capital @ $100K/slot reference).
5. **Marginal ROI curve:** events/yr and $/yr **per additional ticker** — so the operator can select a diminishing-returns cutoff on arithmetic, not aesthetics.

### 2.4 Pre-committed GO/NO-GO rule for a future universe-expansion DEC
An increment `Uk → Uk+1` is a **"GO for ratification study"** (which is a separate charter — this one does NOT auto-adopt) iff ALL:
- (i) Marginal events/yr **≥ 100** net-of-floors.
- (ii) Marginal projected $/yr **≥ (backfill cost + ratification-study calendar cost)** amortized over 12 months.
- (iii) Survivorship replay executable — data available for the increment's history.

Below any threshold ⇒ **NO-GO** recorded for that increment. Above all three ⇒ **hand off to a SEPARATE ratification-study charter** (5-yr corpus regen on the expanded set, own fixture SHA, own machine-form gates). **No auto-adoption from this charter.**

---

## 3. Honest costs (quantified per Uk — NO post-hoc reframing)

1. **Data backfill:** 5-yr daily + intraday bars for each added ticker. Report bytes, ingestion runtime, Polygon $ line-item per Uk.
2. **Study-basis integrity:** new tickers need their OWN 5-yr corpus BEFORE any live trading on them. **Cannot** ride the existing `1888e113` fixture. Estimate calendar days to re-ratification per Uk.
3. **Survivorship discipline (`POINT_IN_TIME_UNIVERSE_REQUIRED`):** Russell reconstitutions since the 2021-06-29 anchor must be replayed **forward**, not membership-as-of-today. Delisted / merged names MUST be included. Any Uk that cannot satisfy this stamp is disqualified.
4. **Liquidity floor drift:** re-verify ratified ADV / borrow / price floors on Uk. Report refusal count per floor. Any floor tightening required for the wider set counts as a DEC and exits this charter.
5. **Regime coverage on new names:** SPY-drawdown regime bands (ACT-473) must hold on Uk. **NO name-specific regime redefinition.** Regime replication N=1 stamp (`SINGLE_BEAR_EPISODE_SAMPLE`) is inherited and does not improve with universe expansion.

---

## 4. What this charter WILL NOT do

- **No ingestion changes.** No universe-list edits. No detector edits. No corpus regeneration. No fixture re-hash. No migrations. No cron. No deploys. No lockfile touches.
- **No auto-adoption.** GO results feed a separate ratification-study charter.
- **No unblocking of ACT-510.** ACT-510 lands the current-universe T1 uplift on its own schedule regardless of ACT-511 outcome.

Method note: for tickers WITHOUT existing bars in the ratified corpus, T1 arrival rate is **estimated** via published Russell membership × ADV screens × a documented back-of-envelope arrival-rate model whose assumptions are pinned in the deliverable BEFORE computing. Estimates are labelled `ESTIMATED_ARRIVAL_RATE_UNRATIFIED` — never treated as ratified numbers.

---

## 5. Sequencing and interleaves

- Behind **nothing**. Reads only ratified corpus + published index membership + existing bars.
- Interleaves freely with ACT-506 (slippage decomposition), ACT-508 (cell membership + mechanical audit), ACT-509 follow-ups.
- Does NOT block ACT-493 (07-17 deadline unmoved) or ACT-510 (opens AFTER 493 v1, unchanged).
- Compute-opportunistic — run when other read-only work is idle.

---

## 6. Cross-references

- ACT-470 / ACT-473 — frontier + regime evidence (inherited context).
- ACT-509 Stage-1 results — T1 gate + economics constant.
- ACT-510 — implementation charter for the current-universe capture.
- INC-96 — aggregate wallet ruling; universe expansion does **not** create sleeves. All new slots (if adopted) live in the same aggregate wallet.
- Standing order (2026-07-13, evening) — first-class-capture discipline; this charter is filed under it.

---

## 7. Deliverable location (when computed)

`docs/08-planning/artifacts/ACT-511-RESULTS-t1-supply-expansion.md` (to be authored on completion). Must include: pre-committed method restated verbatim, per-Uk table (events/yr, slots, $/yr, costs), marginal ROI curve, GO/NO-GO verdict per increment against the pre-committed rule, honest caveats, and any `ESTIMATED_ARRIVAL_RATE_UNRATIFIED` stamps.

**END CHARTER.**