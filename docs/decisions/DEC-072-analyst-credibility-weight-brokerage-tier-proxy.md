# DEC-072 — Signal #1 Analyst-Revision: Credibility-Weight v1.1 (Brokerage-Tier Proxy)

- **ID:** DEC-072
- **Title:** Replace the acknowledged v1 uniform `ANALYST_CREDIBILITY_WEIGHT = 1.0` placeholder (DEC-055 §a) in `compute-analyst-revision.ts:208` with a curated brokerage-tier weight `credibilityWeight(analystCompany)` (tier-map over ~50 firms covering >90% of FMP price-target-feed revisions; bulge / mid / boutique / unknown tiers, with literature-justified multipliers).
- **Plan Section:** longshort — Signal ROI audit (Signal #1 analyst revisions).
- **Date Proposed:** 2026-06-30
- **Decision Type:** Tier A — CRITICAL-signal construction change. Signal #1 is §4.4.x CRITICAL; mutating the contribution kernel (even via a localized multiplier) is ROI-changing per the project ROI guardrails and must not be silent.
- **Status:** **PROPOSED (charter) — BUILD DEFERRED to the post-audit weekend-slate ranking.** Operator explicitly chose Option 3 (charter, build-defer): rank against the full 9-signal weekend slate before committing the build slot.
- **Supersedes:** none (refines DEC-055 §a — the uniform placeholder — without superseding §c true-delta sign rule).
- **Superseded By:** —

## Framing (load-bearing)

`compute-analyst-revision.ts:208` computes per-revision contribution as `dir × clipped × ANALYST_CREDIBILITY_WEIGHT × decay` with `ANALYST_CREDIBILITY_WEIGHT = 1.0` — an explicit v1 placeholder ratified at DEC-055 §a pending a defensible skill proxy. The placeholder treats a star analyst's revision identically to a herding-laggard's.

**Literature (skill is heterogeneous AND persistent):** Fang & Yasuda (2009, *RFS*) — All-America-ranked analysts produce persistently larger abnormal returns than non-ranked peers; Loh & Stulz (2011, *RFS*) — only ~12% of recommendation changes are "influential," concentrated in leader/star/experienced subsets; Stickel (1992), Mikhail-Walther-Willis (1997, 2007), Clement (1999), Hong-Kubik (2003) — prior-accuracy-weighted consensus dominates equal-weighted consensus; Brown-Call-Clement-Sharp (2015 buy-side survey) — practitioners weight by track record. **Magnitude (directional):** Loh-Stulz' influential subset roughly doubles average price-impact vs full sample. **No fabricated our-universe Sharpe** — published cross-sectional results only.

**Verified construction facts (HEAD `3c259f07`):** (1) `analystName` + `analystCompany` ARE surfaced (`analyst-identity.ts:38-39`); (2) `ANALYST_CREDIBILITY_WEIGHT` is a single localized multiplier (`compute-analyst-revision.ts:208`); (3) FMP supplies `analystCompany` but does NOT supply an accuracy score or II-ranking — gold-standard skill proxies require accrued internal history (DW-179) or a paid vendor feed (DW-181).

## The operator-decided rationale for CHARTER-ONLY (the load-bearing trade-off)

The tier-weight is a **proxy for a proxy** — bulge-bracket ≈ resourced ≈ skilled, with edge leaking at each ≈. Fang-Yasuda's persistence result is about INDIVIDUAL analyst skill, not firm tier; firm-tier captures a fraction of the LARGE lever (per-analyst rolling accuracy, DW-179). The tier-map also carries recurring maintenance (M&A: Credit Suisse → UBS; First Republic; regional rebrands).

Per the project ROI guardrails, ROI-changing construction changes should be MEASURED, not GUESSED. The tier-weight is a hand-curated GUESS. Shipping it pre-measurement would also FORECLOSE the cleaner Phase-7 outcome: if DW-179 measured accuracy-weights land later with a tier-weight already in production, we cannot cleanly attribute marginal contribution.

Therefore: charter the lever for visibility, pin the ex-ante rationale so it is not re-litigated, and DEFER the build decision to the post-audit weekend-slate ranking.

## Decision

### Clause (a) — KEYSTONE: charter the brokerage-tier credibility weight as the v1.1 replacement target

> **PROPOSED:** the v1.1 replacement for the uniform `ANALYST_CREDIBILITY_WEIGHT = 1.0` is `credibilityWeight(analystCompany)`, with `analystCompany` normalized (case + entity-suffix folding) and mapped to `BULGE` / `MID` / `BOUTIQUE` / `UNKNOWN` via a curated tier-map. The DEC binds the SHAPE (4 tiers, single-multiplier-per-tier, applied at line 208) and the PROXY CHOICE (firm tier, not analyst identity). Tier-map contents are bound at build PR.

### Clause (b) — KEYSTONE: multipliers are literature-anchored DEFAULTS, not a measured ablation

> **PROPOSED:** the tier multipliers SHIPPED at build shall be `{ BULGE: 1.3, MID: 1.0, BOUTIQUE: 0.7, UNKNOWN: 1.0 }`, pinned in this DEC to prevent build-time drift. The numbers are NOT a fit to our universe (which would be pre-data tuning of a CRITICAL signal); they reflect the Fang-Yasuda / Loh-Stulz ranking-effect direction at conservative magnitude. Promotion / amendment requires DW-179 measured weights or an explicit DEC amendment with evidence bundle.

### Clause (c) — SEAM: contained-multiplier swap, no kernel restructure

> **PROPOSED:** the build (if authorized) replaces ONLY the literal `ANALYST_CREDIBILITY_WEIGHT` constant reference at `compute-analyst-revision.ts:208` with a `credibilityWeight(rev.analystCompany)` call. The decay, magnitude cap, true-delta sign rule (DEC-055 §c), same-analyst-prior recovery, and typed-absence semantics are UNCHANGED. The tier-map lives in a new `analyst-credibility-tiers.ts` (≤ 50 firms; UNKNOWN default for unmapped). No `signal_observations` change, no migration, no orchestrator change.

### Clause (d) — BUILD-AUTHORIZATION: deferred to post-audit slate

> **OPERATOR DECISION (2026-06-30, Option 3):** charter only; do NOT authorize the build this turn. Build-slot ranking happens after the full 9-signal audit completes (#4 / #8 / #9 / #3 remain). Two outcomes possible: (i) authorized in the consolidated post-audit weekend PR (PROPOSED → RATIFIED at that authorization); (ii) dropped from the slate in favor of larger levers elsewhere (this DEC stays PROPOSED indefinitely, v1 placeholder remains acknowledged, no silent drift, DW-179 remains the LARGE lever).

### Clause (e) — DO-NOT-CONFLATE: this DEC does NOT cover the LARGE accuracy-weight lever

> **PROPOSED:** the per-analyst rolling accuracy weight (DW-179, Phase-7) is the LARGE lever; this DEC's tier-weight is the SMALL near-term lever. Authorizing or building this DEC does NOT discharge DW-179 — they are independent and ultimately stackable (firm-tier prior × per-analyst accuracy-posterior is the natural Bayes shape). The capture step DW-179 depends on (DW-178) is independently TIME-SENSITIVE and is the only item in this cluster where waiting has a permanent cost.

## What this DEC explicitly does NOT decide

- **Revision-type choice** (price-target vs EPS-estimate vs rating change). DW-180 charters the EPS-stream as a parallel signal; rating-change is included there as a sparse third stream; both Phase-7-gated. This DEC stays on the price-target feed.
- **Decay horizon** (5-day vs documented weeks-to-months drift). DW-182 charters the Phase-7 decay-horizon ablation. This DEC does NOT touch `exp(−age/5)`.
- **II All-America ranking weight** (vendor-gated). DW-181 charters the procurement charter.
- **DEC-055 §c** (true-delta sign rule — the NKE catch). UNCHANGED; that clause is the construction's load-bearing sophistication and is the reason Signal #1 is "best-constructed of the audit so far" per the #1 verdict.

## Cross-references

- DEC-055 §a (the uniform-placeholder this DEC refines) + §c (true-delta sign rule, UNCHANGED).
- DW-178 (per-revision-outcome CAPTURE step — TIME-SENSITIVE; the only near-term build candidate in this cluster), DW-179 (LARGE accuracy-weight lever), DW-180 (EPS-estimate parallel stream + rating-change third stream), DW-181 (II vendor charter), DW-182 (decay-horizon Phase-7 ablation).
- `compute-analyst-revision.ts:208` (the multiplier swap site).
- `analyst-identity.ts:38-39` (the `analystName` + `analystCompany` surfacing that makes the tier-weight buildable).
- ROI guardrails (project-knowledge KB): ROI-changing construction changes must be flagged and operator-approved before scope — this DEC is the flag.
- Signal ROI audit ledger: `docs/06-tracking/signal-roi-audit-findings.md` #1 verdict.
- **ACT-353** (this charter's authoring action).
