# CROSSWIND_SPEC v0.9 — Part 3a of 10 (§10.0 through §10.7 — Build/foundation phases)

**Consolidation note:** This file is Part 3a of 10 consolidation responses. Part 3a covers the v0.9 §10 phase plan build/foundation phases (§10.0 Section overview, §10.1 Phase structure overview, §10.2 Timeline framing, §10.3 Phase 0A Foundation, §10.4 Phase 0B Reconciliation engine + replay framework + evidence tooling, §10.5 Phase 1 Universe ingestion, §10.6 Phase 2 Signal stack, §10.7 Phase 3 Combiner with missingness stress test). Part 3b will cover §10.8-§10.16 (Phase 4-9 live-operation phases + ROI levers + anti-patterns + phase plan principles). Per operator's revised consolidation sequence, total parts = 10: Part 1 (§0-§5) + Part 2 (§6-§9 v0.8 baseline + §6 v0.9 deltas) + Part 2b (§7.4-§7.13 + §11.0 interstitial) + Part 2c (§8.0-§8.12) + Part 3a (§10.0-§10.7) + Part 3b (§10.8-§10.16) + Part 4a (§11) + Part 4b (§12 + §16 + §17 + §18) + Part 5 (ADR-001-reconciliation-architecture.md) + Part 6 (spec-source-index.md with consolidated forward-tracking inventory). Retroactive "Part X of 10" header updates for prior parts handled at v0.9 final assembly per Part 6 §5 bookkeeping convention. All §10 content in Part 3a is **(NEW v0.9)** or **(REVISED v0.9)** — v0.8 §10.1-§10.6 baseline is structurally replaced by v0.9 §10.1-§10.7 with Phase 0A/0B split. Canonical sources: prior conversation transcript drafts in `/mnt/transcripts/2026-05-15-04-55-32-crosswind-spec-v09-drafting.txt` (Response 1 §10.0-§10.7 Pass A at message-line 900; V1+V2+A1-A6 integrations at next message; Response 3 cross-section refinements R1 Gate 2 outcome classification applied to §10.4 Phase 0B exit gate). Forward reference applied per Part 2c forward-tracking item 7: §10.4 Phase 0B supporting deliverable for Alpaca multi-pending-order behavior validation per §8.6.1.1.

---

## §10.0 Section overview *(NEW v0.9)*

§10 specifies the phase-by-phase build sequence for Crosswind. Each phase delivers a complete operational component built behind the foundational reconciliation layer (§11.0), with full §11/§12 discipline applied (modular isolation, testing, monitoring, evidence-tier compliance, documentation, runbooks). Each phase has explicit exit gates that must be met before advancing.

The v0.9 phase plan substantially restructures v0.8's 10-phase architecture:

- **Phase 0 splits into Phase 0A (foundation) and Phase 0B (reconciliation engine + replay framework + evidence-workflow tooling).** Phase 0B is the architectural commitment of v0.9 — the reconciliation layer is built before any business logic.
- **Phase 2 sub-phases capture missingness profile data** for Phase 3 combiner training (per §6.5.3).
- **Phase 3 adds the missingness stress test exit gate** (per §6.5.4).
- **Phase 4 validates wash sale tracking infrastructure** including §7.7 Path A/B and §7.8 retroactive cost-basis adjustment.
- **Phase 5 validates the §8 two-phase execution state machine** including SSR routing, broker rejection propagation, and partial-fill discipline.
- **Phase 7 adds the reconciliation-quietness exit gate** (30 RTH days of explained firings per §11.0.11).
- **Phase 8 adds live-broker reconciliation verification** (paper-vs-live behavior differences may require tolerance ADRs).
- **Phase 9 adds sustained-reconciliation-anomaly kill condition** for gradual systemic drift detection.

---

## §10.1 Phase structure overview *(NEW v0.9)*

| Phase | Name | Duration (AI-accelerated w/ §12.5 discipline) | Capital deployed | Kill possible? |
|---|---|---|---|---|
| 0A | Foundation infrastructure | 2-4 weeks | None | No (foundation) |
| 0B | Reconciliation engine + replay framework + evidence tooling | 6-10 weeks baseline; 7-10 realistic; may extend to 11-12 weeks (V1) | None | No (foundation) |
| 1 | Universe ingestion | 2-4 weeks | None | Yes |
| 2 | Signal stack (9 sub-phases) | 8-14 weeks | None | Yes (3+ signal failures) |
| 3 | Combiner and modeling | 4-6 weeks | None | Yes (if combiner doesn't learn) |
| 4 | Portfolio construction + wash sale infrastructure | 4-6 weeks | None | Yes |
| 5 | Execution layer (paper) | 3-4 weeks | None | Yes |
| 6 | Full system integration | 3-5 weeks | None | Yes |
| 7 | Paper trading validation | 3-6 months | Paper $100K | Yes |
| 8 | Small live operational validation | 3-6 months | Operator-chosen small | Yes |
| 9 | Scaled deployment | Ongoing | Operator-chosen intended | Ongoing kill via §11.6 |

**Pre-paper-trading total (Phases 0A-6): 32-53 weeks ≈ 7-12 months of focused work.** (Updated per V1: Phase 0B baseline shifted from 5-8 weeks to 6-10 weeks; pre-paper-trading total accordingly shifts from 31-51 to 32-53 weeks.)

**Total to scaled deployment: roughly 14-25 months at planning numbers** (per C1 timeline math propagation correction — V1's +8-12 weeks of Phase 0B propagates +2-3 months total since Phase 7+8 are calendar-bound and cannot compress). **May extend up to 4-5 months further (16-27 months total) if Phase 0B extends to 11-12 weeks per V1 contingency.**

The v0.9 timeline at planning numbers is approximately +2-3 months longer than v0.8's 12-22 months per C1 timeline math propagation correction. V1's contingency extension (Phase 0B to 11-12 weeks) could add up to 4-5 months further. The honest framing is that 14-25 months is the planning-numbers commitment; 16-27 months is the contingency-aware upper bound. Underselling at 13-23 months creates operator commitment misalignment with realistic duration; the figures above reflect the corrected math.

---

## §10.2 Timeline framing — AI acceleration requires evidence discipline *(NEW v0.9)*

Build phases (0A-6) benefit substantially from AI development tools (Cursor, Lovable, Claude Code, Copilot) — sometimes 2-3× faster than without AI tools for code generation, documentation drafting, test scaffolding, and repetitive component plumbing.

**Critical qualification:** AI acceleration only materializes WITH the evidence-tier discipline of §12.5 and the reconciliation infrastructure of §11.0. AI tools without evidence discipline produce code that ships defects faster, not better code. AI tools without reconciliation infrastructure produce internally-consistent code that drifts from reality at the same accelerated rate.

The Phase 0B tooling investment (Strong-evidence workflow with <15-minute artifact generation per §11.0.13) is what enables AI acceleration to translate into actual velocity. Without it, AI tools accelerate the defect production rate at the same multiple they accelerate the code production rate. With it, AI tools accelerate validated-defect-free code production.

**Validation phases (7-9) do not accelerate.** They require calendar time to span market regimes, exercise quarterly tasks, demonstrate operator discipline through drawdowns, and verify reconciliation behavior across paper-to-live transitions. This is the honest constraint.

**Total elapsed time to scaled deployment is 14-25 months at planning numbers** (per C1 timeline math propagation correction). This is honest. Operator commitment to this horizon is required before Phase 0A begins. V1's Phase 0B contingency extension (11-12 weeks) could add up to 4-5 months further (16-27 months total). Quarterly self-assessment of project continuation viability is part of operational discipline (per §10.16, Part 3b scope).

The duration estimates above are planning numbers, not commitments. Sub-phases advance when their gates are met, not on a calendar.

---

## §10.3 Phase 0A — Foundation infrastructure *(REVISED v0.9 — Phase 0 split into 0A/0B)*

**Assumption:** A foundation with basic login/logout, authentication, and GitHub repository structure is provided as the starting point. Phase 0A integrates Crosswind-specific infrastructure onto this foundation.

**Goal:** Establish operational infrastructure such that Phase 0B can be built with §11/§12 discipline supported by default.

**Deliverables:**

1. Crosswind repository integrated with provided foundation. GitHub workflows, branch protection, CI/CD pipelines.
2. AI development rules file authored and committed (Cursor's `.cursor/rules`, `CLAUDE.md`, `AI_RULES.md` per §12.5). Initial version includes Rules 1-10 with placeholder tier-evidence requirements; full evidence-hierarchy enforcement activates in Phase 0B.
3. Documentation infrastructure scaffolded: Tier 1 spec (CROSSWIND_SPEC.md), Tier 2 component templates, Tier 3 runbook templates, `SYSTEM_DEPENDENCIES.md` skeleton, `docs/decisions/` with first ADR template.
4. Task tracking system established (GitHub Issues with structured templates, Linear, or similar).
5. Database infrastructure operational: Supabase project, base schema for system-level tables (`audit_log`, `configuration`, `feature_flags`, `operators` for multi-instance optionality per §9.7), migration tooling. **All Crosswind-specific tables created in Phase 0A or later are keyed by `(operator_id, ...)` rather than just the natural key.** v1 uses a single operator_id throughout but schema does not preclude multi-operator deployment in v2.
6. Compute infrastructure operational: Modal workspace, environment management, secret management.
7. Observability infrastructure: logging pipeline, error tracking, metrics collection, alerting routes, dashboard skeleton.
8. Kill-switch architecture per §11.6 (soft pause, hard pause, manual liquidation) implemented at infrastructure level.
9. Configuration management: environment variables, feature flags, configurations managed through single mechanism with §12.7 versioning.
10. Operator dashboard skeleton, ready to display component metrics as components come online.

**Exit gates to Phase 0B:**

- All deliverables complete and documented
- A "hello world" Crosswind component deploys end-to-end (e.g., trivial daily job writing to database and emitting health metric)
- Documentation passes review: outside reader could understand project structure from docs alone
- AI development rules tested: at least one AI-tool-generated change processed through the rules
- Kill-switch tested: soft pause and hard pause manually triggered and verified
- Multi-instance schema convention verified: a test inserting two operator_ids and querying with operator_id filter returns isolated results

**Kill condition:** None. Phase 0A is foundation.

**Duration estimate:** 2-4 weeks.

---

## §10.4 Phase 0B — Reconciliation engine + replay framework + evidence tooling *(NEW v0.9)*

**Phase 0B is the architectural commitment of v0.9.** Its deliverables form the structural verification layer that all subsequent business logic operates behind. The deliverables are listed in priority order per §11.0.13; if time pressure forces triage, the priority order determines what gets built first.

**Priority deliverables:**

**1. Reconciliation engine** with all 17 `verify_*` interfaces per §11.0.7 and the `reconciliation_events` table per §11.0.10:

- `verify_position` (#1), `verify_quote` (#2), `verify_quote_freshness` (#3), `verify_short_availability` (#4), `verify_ssr_status` (#5), `verify_halt_status` (#6), `verify_borrow_rate` (#7), `verify_borrow_persistence` (#8), `verify_buying_power` (#9), `verify_universe_membership` (#10), `verify_corporate_action_clean` (#11), `verify_settlement_status` (#12), `verify_order_acceptance` (#13, tri-state), `verify_realized_pnl` (#14), `verify_lot_record` (#15), `verify_wash_sale_record` (#16), `verify_rebalance_aggregate` (#17)
- Per-call tolerance classes per §11.0.9 (Zero-tolerance / Low-tolerance / Noise-tolerant) with magnitude-based escalation overrides
- `reconciliation_events` table per §11.0.10 schema, keyed by `(operator_id, event_id)` per multi-instance optionality
- All 17 interfaces with stub implementations against Alpaca paper trading and dual quote sources (Polygon + Tradier/Yahoo)
- Failure-action behavior wired per §11.0.8 (specific action per call, not generic)
- **Sustained-anomaly baseline aggregation infrastructure (per A1):** aggregation views (daily/weekly/monthly per call_name per outcome) and baseline-vs-current comparison query helper. Baseline values themselves populate during Phase 7 paper trading, but the aggregation infrastructure must exist from Phase 0B to support Phase 9 sustained-anomaly kill condition per §10.13.

**2. Strong-evidence workflow tooling** with <15-minute wall-clock target and CI enforcement:

- One-command replay execution against captured RTH days
- Auto-generated reconciliation telemetry reports (PR-ready)
- Pre-built broker-API spot-check scripts (Alpaca position/order/account queries)
- `reconciliation_events` query helper: "show me new firing patterns since deploy" — the actual mechanism that replaces "tests pass" as evidence per §11.0.10
- CI enforcement per §12.5: PRs tagged with evidence tier (Strong+/Strong/Medium/Weak); CI rejects Strong+ and Strong tier PRs missing the three required artifacts (replay-test PASS, reconciliation telemetry zero-bug-firings, ground-truth spot-check) regardless of test status
- `[bypass-evidence-tier]` operator override mechanism with audit-table logging for quarterly review

**3. Replay framework** with capture scope per §11.0:

- Broker state stream: positions, orders, fills, borrow status, account state (Alpaca `/v2/positions`, `/v2/orders`, `/v2/account`, `/v2/assets/{symbol}`)
- Signal-source quote stream (Polygon Stocks Advanced)
- Reconciliation-source quote stream (Tradier or Yahoo Finance)
- Broker-source quote stream (Alpaca `/v2/stocks/{symbol}/quotes/latest`)
- Halt feed (Polygon real-time with exchange feed)
- Locate feed (Alpaca locate API responses)
- Corporate actions feed (Polygon Corporate Actions API)
- Combiner I/O capture: at every ranking event, the full set of `(symbol, signal_id, value, is_present, timestamp)` tuples fed to the combiner AND the produced ranking with rank, score, SHAP attribution per name
- Deterministic replay engine: given captured day data, system can re-run the day end-to-end producing identical outputs (where signal-dependent randomness exists, captured with seeds)

**Supporting deliverables:**

- Alpaca paper account integration (real broker connection for reconciliation against real Alpaca paper state, not mocked)
- Captured Day 1: one complete RTH day of all the above feeds stored in replay storage
- `.cursorrules` evidence-hierarchy file with explicit examples of Strong+/Strong/Medium/Weak evidence — tested by processing one trivial Strong-tier change end-to-end through the evidence hierarchy
- ADR-001-reconciliation-architecture.md authored in `docs/decisions/` with full architectural rationale and source attribution
- `docs/decisions/spec-source-index.md` authored with attribution of every major architectural decision to its source
- **Alpaca multi-pending-order behavior validation (per §8.6.1.1 short-stop parallel-order mechanism requirement):** Phase 0B captures sample multi-pending close-side orders on the same symbol against Alpaca's actual paper trading API. Validates whether Alpaca cleanly supports the parallel-order mechanism for short-stop Phase 1 timeout handling per Part 2c §8.6.1.1. If unclean, v0 fallback (operator page + continued aggressive escalation per §8.6.2) determined operational for v1. Determination documented and committed before Phase 0B exits.

**Phase 0B exit gate (CRITICAL — specified inline per §11.0.11; outcome classification per R3-R1):**

**Every firing produced during Phase 0B captured-day analysis is root-caused** to one of:

(a) **A documented false positive** with tolerance band tuned and an ADR per §11.0.9 explaining the new tolerance with rationale (the legitimate divergence pattern observed, why the new tolerance is appropriate, what real divergence the new tolerance might miss, quarterly review commitment);

(b) **A real-world divergence** handled per the per-call failure-action table per §11.0.8 (the specific action defined inline at the call site, not generic "refuse to operate");

(c) **A system bug** that has been fixed before phase exit, with the fix itself going through evidence-tier discipline per §12.5.

**Unresolved or unexplained firings block phase exit.**

**Outcome classification (per Response 3 R1, applies symmetrically to Phase 0B exit gate, Phase 7 Gate 2, Phase 8 Gate 2 post-calibration):**

Firings count against the quietness gate (block phase exit) when ANY of:

- `outcome = system_bug` (unresolved)
- `outcome = failure_handled` but required operator intervention beyond standard runbook procedures
- `outcome = failure_escalated` unresolved or unable to be documented as real-world divergence

Firings do NOT count against the quietness gate when:

- `outcome = false_positive_within_tolerance`
- `outcome = expected_divergence_handled`
- `outcome = failure_handled` and handled per the per-call failure-action table without operator intervention
- `outcome = failure_escalated` and resolved to documented real-world divergence

**Qualifier on "operator intervention":** runbook-driven action (manual cache refresh after a documented broker outage, executing a documented recovery procedure) is expected operational discipline and does not count. Operator-bespoke intervention (custom debug queries to figure out what went wrong, ad-hoc investigation beyond runbook scope) signals a bug and counts.

**Rationale for this gate** (per §11.0.11): a literal zero-firings gate creates pressure to widen tolerances until the gate passes, which defeats the engine's purpose. The empirical question is not "does the engine ever fire" — it should fire on Day 1; that's evidence it's working — but "is every firing understood and either accepted as a real-world divergence or fixed as a defect." Anything else means the engine produces signals the team doesn't understand, which is structurally indistinguishable from no engine at all.

**Realistic time impact (per V1):** Phase 0B baseline is 6-10 weeks, 7-10 weeks realistic, may extend to 11-12 weeks if Day 1 has many legitimate edge cases requiring tolerance tuning ADRs or Alpaca integration surprises. This extension is the right work to do at the right time. Phase 1 cannot begin until the reconciliation layer is operationally trustworthy. Duration is planning, not commitment — exit gate per §11.0.11 binds, calendar does not.

**Validation requirement for the evidence-workflow tooling:**

Before Phase 0B exits, the Strong-evidence workflow must be validated empirically: a trivial Strong-tier change (e.g., a minor MTM adjustment to a non-financial-correctness aspect, treated as Strong-tier for validation purposes) is processed end-to-end through the tooling. Target: <15 minutes wall-clock time from code change to all three evidence artifacts produced. If the tooling exceeds 15 minutes for a trivial change, it will exceed acceptable thresholds for non-trivial changes during Phase 2+, and discipline will degrade. Tooling investment continues until the <15-minute target is met.

**Kill condition:** None. Phase 0B is foundation. However, if reconciliation engine fundamentally cannot be made operational against Alpaca paper (e.g., Alpaca's locate API behavior is structurally inconsistent), Phase 0B revisits its dependency choices (different broker, different reconciliation source). This is an extension scenario, not a kill scenario.

**Duration estimate (V1):** 6-10 weeks baseline; 7-10 weeks realistic; may extend to 11-12 weeks.

---

## §10.5 Phase 1 — Universe ingestion and management *(REVISED v0.9 — reconciliation integration)*

**Goal:** Build and validate the universe component as a complete operational deliverable behind the reconciliation engine.

**Deliverables:**

1. Constituent ingestion (S&P 500 + S&P 400) from primary source per §3.1. **Backup source operational with cross-check running every refresh per §11.0.5 ingestion-time reconciliation requirement (per A4 — operational, not just documented); cross-check emits `reconciliation_events` rows.**
2. Universe filter implementation per §3.2.
3. Hard exclusion infrastructure per §3.3 (earnings windows, M&A, halts, HTB, short interest with their continuous refresh per §3.4).
4. Quarterly atomic refresh job (first trading day Jan/Apr/Jul/Oct per §3.4).
5. Continuous hard-exclusion refresh.
6. Schema: `universe_membership`, `hard_exclusions` — both keyed by `(operator_id, ticker, as_of_date)` per multi-instance optionality.
7. **Integration with `verify_universe_membership` (§11.0.7 #10):** the universe component is built to be the source of truth that `verify_universe_membership` queries. The verify_* interface's stub implementation in Phase 0B becomes the real implementation during Phase 1.
8. **Cross-check infrastructure per §11.0.5 operational (per A4):** Polygon reference data vs secondary source (S&P direct or iShares ETF holdings) for quarterly refresh accuracy. Cross-check runs every refresh, not just documented. Divergence → `reconciliation_events` row with `outcome = failure_handled` or `failure_escalated`.
9. Health monitoring per §11.3 (universe size, filter rates, hard exclusion counts).
10. Component documentation per §12.4.
11. Testing per §11.4 including replay-test integration: universe ingestion replayable against captured constituent data.
12. Runbooks for known failure modes.

**Exit gates to Phase 2:**

- Universe produced reliably for current date; manual sanity review passes
- Hard exclusions correctly identify known recent events (synthetic and real)
- Quarterly refresh executed successfully at least once in test mode
- All §12.4 documentation and §11.4 test coverage met
- Component can be disabled via configuration flag without breaking infrastructure
- Component dashboards populated and reviewable
- **`verify_universe_membership` operates against universe ingestion output without firing `system_bug` events during sub-phase validation.** Firings of `failure_handled` outcome are acceptable (real divergences caught and handled); firings of `system_bug` outcome block Phase 1 exit.
- **Ingestion-time cross-check operational (per A4):** cross-check has run on at least one production refresh; emitted `reconciliation_events` rows are root-caused per §11.0.11.
- Phase 1 evidence-tier discipline operational: at least one Strong-tier change to universe component has gone through the full evidence workflow with <15-minute artifact generation.

**Kill condition:** Universe component cannot be built reliably (e.g., no reliable constituent source, or reconciliation cross-check fires `system_bug` events that cannot be root-caused). Without a universe, there's no Crosswind.

**Duration estimate:** 2-4 weeks.

---

## §10.6 Phase 2 — Signal stack *(REVISED v0.9 — missingness profile capture per sub-phase)*

**Goal:** Build and validate each of the 9 signals as independent operational components, capturing missingness profile data for Phase 3 combiner training.

**Sub-phase sequence (each is itself a major deliverable):**

- **Phase 2.1:** Signal #6 — Cross-sectional momentum (12-1). First signal; establishes pipeline pattern. Includes shared within-sector GICS z-score normalization infrastructure. **Critical signal per §4.3.5.**
- **Phase 2.2:** Signal #7 — Short-term reversal. Reuses momentum infrastructure; validates pattern reuse. **Critical signal per §4.3.5.**
- **Phase 2.3:** Signal #5 — Short interest changes. Adds twice-monthly cadence pattern.
- **Phase 2.4:** Signal #4 — Insider transactions. Adds 30-min polling, SEC EDGAR/Polygon insider source with ingestion-time reconciliation per §11.0.5.
- **Phase 2.5:** Signal #1 — Analyst revision drift. Adds 15-min polling + pre-market poll pattern.
- **Phase 2.6:** Signal #2 — PEAD. Adds event-triggered + refresh pattern.
- **Phase 2.7:** Signal #3 — Options flow imbalance. Adds 5-min polling; highest data volume; tests compute budget.
- **Phase 2.8:** Signal #8 — News sentiment momentum. Adds news ingestion + sentiment classification.
- **Phase 2.9:** Signal #9 — Active catalyst flag. Adds catalyst event detection and tiering.

**Sub-phase ordering rationale (per A3):**

- **Critical signals (#6, #7) first** because they (a) establish the template reused for 2.3-2.9, (b) are sufficient for partial Phase 3 combiner validation even if some non-critical signals fail to build.
- **Non-critical ordering (2.3 → 2.9)** reflects roughly increasing implementation complexity and source-data integration overhead.

**Phase 2.1 template-establishment meta-deliverable (per A2):**

The first signal sub-phase establishes the pattern reused by 2.2-2.9. The template includes:

- Signal computation module
- z-score normalization wrapper
- `Optional[Decimal]` missing-data handling
- Ingestion-time reconciliation hook (where applicable)
- Missingness profile capture hook
- Replay framework integration
- Component documentation pattern
- Runbook structure

The template is reviewed and locked at Phase 2.1 exit before Phase 2.2 begins. This prevents ad-hoc template work distributed across sub-phases.

**Per-sub-phase deliverables (in addition to v0.8 baseline):**

1. **Signal pipeline implementation** with `Optional[Decimal]` return type per §4.3.5 (banned-pattern enforcement via §11.8 linting).
2. **Ingestion-time reconciliation** per §11.0.5 where applicable (price data vs backup, Form 4 vs EDGAR, short interest vs FINRA, earnings calendar vs alternate).
3. **Observed missingness rate capture:** during sub-phase operation, record per-symbol per-tick missing-vs-present state for this signal. Aggregate into the missingness profile document at sub-phase exit. The profile records per-signal baseline missingness rate, per-signal missingness conditional on sector, per-signal missingness conditional on time-of-day or time-since-event. **Profile feeds Phase 3 training-data generation per §6.5.3.**
4. **Replay framework integration:** the signal pipeline reads from captured RTH data for replay; signal values produced during replay are deterministic given replay inputs.
5. **Component documentation per §12.4** with cross-references to §4.4.x signal specification.
6. **Runbooks for known failure modes** including missing-data handling.

**Per-sub-phase exit gates:**

- Signal computes correctly for known recent observations (manual verification against synthetic and real cases)
- Distribution of z-scores: mean near 0, std near 1, clipping rare
- Computation completes within cadence budget
- Health monitoring reports correctly
- Failure modes tested including missing-data path (`Optional[Decimal]` type discipline preserved end-to-end)
- For critical signals (#6, #7): missing-signal path correctly excludes name from ranking per §4.3.5
- For non-critical signals (others): missing-signal path correctly emits `(value=sentinel, is_present=0)` feature pair per §6.5.2 with the locked sentinel `Decimal('-999')`
- Component can be disabled via configuration without breaking other signals
- **Missingness profile captured for the sub-phase's signal:** baseline rate, sector conditional, time conditional. Profile committed to `docs/missingness_profile.md`.
- Phase 2.x evidence-tier discipline operational

**Phase 2.1 specific additional exit gate:** template reviewed and locked at Phase 2.1 exit (per A2) — all template components (8 elements listed above) operational and documented. Phase 2.2 cannot begin until template is locked.

**Per-sub-phase kill condition:** Signal can't be built reliably or output is uninformative. **If 3+ signals fail across Phase 2 sub-phases, that's a higher-level kill signal — the signal stack may be weaker than spec assumes.** Phase 2 overall kill triggers re-evaluation of strategy viability.

**Duration estimate:** 8-14 weeks total across 9 sub-phases.

---

## §10.7 Phase 3 — Combiner and modeling *(REVISED v0.9 — missingness stress test exit gate)*

**Goal:** Build the LightGBM lambdarank combiner per §6 with the 16-feature representation per §6.5 (2 critical-signal z-scores + 7 non-critical-signal `(value, is_present)` feature pairs).

**Deliverables:**

1. **Training data assembly with missingness profile replication per §6.5.3 (with explicit cross-references per A5):** training data generation pipeline applies the Phase 2 aggregated missingness profile (random masking at observed per-signal per-sector per-regime rates per §6.5.3.2 masking rate specification) so the combiner is trained on representative `(value, is_present=False)` combinations. Profile refresh per §6.5.3.3 cadence (monthly during Phase 7, or drift-triggered). Profile changes require ADR per §12.6.
2. **Two-model training pipeline:** long-side and short-side LightGBM models with lambdarank objective per §6.2.
3. **16-feature feature engineering pipeline per §6.5.2:** the sentinel value `Decimal('-999')` is introduced at exactly one place (the feature-vector construction layer per §6.5.6); any other code path producing `-999` in a signal-value context is a defect caught by linting per §11.8.
4. **Walk-forward validation infrastructure per §6.3:** rolling-window train/validate/out-of-sample cycle.
5. **SHAP attribution infrastructure:**
   - Per-feature raw SHAP values preserved in storage
   - Per-signal aggregated SHAP values per §6.5.5: `attribution_to_signal_i = shap(value_i) + shap(is_present_i)` for non-critical signals; `attribution_to_signal_i = shap(value_i)` for critical signals
   - Operator dashboards display per-signal aggregate by default; diagnostic views access per-feature raw values
6. **Inline inference within polling loop per §6.4** with latency budget <5 seconds per polling tick.
7. **Model versioning per §6.4** (versioned files in S3/Modal volume, retain last 12 weeks, manual rollback override).
8. **Failure fallback per §6.4 corrected language:** count-normalized average over present signals:
   ```
   fallback_score(name) = 
       Σ(z_i × is_present_i) over all signals i
       ─────────────────────────────────────────
       max(1, Σ(is_present_i) over all signals i)
   ```
   Missing signals excluded from both numerator and denominator. This preserves the missing-vs-weak distinction even in degraded fallback path.
9. **Quarterly Optuna hyperparameter search infrastructure per §6.4** (50 trials, walk-forward CV).
10. **Weekly automatic retrain pipeline per §6.3** (Sunday night).

**Exit gates to Phase 4 — including quantitative missingness stress test per §6.5.4:**

**Baseline performance gates:**

- Combiner produces rankings meaningfully different from equal-weight (NDCG@25 substantially above random baseline)
- Walk-forward Sharpe positive on validation data
- SHAP attribution traceable per ranking event (per-feature and per-signal aggregated views both operational)
- Model versioning and rollback tested
- Failure fallback tested (count-normalized average per #8 above produces sensible rankings when LightGBM model fails to load)

**Missingness stress test gates (per §6.5.4):**

The combiner must demonstrate graceful degradation under elevated missingness conditions. Three stress levels, each with quantitative pass criteria:

| Stress level | Masking applied | Expected behavior |
|---|---|---|
| **50% non-critical masking** | 50% of non-critical signals randomly masked on validation data | Ranking Sharpe declines but remains positive. SHAP attributions shift partially toward critical signals (#6, #7) and the surviving non-critical signals. Ranking does not produce extreme outliers. |
| **75% non-critical masking** *(per V2)* | 75% of non-critical signals randomly masked | Sharpe approaches §6.4 failure-fallback baseline within reasonable tolerance — specific tolerance band (e.g., trained-model Sharpe within 0.2 of failure-fallback Sharpe on validation data) calibrated during Phase 3, not hardcoded here. Stress test passes if BOTH (a) Sharpe within tolerance of failure-fallback AND (b) no extreme outliers in ranking output (no z-score-implied rankings swinging wildly between unmasked and masked variants of same name). The second criterion catches "right-on-average but wildly variable" outputs that are operationally unusable. |
| **90% non-critical masking** | 90% of non-critical signals randomly masked | Imputation threshold per §4.3.5 (>4 of 7 non-critical missing → exclude name from ranking) correctly excludes most names. Remaining ranked names rely primarily on critical signals. The system continues to operate (produces a ranking; doesn't crash) but with greatly reduced cross-sectional dispersion. |

**Phase 3 exits only when all three stress levels show graceful degradation without catastrophic failure or extreme outliers.** Stress test results are documented in `docs/phase_3_missingness_stress_test.md` and included as Strong-tier evidence per §12.5.

**Evidence-tier discipline (per A6 tightened framing):**

Phase 3 represents the first phase where Strong+ tier evidence is operationally required for changes (combiner outputs drive position state mutations with tax implications via §7.7/§7.8). Evidence-workflow tooling was established Phase 0B; Phase 3 is the first phase where the Strong+ tier requirement binds business-logic changes. Phase 3 exit gates require demonstrated Strong+ evidence workflow for at least one combiner change (e.g., the initial training itself, or a hyperparameter tuning round).

**Kill condition:** Combiner doesn't learn (Sharpe ≤ 0 on walk-forward) **or stress test failure at 50% masking** (catastrophic degradation under realistic missingness conditions indicates the combiner cannot operate in production where 20-40% baseline missingness is expected). Strategy doesn't work at the modeling level.

**Duration estimate:** 4-6 weeks.

---

## Pass B redline subset — Phases 0A, 0B, 1, 2, 3 against v0.8

### Sections substantially revised

**§10.0 (new) — Section overview.** v0.8 had implicit overview embedded in §10.1; v0.9 makes the v0.9-specific structural changes explicit upfront (Phase 0 split, missingness capture, stress test, wash sale validation, two-phase state machine validation, reconciliation quietness gate, live-broker verification, sustained-anomaly kill).

**§10.1 Phase structure overview table — modified.**

- v0.8: 10 phases (Phase 0 through Phase 9), Phase 0 = single foundation phase at 2-4 weeks
- v0.9: 11 phases (Phase 0A, 0B, 1-9), Phase 0 split into 0A (2-4 weeks foundation) + 0B (6-10 weeks baseline / 7-10 realistic / may extend to 11-12 per V1; reconciliation/replay/tooling)
- v0.8 total pre-paper-trading: 24-41 weeks
- v0.9 total pre-paper-trading: 32-53 weeks (per V1 Phase 0B revision; pre-paper-trading +8-12 weeks for Phase 0B)
- v0.8 total to scaled deployment: 12-22 months
- v0.9 at planning numbers: **14-25 months (+2-3 months net per C1 timeline math propagation correction)**
- v0.9 at V1 contingency extension: **up to 16-27 months (+4-5 months additional if Phase 0B extends to 11-12 weeks)**

**§10.2 Timeline framing — substantially revised.**

- v0.8: AI acceleration as unqualified velocity gain
- v0.9: AI acceleration requires evidence discipline + reconciliation infrastructure to translate into validated velocity; without them, accelerates defect production at same rate. Phase 0B tooling investment is the velocity-enabling mechanism.

**§10.3 Phase 0A — new section.** Restructures v0.8 §10.3 Phase 0 (which had 10 deliverables) to be the foundation portion only. Deliverables 1-10 from v0.8 retained substantially. **New addition:** multi-instance schema discipline (all Crosswind-specific tables keyed by `(operator_id, ...)` per §9.7 optionality). **Exit gate addition:** multi-instance schema convention verified.

**§10.4 Phase 0B — entirely new section.** No v0.8 counterpart. Three priority deliverables (reconciliation engine + 17 verify_* interfaces with A1 sustained-anomaly baseline aggregation infrastructure, evidence-workflow tooling, replay framework) plus supporting deliverables (Alpaca paper integration, captured Day 1, .cursorrules, ADR-001, spec-source-index, **§8.6.1.1 Alpaca multi-pending-order validation per Part 2c forward-tracking item**). Critical exit gate per §11.0.11 specified inline (not just cross-referenced) to prevent handwaving; outcome classification per Response 3 R1 applied symmetrically. Evidence-workflow tooling has a quantitative validation requirement (<15-minute wall-clock for trivial Strong-tier change). Duration per V1: 6-10 baseline / 7-10 realistic / may extend to 11-12 weeks.

**§10.5 Phase 1 — Universe ingestion — substantially revised.**

- v0.8: 10 deliverables, focus on universe correctness and refresh cadence
- v0.9: same 10 deliverables PLUS integration with `verify_universe_membership` (§11.0.7 #10), **ingestion-time reconciliation per §11.0.5 OPERATIONAL not just documented (per A4)**, replay framework integration
- **Exit gate addition:** `verify_universe_membership` operates against universe ingestion output without firing `system_bug` events; ingestion-time cross-check has run on at least one production refresh per A4. Phase 1 evidence-tier discipline operational.
- All `universe_membership` and `hard_exclusions` tables keyed by `(operator_id, ticker, as_of_date)` per multi-instance optionality.

**§10.6 Phase 2 — Signal stack — substantially revised.**

- v0.8: 9 sub-phases with per-signal pipeline build
- v0.9: same 9 sub-phases PLUS per-sub-phase missingness profile capture (feeds Phase 3 per §6.5.3), **Phase 2.1 template-establishment meta-deliverable (per A2) with 8-element template locked at Phase 2.1 exit**, **sub-phase ordering rationale stated explicitly (per A3 — critical signals first; non-critical by increasing complexity)**, `Optional[Decimal]` type discipline enforcement per §4.3.5, ingestion-time reconciliation per §11.0.5, locked sentinel `Decimal('-999')` for non-critical signal missing values per §6.5.2
- **Exit gate additions per sub-phase:** missing-data path correctly handled, missingness profile committed to `docs/missingness_profile.md`, evidence-tier discipline operational. **Phase 2.1 specific:** template locked before Phase 2.2 begins.

**§10.7 Phase 3 — substantially revised.**

- v0.8: 5 deliverables (training data, two-model pipeline, walk-forward, SHAP, inline inference, model versioning, failure fallback, Optuna, weekly retrain — 9 items in v0.8 phrasing, more compact)
- v0.9: 10 deliverables incorporating missingness profile replication (per §6.5.3 with **A5 explicit cross-references to §6.5.3.2 masking rate and §6.5.3.3 refresh cadence**), 16-feature engineering with locked sentinel (per §6.5.2), corrected failure-fallback count-normalized-average (per §6.4 redline), per-signal SHAP aggregation (per §6.5.5)
- **Exit gate addition:** quantitative missingness stress test per §6.5.4 with three masking levels and explicit pass criteria. **75% row updated per V2: tolerance-band-within-reasonable-bounds + second criterion (no extreme outliers).** Stress test failure at 50% masking is a kill condition.
- **Evidence-tier discipline addition (per A6 tightened framing):** Phase 3 represents first phase where Strong+ tier requirement binds business-logic changes; evidence-workflow tooling was established Phase 0B.

### Cross-references requiring update in v0.8

**§9.7 (Multi-user / multi-instance deployment considerations):** v0.8 says "§13 (schema and infrastructure, pending) should design tables and operations to support per-operator isolation cleanly." v0.9 makes this concrete: Phase 0A and Phase 0B explicitly require `(operator_id, ...)` keying for all Crosswind-specific tables created in those phases. §9.7 v0.8 language remains accurate but the implementation discipline now lives in §10.3 / §10.4.

**§11.0.13 (Phase 0B priorities under §11.0):** §10.4 Phase 0B deliverables enumerate the three priority items per §11.0.13. Both sections must align; the §10.4 enumeration is the operational specification, §11.0.13 is the architectural rationale.

**§11.0.11 (Phase 0B exit gate):** §10.4 specifies the exit gate inline; §11.0.11 is the architectural rationale. Both sources must align. R3 R1 outcome classification applies symmetrically to §10.4 exit gate, §10.11 Phase 7 Gate 2, §10.12 Phase 8 Gate 2 post-calibration (latter two in Part 3b).

**§6.5.3 (Training data missingness replication):** §10.6 Phase 2 sub-phase deliverables now include missingness profile capture per §6.5.3. The profile location (`docs/missingness_profile.md`) is specified in §10.6; §6.5.3 references that path for completeness. §10.7 references §6.5.3.2 (masking rate specification) and §6.5.3.3 (refresh cadence) per A5.

**§3.4 (Refresh cadence):** §10.5 Phase 1 implements the cadences specified in §3.4. No §3.4 change needed; §10.5 is the build-side counterpart.

**§8.6.1.1 (short-stop parallel-order mechanism — Part 2c):** §10.4 Phase 0B supporting deliverables include Alpaca multi-pending-order behavior validation per §8.6.1.1 requirement. Part 2c forward-tracking item 7 resolved by this Part 3a inclusion.

---

## ✅ OPERATOR DECISIONS CONFIRMED — Verification items resolved before Part 3a final lock

Three V-items surfaced during Part 3a drafting. Per the symmetric-verification discipline established through Part 2 / Part 2b (V1 UUID + tiebreaker per Pass 3 commitment) / Part 2c (V1/V2/V3 all Option A): when operator scope description and canonical transcript disagree, the discipline is to surface divergences rather than silently import/drop, and resolve via explicit operator commitment moment citation. All three resolved before final lock.

### V1 — Total timeline figure: operator scope says "14-25 month" but canonical says "13-23 months"

**Operator's Part 3a authorization scope (from prior message):**

> "§10.2 Timeline framing (honest 14-25 month total per V1)"

**Canonical transcript message Response 1 §10.1 footer:**

> "**Total to scaled deployment: roughly 13-23 months of calendar time.**"

**Canonical transcript V1+V2+A1-A6 integrations message (V1 reflection):**

> "Revised framing: **6-10 weeks baseline; 7-10 weeks realistic; may extend to 11-12 weeks if Day 1 surfaces many tolerance-tuning ADRs or Alpaca integration surprises.**"
>
> "Also propagates to §10.1 table and §10.2 timeline framing. Pre-paper-trading total updates from 31-51 weeks to ~32-53 weeks (Phase 0B baseline shifts from 5-8 to 6-10)."

**Canonical Response 2 §10.16 (in Part 3b scope but quoted for cross-reference):**

> "**Timeline acknowledgment:** Total elapsed time to scaled deployment is 13-23 months."

**Canonical Response 3 R3.3 timeline change summary:**

> "Total to scaled deployment | 12-22 months | 13-23 months"

The canonical record consistently shows **13-23 months total**. V1's Phase 0B revision (5-8 → 6-10 weeks baseline) does propagate to pre-paper-trading total (31-51 → 32-53 weeks) but canonical does NOT update the total scaled-deployment figure beyond 13-23 months — the 1-2 week Phase 0B shift is absorbed into the existing 13-23 month range without changing the bounds.

Operator's "14-25 month" figure does not trace to canonical. Two possible interpretations:

- **Interpretation 1:** Operator was forward-projecting V1's "may extend to 11-12 weeks" upper-bound scenario combined with Phase 0B realistic 7-10 weeks adding to upstream phases, producing a more pessimistic total estimate not in canonical. This would be a v0.9 architectural commitment beyond what canonical captured.
- **Interpretation 2:** Operator's "14-25 month" was an inadvertent rounding or misrecollection; canonical 13-23 month remains authoritative.

**Disposition options:**

- **Option A:** Reproduce canonical 13-23 months total as drafted in Part 3a §10.1 and §10.2. R3b-style verification carry-forward: 14-25 vs 13-23 month question rolls to Part 6 spec-source-index for final-assembly review. Part 3a stands as canonical-faithful.
- **Option B:** Lock 14-25 month total per operator scope description as v0.9 architectural commitment. Update §10.1 footer ("13-23 months" → "14-25 months") and §10.2 to reflect more pessimistic V1-extended forecast. Requires explicit operator commitment that this is v0.9 architectural commit beyond canonical.
- **Option C:** Lock a compromise (e.g., 13-24 months) reflecting V1's "may extend to 11-12 weeks" upper-bound + Phase 0B realistic 7-10 weeks effect on total. Requires operator commitment to specific compromise figure.

**Decision: V1 Option B confirmed — 14-25 month total locked at planning numbers per C1 timeline math propagation correction.** The missing commitment moment Part 3a drafting could not identify in Response 1/2/3 canonical is C1 (Pass 2/3 prep), which explicitly superseded Response 1/2/3's 13-23 month figure. Same pattern as Part 2b V1 UUID + tiebreaker: the §7 R5 canonical transcript didn't contain the UUID+tiebreaker commitment, but Pass 3 prep V1 confirmation locked it post-canonically; C1 timeline correction operates identically — Response 1/2/3's 13-23 was superseded by C1's 14-25 during later passes.

**C1 commitment moment citation (operator confirmation, Pass 2/3 prep context):**

> "C1 — Timeline math inconsistency. V1 corrected Phase 0B from 5-8 to 6-10 weeks but the total-to-scaled-deployment figure didn't propagate. Pre-paper-trading delta of +8 to +12 weeks (24-41 → 32-53) translates to +2 to +3 months total since Phase 7+8 are calendar-bound and can't compress. Honest total: 14-25 months, not 13-23. Net change framing as '+1-2 months in best case; +4-6 weeks net' is internally inconsistent. Replacing with '+2-3 months at planning numbers; up to +4-5 months if Phase 0B extends to 11-12 weeks per V1 contingency.' Underselling at 13-23 months creates operator commitment misalignment with realistic duration. The honest 14-25 month figure is what §10.16 timeline acknowledgment must reflect."

**Mechanical edits applied per V1 Option B:**

1. §10.1 footer: "Total to scaled deployment: roughly 13-23 months of calendar time" → "Total to scaled deployment: roughly 14-25 months at planning numbers (per C1 timeline math propagation correction); may extend up to 4-5 months further (16-27 months total) if Phase 0B extends to 11-12 weeks per V1 contingency."
2. §10.2: added C1 timeline commitment paragraph ("Total elapsed time to scaled deployment is 14-25 months at planning numbers...") with forward-reference to §10.16 in Part 3b scope.
3. Pass B redline subset row updated: 14-25 months at planning numbers + up to 16-27 months at V1 contingency extension replaces the prior "13-23 months (+4-6 weeks net)" entry.

**Forward-tracking item:** §10.16 (Part 3b scope) must include 14-25 month timeline acknowledgment per C1 ("Total elapsed time to scaled deployment is 14-25 months at planning numbers; V1 contingency extension to 16-27 months acknowledged"). Track as Part 3b drafting requirement.

### V2 — §10.0 Section overview inclusion (operator preemptively confirmed)

**Operator's Part 3a authorization scope:**

> "§10.0 Section overview (likely NEW v0.9 — apply V-flag pattern)"

The operator preemptively anticipated V-flag pattern for §10.0 (same as §7.13 V3, §8.0+§8.12 V1). Operator's "apply V-flag pattern" language signals Option A pre-confirmation by analogy to prior V-flag resolutions.

**Decision: V2 Option A confirmed — §10.0 Section overview included per canonical transcript.** Operator's anticipatory language "§10.0 Section overview (likely NEW v0.9 — apply V-flag pattern)" in the Part 3a authorization scope constituted preemptive Option A confirmation by analogy to prior V-flag resolutions (§7.13 V3, §8.0+§8.12 V1, both Option A). §10.0 Section overview (NEW v0.9 — establishes architectural framing for v0.9's substantial §10 restructure) is present in Part 3a as drafted.

Operator confirmation citation (from V1/V2/V3 review message): "V2 (§10.0 inclusion) — preemptively confirmed Option A by my 'apply V-flag pattern' anticipatory language. Same Option A resolution as §7.13 V3 and §8.0/§8.12 V1."

### V3 — §8.6.1.1 Alpaca multi-pending-order validation as §10.4 Phase 0B supporting deliverable

**Forward-tracking item 7 from Part 2c (operator-confirmed inventory):**

> "§8.6.1.1 Phase 0B validation requirement: Phase 0B must validate Alpaca's multi-pending-order behavior for the short-stop parallel-order mechanism. If Alpaca doesn't cleanly support multi-pending close-side orders on the same symbol, v0 fallback (operator page + continued aggressive escalation per §8.6.2) applies. Track as Phase 0B deliverable in Part 3 (§10 phase plan)."

Part 3a §10.4 supporting deliverables block now includes:

> "**Alpaca multi-pending-order behavior validation (per §8.6.1.1 short-stop parallel-order mechanism requirement):** Phase 0B captures sample multi-pending close-side orders on the same symbol against Alpaca's actual paper trading API. Validates whether Alpaca cleanly supports the parallel-order mechanism for short-stop Phase 1 timeout handling per Part 2c §8.6.1.1. If unclean, v0 fallback (operator page + continued aggressive escalation per §8.6.2) determined operational for v1. Determination documented and committed before Phase 0B exits."

**Decision: V3 forward-tracking item 7 resolved by Part 3a §10.4 inclusion.** No standalone V-decision required; this implements previously-confirmed Part 2c forward-tracking commitment. The §10.4 supporting deliverables block now contains the Alpaca multi-pending-order behavior validation requirement with explicit v0 fallback (operator page + continued aggressive escalation per §8.6.2) for the unclean-API scenario.

Operator confirmation citation (from V1/V2/V3 review message): "V3 (§8.6.1.1 Alpaca multi-pending-order validation as §10.4 deliverable) — forward-tracking item 7 from Part 2c resolved by Part 3a §10.4 inclusion. Implementation of previously-confirmed commitment, no decision required."

---

*[End of Part 3a — §10.0 Section overview + §10.1 Phase structure overview (with V1 Phase 0B 6-10 baseline / 7-10 realistic / may-extend-to-11-12 + V1 Option B C1 timeline correction: 14-25 months at planning numbers, may extend to 16-27 months at V1 contingency) + §10.2 Timeline framing (with C1 14-25 month commitment paragraph) + §10.3 Phase 0A Foundation infrastructure (with operator_id multi-instance keying) + §10.4 Phase 0B Reconciliation engine + replay framework + evidence tooling (with A1 sustained-anomaly baseline aggregation infrastructure + R3-R1 outcome classification + §8.6.1.1 Alpaca multi-pending-order validation per forward-tracking item 7) + §10.5 Phase 1 Universe ingestion (with A4 ingestion-time reconciliation operational) + §10.6 Phase 2 Signal stack (with A2 Phase 2.1 template-establishment + A3 sub-phase ordering rationale) + §10.7 Phase 3 Combiner (with V2 75% tolerance band + second criterion, A5 §6.5.3 explicit cross-references, A6 tightened evidence-tier framing) + Pass B redline subset (with V1 Option B 14-25 month timeline row update). Canonical sources: prior conversation transcript drafts in `/mnt/transcripts/2026-05-15-04-55-32-crosswind-spec-v09-drafting.txt` (Response 1 §10.0-§10.7 at message-line 900; V1+V2+A1-A6 integrations at next message; Response 3 R1 Gate 2 outcome classification at later message; C1 timeline math propagation correction from Pass 2/3 prep operator-commitment context). V1 Option B (14-25 months at planning numbers per C1 citation; V1 contingency to 16-27 months tracked for §10.16 in Part 3b), V2 Option A (§10.0 included per operator-anticipated V-flag pattern), V3 (§8.6.1.1 Alpaca multi-pending-order validation forward-tracking item 7 resolved) all resolved. Part 3b (§10.8-§10.16) follows with C1 14-25 month acknowledgment in §10.16 per Part 3a forward-tracking.]*
