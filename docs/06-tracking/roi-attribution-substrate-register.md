# ROI-Attribution Substrate Register

**Status:** SCOPING ROADMAP (not authorized build).
**Owner:** ROI-fine-tuning workstream (§14 ROI-as-first-class-axis).
**Sibling register:** [`signal-roi-audit-findings.md`](./signal-roi-audit-findings.md).
**Provenance:** Dual-investigation product (supervisor + Lovable, reconciled 2026-06-30). HEAD `b665fbc6`.
**Landing action:** ACT-421.

## Purpose

Enumerate the per-position / per-rank / per-signal data substrate the system must accrue NOW (or has already accrued and is not exploiting) so that AFTER the paper window we can answer — with evidence, not intuition — the four canonical ROI-fine-tuning questions: (1) which rank-buckets on each side make vs lose money; (2) which signals are best/worst PER SIDE and what weight each should carry; (3) are we entering names too late / too early (signal-decay timing); (4) which new signals/features are evidence-worth adding.

This register is **measurement-substrate scoping**, NOT selection-logic change and NOT authorized build. Each item is a **candidate for individual FP authoring** through the normal feature-proposal loop. The only exceptions already in flight are the §1.1 batch-one floor (SHIPPED via ACT-419) and the per-lot perfection charter (FP-065, post-window).

## The Keystone — §1.1 Lot-Entry-Snapshot

Un-reconstructable post-hoc: the intraday-slot rotation (DEC-070) means the ranking context at fill-instant is silently lost once the slot rotates. If early fills land without it, those positions' rank/score/variant attribution is **permanently foreclosed**, not merely "hard to recover."

- **Batch-one floor — SHIPPED 2026-06-30 (ACT-419).** Read-only ranking sidecar at the rebalance-submit edge-fn seam (`longshort_rebalance_ranking_snapshot`, MIG-149), independent-read + skew-detection (`generation_skew`, `submit_reference_computed_at` honest-null), fire-and-forget, zero touch to submit/fill/planner path.
- **Per-lot perfection — CHARTERED as FP-065 (post-window).** Planner-seam rank/score capture + `client_order_id` ↔ attribution sidecar + order_id ↔ CID lineage on `longshort_lots`.

Landing §1.1 unblocks **8 of the 22 items below as cheap views** over existing tables; without it those items require new capture.

## The 22 Items (5 Tiers)

Each item: (a) what data/attribution; (b) present-today-vs-gap (cite the table/fn); (c) the ROI question it unlocks; (d) cheap-view-vs-new-capture; (e) time-sensitive (must-capture-before-fills).

### Tier 1 — Rank-bucket & per-side signal P&L

| ID | (a) Data | (b) Present-vs-gap | (c) ROI question | (d) View vs capture | (e) Time-sensitive |
| --- | --- | --- | --- | --- | --- |
| **1.1** | Per-lot entry rank, score, side, variant, slot, as_of_date, ranker_ref_price | **GAP** on `longshort_lots`. **Batch-one floor SHIPPED** via `longshort_rebalance_ranking_snapshot` (ACT-419). **Per-lot perfection CHARTERED** as FP-065. | Which rank-buckets (1-5 / 6-10 / 11-15 / 16-20) on each side make vs lose money? | **New capture** (planner seam) + sidecar table. | **YES — keystone.** Intraday-slot rotation silently foreclosures attribution. |
| **1.2** | Shadow rank-bucket realized-equivalent P&L across horizons {1, 5, 10, 20}d (post-widening, NOT original {1, 5, 20}) | **PRESENT** as cheap view over `combiner_forward_returns` × `combiner_book_shadow` (DW-204-substrate gated). | Same as 1.1 on shadow universe; calibrates 1.1. | **Cheap view** (existing tables). | Anytime (gated on DW-204 substrate flow). |
| **2.1** | Per-signal × per-side return decomposition | **GAP** — `combiner_forward_returns` collapses per-signal attribution into composite `seed_score`. | Which signals are best/worst PER SIDE — is the asymmetry material? | **New capture** at compose seam. | Recommended pre-fills (avoids retro-fit). |
| **2.2** | Ranker-symmetry IC probe (long-side IC vs short-side IC per signal) | **GAP** — `ranker.ts:228` is `short_score = -composite`; no per-side IC measurement. | Is symmetric optimal, or do signals predict differently long vs short? | **Cheap view** once 2.1 lands. | Follows 2.1. |

### Tier 2 — Entry / exit timing & decay

| ID | (a) Data | (b) Present-vs-gap | (c) ROI question | (d) View vs capture | (e) Time-sensitive |
| --- | --- | --- | --- | --- | --- |
| **3.1** | Time-since-signal-fire at entry (Δ between `signal_observations.computed_at` and `longshort_lots.entry_ts`) | **GAP** (1.1 dependency). | Entering too late after edge decay, or too early before confirmation? | **Cheap view** once 1.1 lands. | Follows 1.1. |
| **3.2** | Multi-horizon signal-decay curves (not just single-point close-to-next-open) | **PARTIAL** — `signal_decay_returns` / `signal_decay_log` exist via `longshort-signal-decay-capture` but are **single-point + un-consumed** ("MEASUREMENT-ONLY: nothing consumes"). | Tune lookback / half-life per signal (momentum 12_1, reversal 1w, news 7d, insider 90d, short-interest 30d, options-flow 5d, pead 20d). | **Mixed** — extend capture to multi-horizon {1, 5, 10, 20} + author consumption views. | Capture-side recommended pre-fills. |
| **4.1** | Realized holding vs shadow-predicted holding period | **GAP** — no predicted-holding column on `combiner_book_shadow`; no realized-holding rollup over `longshort_lots`. | Exiting on schedule, or fighting the model? | **Cheap view** once 1.1 + 4.2 land. | Follows 1.1 / 4.2. |
| **4.2** | Exit-reason enum on lot close (signal-flip / stop-loss / rebalance / corp-action / force-cover / squeeze-protection / manual / EOD) | **GAP** — `longshort_lots` has no `exit_reason`. | Which exit causes dominate; which bleed edge? | **New capture** at every close seam. | Recommended pre-fills (every closed lot without it is lost evidence). |

### Tier 3 — Execution / sizing

| ID | (a) Data | (b) Present-vs-gap | (c) ROI question | (d) View vs capture | (e) Time-sensitive |
| --- | --- | --- | --- | --- | --- |
| **5.1** | Ranker-time reference quote per submitted ticker (price the rank was computed against) | **GAP** — submit path captures fill price but not compute-time reference. | Slippage decomposition: ranker→submit vs submit→fill. | **New capture** at ranker (or via 1.1 column). | **YES — irrecoverable post-hoc** (intraday quotes can't be re-fetched at the exact slot). |
| **5.2** | Sizing-basis P&L (sized vs equal-weight counterfactual) | **GAP** — `target_qty` derivation inputs not captured against realized return. | Is the sizing kernel adding alpha or noise? | **Cheap view** once 1.1 lands (target/realized join). | Follows 1.1. |

### Tier 4 — Signal interaction / coverage

| ID | (a) Data | (b) Present-vs-gap | (c) ROI question | (d) View vs capture | (e) Time-sensitive |
| --- | --- | --- | --- | --- | --- |
| **6.1** | Per-name signal coverage map + SHAP-style contribution at compose-time | **GAP** — gated-path SHAP / contribution capture absent. | Which signals carry which names; which composites are signal-thin? | **New capture** at compose seam. | Recommended pre-fills (compose-time-only). |
| **6.2** | Signal-pair conditional alpha (reversal-given-news, momentum-given-short-interest, …) | **GAP** — no pairwise panel queried. | Redundancy detection + interaction-effect discovery. | **Cheap view** once 6.1 lands. | Follows 6.1. |
| **9.1** | 52-week extension feature (distance to 52wk high AND 52wk low) — **SYMMETRIC** | **GAP** — no extension feature in `combiner_feature_vectors` (grep-confirmed). | Both sides are mirror failures: a LONG into a name at its 52wk high about to reverse (the MU case — bought climbing, dropped ~10%) AND a SHORT into a name at its 52wk low about to bounce. Captures the symmetric tail-risk both legs share. | **New capture** (feature compute + persist). | Recommended pre-fills (every fill without it is a missed feature row). |
| **9.2** | Companion extension features (200d-MA distance, ATR-multiple from MA, recent-N-day range position) | **GAP** — none in `combiner_feature_vectors`. | Complements 9.1 with continuous-domain extension signal. | **New capture**. | Follows 9.1. |

### Tier 5 — Regime / universe / infra

| ID | (a) Data | (b) Present-vs-gap | (c) ROI question | (d) View vs capture | (e) Time-sensitive |
| --- | --- | --- | --- | --- | --- |
| **7.1** | SPY-regime tag at entry (bull/bear/chop or quantile) | **GAP** — regime computed intraday but not stamped on lots. | Conditional P&L by regime; identify regime-dependent signals. | **Cheap view** once 1.1 lands. | Follows 1.1. |
| **7.2** | VIX / sector / borrow-stress tags at entry | **GAP** — VIX & sector not captured on lot; borrow state only in DTC/ETB monitors. | Conditional P&L by vol/sector/borrow stress. | **Cheap view** once 1.1 lands. | Follows 1.1. |
| **8.1** | Days-since-universe-admission at entry | **GAP** — universe admission timestamp not surfaced to lot. | Are fresh-admit names alpha-rich or alpha-poor? | **Cheap view** once admission timestamps surfaced. | Anytime. |
| **B8** | Long/short neutrality-ratio at compose-time → realized P&L | **GAP** — DW-201 (short-skew). Ratio not persisted per book. | Does skew predict drawdown / underperformance? | **Cheap view** once ratio persisted on `combiner_book_shadow` / book table. | Recommended pre-fills (compose-time-only). |
| **10.1** | Reconciliation-event → drawdown attribution | **GAP** — `reconciliation_events` exist but not joined to P&L. | Which reconciliation classes cost the most money? | **Cheap view** (existing tables). | Anytime. |
| **10.2** | Ranked → target → fill funnel conversion | **GAP** — funnel stages not unified into one panel. | Where does ranked alpha leak (skip / cap / reject / unfilled)? | **Cheap view** across existing tables. | Anytime. |
| **10.3** | New-signal candidate evaluation harness (shadow-only feature smoke test → IC → composite-marginal) | **GAP** — no harness; new signals land via ad-hoc charter. | Evidence-gated answer to "is this candidate signal worth adding?" | **New infra** (harness + protocol). | Anytime (gating future capture). |

## Time-Sensitivity Verdict

**Must capture BEFORE / AROUND the first-fills window** (irrecoverable post-hoc):

- §1.1 lot-entry-snapshot — **batch-one floor SHIPPED (ACT-419)**; per-lot perfection deferred to FP-065.
- §5.1 ranker-time reference quote — intraday quote at the exact slot cannot be re-fetched.
- §9.1 / §9.2 extension features — feature-vector rows are written once at compose-time.
- §6.1 SHAP / contribution panel — compose-time-only.
- §B8 neutrality-ratio — compose-time-only.
- §4.2 exit-reason enum — every closed lot without it is lost evidence.
- §2.1 per-signal × per-side decomposition — compose-time capture avoids retro-fit cost.
- §3.2 multi-horizon signal-decay extension — capture-side extension avoids forever-single-point.

**Cheap views, anytime** (compute from already-accruing substrate):

- §1.2 shadow rank-bucket P&L (gated on DW-204 substrate flow).
- §2.2 ranker-symmetry IC (follows 2.1).
- §3.1 time-since-signal (follows 1.1).
- §4.1 realized-vs-predicted holding (follows 1.1 + 4.2).
- §5.2 sizing-basis P&L (follows 1.1).
- §6.2 signal-pair conditional alpha (follows 6.1).
- §7.1 / §7.2 regime + vol/sector/borrow conditional P&L (follow 1.1).
- §8.1 days-since-admission (anytime).
- §10.1 / §10.2 reconciliation + funnel panels (anytime).
- §10.3 new-signal harness (anytime).

## Cross-Links

- **FP-065** — Per-lot entry-attribution (full §1.1) — the keystone carrier; chartered 2026-06-30 in `docs/08-planning/feature-proposals.md`.
- **ACT-419** — Batch-one ranking-snapshot floor (MIG-149 + `rebalance-ranking-snapshot-writer.ts`), deployed 2026-06-30.
- **ACT-420** — CI revision-fix on the writer (no-explicit-any).
- **DW-201** — Short-skew (B8 substrate dependency).
- **DW-204** — Shadow-rank overlap stall (1.2 substrate dependency; CONTAINED via ACT-410).
- **[`signal-roi-audit-findings.md`](./signal-roi-audit-findings.md)** — sibling ROI register (findings-side; this register is substrate-side).
- **DEC-070** — `intraday_slot` PK rotation (the reason §1.1 is foreclosed post-hoc).
- **§14 ROI-as-first-class-axis** — the governance anchor for this workstream.

## Horizon-Set Note

Realized-return horizons referenced throughout are **{1, 5, 10, 20} days** (post-widening per the 2026-06-23 migration), **NOT** the original `{1, 5, 20}` from the initial `combiner_forward_returns` migration. All items in this register that join against forward-returns assume the widened set.

## Status & Authorization Boundary

**SCOPING ROADMAP.** Items above are **candidates for individual FP authoring** — they are NOT authorized build. The only items in any authorized state are:

- §1.1 batch-one floor — **SHIPPED** (ACT-419).
- §1.1 per-lot perfection — **CHARTERED** as FP-065 (DOCUMENTATION-ONLY at registration; build deferred post-window).

Every other item requires the standard FP loop (propose → operator approve → execution charter → build) before any code or migration lands.
