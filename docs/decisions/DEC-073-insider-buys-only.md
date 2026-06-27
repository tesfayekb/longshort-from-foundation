# DEC-073 — Signal #4 Insider Transactions: Buys-Only (Drop Sell-Side)

- **ID:** DEC-073
- **Title:** Drop the entire sell-side (S, discretionary-sale) branch from Signal #4 insider; the signal becomes a pure insider-BUY-pressure measure. Parameter-free, literature-direct expression of the buy/sell-asymmetry finding from Jeng-Metrick-Zeckhauser (2003), Lakonishok-Lee (2001), and Seyhun (1998).
- **Plan Section:** longshort — Signal ROI audit (Signal #4 insider transactions).
- **Date Proposed:** 2026-06-30
- **Decision Type:** Tier A — signal-definition change (non-critical). Signal #4 is NON-CRITICAL per §4.3.5 (only #6 momentum + #7 reversal are critical, per `signal-catalog.ts` and the `missing_critical_signal_{6,7}` excluded-reason enum). A definition mutation therefore requires a DEC (signal-construction change is ROI-changing per the project guardrails) but does NOT require a §4.3.5 critical-gate amendment — lighter friction than DEC-071 (which DID mutate a critical signal).
- **Status:** **PROPOSED — NOW-FIX, build authorized for the consolidated post-audit weekend PR.** The audit's SECOND now-fix (DEC-071 reversal-gate is the first). Distinct from DEC-072 (charter-deferred): this one ships with the weekend bundle because the urgency argument applies (see Clause f).
- **Supersedes:** none (refines DEC-058 §h dedup-key behavior implicitly — sell-side rows simply do not survive the §4.4.4 compute filter; DEC-058 dedup discipline is unchanged).
- **Superseded By:** —

## Framing (load-bearing)

`supabase/functions/_shared/longshort-signals/compute-insider.ts` (lines 32-36, HEAD `5abd6588`) treats buys and sells SYMMETRICALLY: `sign = +1` for transaction code `P` (open-market purchase) and `sign = −1` for transaction code `S` (discretionary sale), with **identical** role-weight × dollar-value × `exp(−age/14)` × market-cap normalization on both sides. A CFO's $5M post-vest diversification sell receives the same MAGNITUDE as the same CFO's $5M open-market conviction buy.

**Literature (buys carry the edge; sells are ~noise):**
- **Jeng, Metrick & Zeckhauser (2003), *RES*** — performance-evaluation methodology on Form 4 trades: insider PURCHASES earn **~11.2% per year abnormal**; insider SALES earn **essentially zero abnormal** (point estimate slightly negative, statistically indistinguishable from zero after risk adjustment). The asymmetry is **first-order**.
- **Lakonishok & Lee (2001), *RFS*** — the canonical 22-year CRSP/SEC Form 4 study: "predictive content is concentrated in purchases." Insider-sell portfolios show little to no predictive power once size/B-M controls are applied; sells are dominated by liquidity / diversification / tax / option-exercise motives.
- **Seyhun (1998), *Investment Intelligence from Insider Trading*** — same direction: buy-informativeness >> sell-informativeness; sells noisy because sellers diversify concentrated comp packages.
- **Economic logic:** insiders buy for ~one reason (expected appreciation, personal capital at risk, disclosure penalty); insiders sell for many reasons (planned liquidity, taxes, college tuition, divorce, RSU vest mechanics, post-vest diversification, exercising deep-ITM options before expiry). Even with the 10b5-1 PLANNED exclusion we already apply, "discretionary sell" still bundles a heavy non-informational tail.

**Verified construction facts (HEAD `5abd6588`):** (1) sign is symmetric `+1`/`−1` at `compute-insider.ts:32-36`; (2) role-weight × dollar × `exp(−age/14)` × market-cap normalization applies identically to both sides; (3) the 10b5-1 planned-sale exclusion (`aff_10b5_one === false` filter) currently runs on the S-branch only; (4) the EDGAR pipeline ALREADY persists `owner_cik` on each parsed Form 4 row (MIG-095 / ACT-191; dedup key `(issuer_cik, owner_cik, transaction_date, transaction_seq)` per DEC-058 §h) — so the opportunistic/routine CMP classifier is NOT a time-sensitive capture (verified, distinct from analyst DW-178); (5) Signal #4 is NON-CRITICAL per §4.3.5 (only `missing_critical_signal_6` and `missing_critical_signal_7` exist in the excluded-reason enum).

## Decision

### Clause (a) — KEYSTONE: drop the entire S-side branch from §4.4.4 compute

> **PROPOSED:** the build replaces the symmetric `sign = +1 if code==='P' else −1 if code==='S'` mapping in `compute-insider.ts:32-36` with a **buys-only filter**: rows where `transactionCode !== 'P'` are dropped at the same filter site that today drops option-exercise / grant / gift. The signal becomes a pure insider-buy-pressure measure. No sign field needed (all surviving rows are `+1` by construction; the multiplication can be elided).

### Clause (b) — PARAMETER-FREE (the discipline)

> **PROPOSED:** buys-only is the LITERATURE-DIRECT, ZERO-FREE-PARAMETER expression of the Jeng-Metrick-Zeckhauser finding. The alternative — sell-side down-weight by a multiplier `β < 1` — is explicitly REJECTED as the now-fix: literature gives a directional range (~0.2–0.4) but no specific value; shipping a guessed β would be the analyst-tier-weight anti-pattern (ship a guess + still owe the Phase-7 measurement). The sell-down-weight β is the Phase-7 ablation (DW-183), MEASURED not GUESSED.

### Clause (c) — SEAM: the 10b5-1 exclusion becomes moot

> **PROPOSED:** with no S-rows surviving the §4.4.4 filter, the `aff_10b5_one === false` discretionary-sale predicate has nothing to act on. The build SIMPLIFIES the filter (drop the S-branch entirely, including its 10b5-1 sub-clause). Build PR must verify the filter cleanly removes the S-path WITHOUT orphaning the 10b5-1 flag handling (no dead reads of `aff_10b5_one`, no broken type-narrowing). The `transaction_code` field continues to be persisted by the EDGAR pipeline unchanged (drop is at compute, not at ingestion — preserves the symmetric shadow variant in Clause (g)).

### Clause (d) — NON-CRITICAL: DEC suffices; §4.3.5 unchanged

> **PROPOSED:** Signal #4 remains NON-CRITICAL per §4.3.5. The signal continues to emit a `{__value, __is_present}` typed-absence pair (not a bare critical numeric). No `signal-catalog.ts` change. No `excluded_reason` enum addition. No migration. Lighter governance friction than DEC-071 by design.

### Clause (e) — TYPED-ABSENCE UNCHANGED

> **PROPOSED:** a name with no qualifying PURCHASES in the lookback window → `no_qualifying_transactions` typed-absence (identical sentinel-key the symmetric version emits today; the literal is reused, not duplicated). No `Decimal('-999')` written. No fabricated zero. The §9 sentinel discipline is preserved verbatim.

### Clause (f) — PRE-TRAINING URGENCY (why NOW-FIX not Phase-7)

> **PROPOSED:** the combiner has NOT yet trained (no production combiner model exists at HEAD `5abd6588`). Shipping buys-only NOW gives the eventual trainer the purest literature-supported signal; deferring means training on the KNOWN-DILUTED symmetric signal, baking the dilution into the learned weights, and then needing a retrain to undo it. This is the now-fix argument, parallel to DEC-071's "unmitigated now" argument but via a different mechanism (don't bake the dilution into training). The urgency window CLOSES at first combiner training fire.

### Clause (g) — THE SHADOW SYMMETRIC VARIANT (recoverability)

> **PROPOSED:** the build stands up the **ungated SYMMETRIC variant** (today's `+1/−1` construction, including the 10b5-1 discretionary-sale logic) as a §6.5 shadow signal alongside the buys-only live signal. Phase-7 (DW-183) measures retrospectively whether the dropped sell-side carries any edge in OUR universe. If sells turn out to carry edge, the path back is a DEC-073 amendment FP with a MEASURED β — the loss is fully recoverable. The shadow stand-up keeps `transaction_code` ingestion at the EDGAR layer unchanged so the shadow has data parity with the live signal.

### Clause (h) — DO-NOT-CONFLATE

> The decay-horizon question (14-day too fast vs months-long insider drift) is DW-184 (Phase-7 ablation), NOT part of this DEC. The opportunistic-vs-routine CMP classifier (Cohen-Malloy-Pomorski 2012) is DW-185 (Phase-7 + free-EDGAR backfill ETL), NOT part of this DEC. Authorizing DEC-073 does NOT discharge DW-184 or DW-185; they are independent levers and ultimately stackable (buys-only × longer-decay × opportunistic-subset is the natural composition).

## What this DEC explicitly does NOT decide

- The decay-horizon value (current `exp(−age/14)`): deferred to DW-184 Phase-7 ablation. Guess-tuning 14d → Nd is the silent ROI change explicitly forbidden by the ROI guardrails.
- The opportunistic/routine classification: deferred to DW-185 (Phase-7 + free-EDGAR backfill ETL spec).
- The 5-tier role-weight values (DEC-058 §c): UNCHANGED.
- The market-cap normalization: UNCHANGED.
- The DEC-058 §h dedup key: UNCHANGED.
- The EDGAR ingestion contract (hardened this session with acceptance-datetime, CIK-to-ticker, dedup/pacing): UNCHANGED.

## Build authorization

Authorized for the consolidated post-audit weekend PR alongside DEC-071 (reversal gate + magnitude cap). The two are independent (different signals, different orchestrators, different test files) and can land in the same PR or be split. Build PR must include: (a) buys-only filter at `compute-insider.ts`; (b) shadow symmetric variant on §6.5 harness; (c) compute-insider_test.ts updates (buys-only path + verify no S-row survives + typed-absence on no-qualifying-purchase); (d) compute-insider_test.ts shadow-variant test (symmetric variant emits today's value); (e) zero schema change, zero migration, zero orchestrator change.

## Cross-references

- **Spec:** §4.4.4 insider transactions (CROSSWIND v0.9 design-source, never edited).
- **Prior decisions:** DEC-058 (insider role-weights + dedup key §h); DEC-055 (analyst-revision construction — sister signal); DEC-071 (reversal now-fix — the FIRST construction now-fix of the audit, sister to this one); DEC-072 (analyst tier-weight — the charter-deferred contrast that this DEC explicitly diverges from per Clause b).
- **DWs:** DW-183 (buy/sell-asymmetry Phase-7 ablation — measures whether the dropped sell-side carries edge); DW-184 (insider decay-horizon Phase-7 ablation); DW-185 (Cohen-Malloy-Pomorski opportunistic/routine classifier — NOT time-sensitive because owner_cik already persisted per MIG-095).
- **Migrations:** MIG-095 (owner_cik persistence — the reason CMP is not time-sensitive).
- **Audit ledger:** `docs/06-tracking/signal-roi-audit-findings.md` Signal #4 verdict.
- **Action records:** ACT-191 (MIG-095 owner_cik landing); **ACT-354 (this DEC + DW-183/184/185 registration).**
- **Literature:** Jeng-Metrick-Zeckhauser 2003 *RES*; Lakonishok-Lee 2001 *RFS*; Seyhun 1998 *Investment Intelligence from Insider Trading*; Cohen-Malloy-Pomorski 2012 *JF* (background for DW-185, not this DEC); Ali-Hirshleifer 2017 (replication, background).