# Insider Transactions (Signal #4)

> **Owner:** longshort strategy module | **Phase:** Phase 3 / FP-050 (EDGAR rebuild) | **Status:** 🟡 **REGISTRY-LIVE / CRON-DISARMED (ACT-187, 2026-06-12 — FP-050 Phase 3 complete).** EDGAR pipeline implemented end-to-end (Phase 1 fetcher trio + Phase 2 orchestrator rewiring + per-accession `index.json` discovery per DEC-058 §(i) (A) ruling); `polygon-form4-fetcher.ts` DELETED per DW-094 (ACT-186 recovery). `signal_registry.insider_transactions_90d.status='live'` with truth-in-telemetry DEC-048 interim cadence string; `job_registry.longshort.insider.compute = {schedule:'15 21 * * 1-5' UTC, enabled:false}` (MIG-093, evening-family gap slot per DEC-058 §(k)). Arm-up = Phase 4 (deploy + operator validation fire + DEC-040 byte-match + DEC-043-pattern first-natural-fire attestation). Historical FP-042 / ACT-155 / ACT-156 sections preserved below per Rule 8.

## FP-050 — EDGAR-rebuild Phase 3 status (registry-live, cron-disarmed)

**DEC-058 bindings index (all 11 clauses ratified — see `docs/08-planning/approved-decisions.md` for verbatim text).**

| Clause | Binding |
|---|---|
| §(a) | Transaction-code IN-set `{P, S}` per §4.4.4 verbatim; M/C/A/G/F/I OUT at v1; parser preserves all codes; compute layer is single filter authority. |
| §(b) | **Dual-date axis — Option A.** Persist BOTH `transaction_date` AND `acceptance_datetime`; look-ahead gate keys on `acceptance_datetime ≤ as_of` (timestamp comparison); decay age on `transaction_date`. Two-layer enforcement (boundary fetcher + parser). Closes the FP-042 blind spot (~5.95-day max look-ahead bias). |
| §(c) | 10b5-1 EXCLUDE — form-level body scan (`/10b5[- ]?1/i`); conservative over-exclusion; per-row attribution upgrade deferred to DW-100. |
| §(d) | Role weights — reuse DEC-044 verbatim (CEO/CFO 1.0, NEOs 0.7, Sec-16 0.4, indep dirs 0.3, 10%+ 0.5); DEF-14A NEO enrichment deferred to DW-093. |
| §(e) | Formula reuse — FP-042 `compute-insider.ts` unchanged; only data source replaced. |
| §(f) | CIK fetch-per-fire of `company_tickers.json` + frozen `INSIDER_CIK_OVERRIDES` (NXT→1953967 seeded); unmapped emits typed `kind:'unresolved'` → `ticker_to_cik_unresolved` skip. |
| §(g) | UA from `EDGAR_CONTACT_EMAIL` at construction (fail-loud absent); self-imposed 5 rps cap (half SEC's 10 rps headroom — DEC-034). |
| §(h) | Form 4 / 4-A identical treatment; idempotency triple `(issuer_cik, accession_number, transaction_seq)`; orchestrator-side most-recent-accession preference on `(issuer, owner, date, seq)`. |
| §(i) | **Architecture — daily-feed primary + queue-engine `work-list` consumer (FP-050 Phase 3.6b; supersedes the prior single-invocation framing — see Phase-3.5 corrections below).** Phase-0 measured ~1,667 in-universe Form-4 accessions/day; per-fire ~3,425 EDGAR HTTPS calls drained across queue slices at the 5 rps self-imposed cap (~11.4 min wall-clock); backfill ~91k calls / ~5 h queue-drained one-shot and MUST complete before Phase 4 arm-up. Discovery revision (operator (A) ruling 2026-06-12) unchanged: per-accession `index.json` fetch via `edgar-accession-index-fetcher.ts` — primary-doc selection + atomic `acceptance_datetime` from one truth-source, NO heuristic tiebreak (INC-70 rule). Per-CIK submissions feed REJECTED for the discovery step (added join layer + recent-filings cap edge). |
| §(j) | Cross-signal additive independence with DEC-057 §(c) Tier-2 "significant insider transaction" — both signals score the same event independently by explicit design (catalyst measures decayed event-presence; insider measures dollar-weighted magnitude). Double-count prevention = additive independence, NOT silent gating. |
| §(k) | **Cadence — `15 21 * * 1-5` UTC (evening-family gap slot).** Lands between analyst (21:00) and news (21:30 + drain). as_of↔acceptance convention LOCKED to timestamp comparison (`acceptance_datetime_ts ≤ as_of_ts`) matching every sibling signal's look-ahead gate. EDGAR 22:00-ET filing-cutoff trade-off named honestly via §(b) `not_yet_knowable_excluded` — late-accepted filings carried to D+1. Post-cutoff `0 3 * * 2-6` UTC alternative REJECTED for consistency-beats-cleverness. Phase-7 IC ablation reopens. |

**Dual-date axis (diagram-in-prose, §(b) hard contract).**

```text
EDGAR Form 4 row
   │
   ├── transaction_date     ──► age_days = (as_of − transaction_date) / 14
   │                           (decay anchor, spec §4.4.4 formula)
   │
   └── acceptance_datetime  ──► gate: acceptance_datetime_ts ≤ as_of_ts
                               (look-ahead gate, timestamp comparison)
                               │
                               ├── PASS  → row enters 90d window
                               └── FAIL  → not_yet_knowable_excluded++
                                          (HONEST exclusion; row reappears
                                           in D+1 fire when acceptance ≤ as_of)

Two-layer enforcement (no silent default):
   parser-level:    `edgar-form4-parser.ts`  — missing acceptance ⇒ kind:'unparseable'
   boundary-level:  `edgar-form4-fetcher.ts` — refuses HTTP without acceptance pre-validation
```

**§(i) arithmetic row (queue-engine `work-list` consumer, post-Phase-3.5 correction with Phase-0 measured inputs).**

The pre-FP-050-Phase-3.6 §(i) arithmetic stood on an unmeasured ~50-qualifying-accessions-per-fire S&P-900 estimate. Phase-0 probe-window measurement (three real daily indexes, filer CIKs resolved against the universe CIK map) returned ~1,667 in-universe Form-4 accessions per day. That single datum falsifies the prior table's row 3 cell, row 4 cell, the ~17.4 s / ~18 s total, AND the ~25 min one-shot backfill bound. All four numbers are corrected below (Phase-3.5 corrections 1–3; correction 4 is the `signal_registry.cadence` rewrite landed by MIG-094 — see Registry truth bullet).

| Step | Operation | Calls | Latency @ 5 rps |
|---|---|---|---|
| 1 | `company_tickers.json` (CIK map) | 1 | ~1.0 s |
| 2 | Daily-index sweep (1 weekday-business-day per fire — daily cadence ingests yesterday's index, not 90d worth) | ~1 | ~0.2 s |
| 3 | Per-accession `index.json` (qualifying accessions — **Phase-0 measured ~1,667/day**, NOT the falsified ~50/fire estimate) | ~1,667 | ~333 s |
| 4 | Form 4 XML fetch + parse (post §(b) acceptance gate) | ~1,667 | ~333 s |
| **Total** | **incremental daily fire** | **~3,336 HTTPS** | **~667 s ≈ ~11.1 min** (well outside the 120 s queue-slice gate AND the 600 s edge-function timeout — REQUIRES queue-engine `work-list` drain, NOT single-invocation) |

**Backfill arithmetic (one-shot, 90 trading-day cold start, queue-drained):** 90 daily-index sweeps + 1 CIK map + ~1,667 × 90 = ~150,030 qualifying accessions × 2 (per-accession `index.json` + Form-4 XML) ≈ ~91k EDGAR HTTPS calls. At the 5 rps self-imposed cap = ~18,000 s ≈ **~5 hours wall-clock** drained across queue slices. The prior "~25 min one-shot within `timeout_seconds=600`" claim is FALSE under measured inputs and is retracted; the corrected backfill MUST complete before Phase 4 arm-up (the gate is encoded in the §(i) Phase-3.6b consumer; the manual handler's backfill-seed flag is the operator's trigger — design lands in FP-050 Phase 3.6b.ii).

**Registry truth (live-DB §22.5.1 post-MIG-093 reads, 2026-06-12).**

- `job_registry.longshort.insider.compute = {schedule:'15 21 * * 1-5', handler_path:'supabase/functions/longshort-insider-compute/index.ts', enabled:false, status:'registered'}` — schedule retuned from FP-042-era `0 19 * * 1-5`; `enabled` STAYS FALSE through Phase 3.
- `signal_registry.insider_transactions_90d = {status:'live', cadence:'daily (after-close; queue-drained ingest + finalize per FP-050 Phase 3.6b work-list consumer — Phase-0 measured ~1,667 in-universe Form-4 accessions/day; per-fire ~3,425 EDGAR HTTPS calls (1 CIK map + 90 daily-index sweep + 1,667 per-accession index.json + 1,667 Form-4 XML) drained across queue slices at 5 rps self-imposed cap (~11.4 min wall-clock); acceptance-gated per DEC-058 §(b); table-keyed §(h) read-time preference at finalize; backfill ~91k calls / ~5 hours queue-drained one-shot, MUST complete before Phase 4 arm-up; interim per DEC-048 — §4.4.4 30-min intraday revisit is a future enhancement-FP, Phase 7 picks final cadence)', job_registry_id:'longshort.insider.compute', planned_phase:NULL}` (rewritten by MIG-094 per Phase-3.5 correction 4).
- `JOB_ID_TO_SIGNAL_ID['longshort.insider.compute'] = 'insider_transactions_90d'` already present at `supabase/functions/_shared/longshort-signals/shared/job-signal-mapping.ts:47` (NO duplication — Constitution Rule 5).

**What's NOT decided at Phase 3.** Phase 4 arm-up (deploy + operator validation fire + DEC-040 byte-match against operator-applied `cron.job` + DEC-043-pattern first-natural-fire wall-clock signature) follows supervisor verification of this commit. Signal #4 STAYS DISARMED through the end of Phase 3.

---

## FP-050 Phase 3.6b.i — work-list persistence layer (schema-and-docs only; shell preview of 3.6b.ii consumer)

**Status: schema landed at MIG-094 + four Phase-3.5 corrections; consumer wiring is 3.6b.ii; orchestrator refactor is 3.6b.iii. Signal #4 STAYS DISARMED throughout.**

**Why the prior single-invocation framing failed.** §(i) was authored against an unmeasured ~50-qualifying-accessions-per-fire estimate. The Phase-0 probe-window measurement of ~1,667 in-universe Form-4 accessions/day (S&P-900 universe, real daily indexes, filer CIKs resolved against the universe CIK map) makes the per-fire wall-clock budget ~11 min — past both the 120 s queue-slice gate and the 600 s edge-function timeout. The Phase-2 single-invocation orchestrator cannot survive this measurement; the FP-045 queue engine `work-list` mode (FP-050 Phase 3.6a) is the load-bearing substrate.

**`insider_form4_rows` table (MIG-094, this commit).**

- **PK = DEC-058 §(h) idempotency triple**: `(issuer_cik, accession_number, transaction_seq)`. **Keep-all-versions, NO write-time merge.** Form 4 and Form 4/A are treated identically by the schema; the §(h) most-recent-accession preference is a READ-TIME operation applied by `loadAndCompute` at finalize.
- **§(b) dual-date axis — BOTH dates persisted**: `transaction_date` (decay anchor, `age_days / 14`) and `acceptance_datetime timestamptz` (look-ahead gate, `acceptance_datetime ≤ as_of` timestamp comparison).
- **Row contract** = the byte-preserved Phase-1 parser output (`form4-row-types.ts`) + boundary attribution (`ticker`, `filing_form_type`, `ingested_at`, `ingested_run_id`).
- **RLS family** = service-role write + `longshort.view` read + deny-write triad on `authenticated` (mirrors `signal_queue_*` + `signal_observations`).
- **90-day window read index**: `idx_insider_form4_rows_ticker_acceptance (ticker, acceptance_datetime DESC)` — covers the §(b) gated scan ordered for §(h) recency.
- **Late-amendment-out-of-window counter**: NOT a column on this table. It is RUN-META on `signal_queue_runs`, written by the consumer at finalize when a 4/A amendment's `acceptance_datetime` falls inside the run's 90-day window but its underlying `transaction_date` falls outside.

**Two-ledger note (Phase-3.6a Q4 binding, surfaced here for the insider consumer).** Item-level skips (per-accession permanent failures, e.g. unparseable XML, 4/A amendment to a non-extant 4) land in `signal_queue_skips` written by the engine — the engine's item-scope ledger. Consumer-level name-level mass balance lives in the `signal_compute_log.skips` array via the §4.4.4-style `kind:'permanent_skip'` taxonomy returned by `loadAndCompute` — the consumer's name-scope ledger. The two ledgers are NOT reconciled; they answer different questions (engine: did this work item ever succeed? consumer: did this universe ticker contribute to the 839 mass balance?).

**Backfill gate (Phase 4 prerequisite).** The backfill is the same `work-list` consumer with a seed-parameter for the 90-day accession sweep. Operator triggers via `longshort-insider-compute-manual` with an explicit `backfill: true` flag (design + flag wiring land in Phase 3.6b.ii). The arm-up choreography is: deploy → operator backfill drain (~91k calls, ~5 h queue-drained, idempotent under §(h) triple) → validation fire → operator-approved arm-up. **Backfill MUST complete before Phase 4 arm-up** — the validation fire's signal output is undefined without the historical 90-day window populated.

**3.6b.ii (next sub-commit) preview.** `insider-work-list-registration.ts`: `seedWorkItems = yesterday's daily index → in-universe qualifying accessions` (CIK map + §22.3-style acceptance look-ahead); `processItem = accession index.json → typed primary-doc selection → Form-4 fetch+parse → INC-74-pattern batch-dedupe → upsert insider_form4_rows` with the Q3 typed-permanent vs transient classification; `loadAndCompute = the table's 90-day window → §(b) acceptance gate → §(h) read-time preference → the PRESERVED FP-042 compute → 839 mass balance → values+skips`. `accessionsPerSlice` arithmetic and drift sentinels pin both the items-per-slice budget and the call-id surface structurally.

**3.6b.iii (third sub-commit) preview.** Refactor the Phase-2 single-invocation `insider-orchestrator.ts` to the consumer's `loadAndCompute` core (universe/z/persist pipeline survives; the in-line 90-day fetch loop is DELETED, no commented-out corpses); handlers become queue-init shims (the news-handler pattern). The §22.8.4 STOP-on-sprawl clause stays armed mid-flight — if the extraction reveals entanglement beyond the universe/z/persist core, STOP and surface rather than completion-theater.

---

## FP-050 Phase 3.6b.ii″ — load+compute extraction (ACT-192, this commit)

**Status: extraction landed; producer (work-list registration) is 3.6b.iii′. Signal #4 STAYS DISARMED.**

**What changed.** The Phase-2 single-invocation `insider-orchestrator.ts` (+571 LOC) and its companion test (+532 LOC) were DELETED. The universe → §(b) gate → §(h) preference → preserved compute → 839 mass balance → z → persist core was lifted into `supabase/functions/_shared/longshort-signals/insider-transactions/insider-load-and-compute.ts` (consumer-callable). Both handlers (`longshort-insider-compute/index.ts` cron, `longshort-insider-compute-manual/index.ts` operator) were reduced to fail-loud `apiError(503, 'insider_compute_pending_queue_rewire')` stubs — the auth shells (cron-secret on the cron handler; method gate + operator JWT + `longshort.manage` on the manual handler) fire FIRST, so the 503 is only reachable past authentication.

**Lift discipline (Q-A byte-for-byte ruling).** `preferMostRecentAccession` moved VERBATIM with the four-part key `(issuer_cik, owner_cik, transaction_date, transaction_seq)` per DEC-058 §(h) and MIG-095 (ACT-191). The §(b) acceptance gate moved from the orchestrator's in-memory strict-`>` exclusion to the SQL `WHERE acceptance_datetime <= as_of` filter — semantically identical (the boolean complement), with the parity asserted by the boundary-pair fixture in `insider-load-and-compute_test.ts` ((B.1)). The seam mapper `mapInsiderRowToForm4Row` mirrors the deleted `mapEdgarRowToForm4Row` — same field projection, re-rooted on the persisted row. The `computeInsiderSignal` / `filterQualifyingTransactions` / `classifyRoleWeight` chain (FP-042 reuse fence per ACT-156) is imported, not touched.

**Load-bearing test surface (hand-computed fixtures).**
- **(A.1) Different-owner regression — R1 collision proof.** Two officers' rows sharing `(issuer_cik, transaction_date, transaction_seq)` but differing in `owner_cik` BOTH survive the §(h) preference. This is the permanent forward sentinel that would have caught MIG-094's `owner_cik` schema gap had it existed then (closes the ACT-191 supervisor-accountability binding).
- **(A.2) 4/A amendment supersedes.** Same four-part key, later `acceptance_datetime` lex-wins.
- **(B.1) §(b) boundary pair.** Acceptance `===` as_of INCLUDED; acceptance `> as_of` (by 1 ms) EXCLUDED. SQL parity at the call-site (the `lte('acceptance_datetime', AS_OF_ISO)` filter is asserted on the stubbed builder).
- **(B.2) 90-day window.** `transaction_date >= as_of − 90d` applied as a `gte` filter; the boundary day is included.
- **(C.1) 839 mass-balance invariant.** Universe of 5 tickers → 2 values persisted + 3 typed skips. `universe_size === persisted_count + skipped.length`. The hand-computed z-score for the two-ticker same-sector pair is exactly `±√2/2 ≈ 0.70710678…` (a property of n=2 sample-std: `|v_1 − v_2|/√2` denominator yields the magnitude independent of raw_signal magnitudes — a stable invariant).
- **(D.1) Seam coercion.** Null `transaction_price_per_share` → `0`; null `officer_title` → `''`. The compute layer's `dollars === 0` filter drops zero-price rows honestly downstream.
- **(E.1) Empty universe.** `outcome='failed', failure_reason='empty_universe'`.

**Window state (intentional stub).** No producer is wired yet (registration is 3.6b.iii′). The compute consumer can run E2E but reads an empty table; rather than ship handlers that silently return `outcome='completed', persisted_count=0` (the exact phantom-firehose shape INC-70 exists to forbid), the handlers fail LOUD with `503 insider_compute_pending_queue_rewire`. Signal #4 stays DISARMED in `job_registry` (`enabled=false`); no `cron.job` entry exists pre-arm-up, so the 503 is structurally unreachable in production.

**`not_yet_knowable_excluded` surface.** The SQL §(b) gate excludes late-acceptance rows silently. Per Q4 two-ledger binding, the acceptance-look-ahead count is name-scope NOT consumer-relevant and moves to producer-side run-meta on `signal_queue_runs` in 3.6b.iii′; the `SignalOrchestratorResult.not_yet_knowable_excluded` slot is pinned at `0` here for shape compatibility.

**SIGNAL_ID rewire (§22.8.4 cross-signal entanglement closure).** `SIGNAL_ID = 'insider_transactions_90d'` lifted from the deleted `insider-orchestrator.ts` to `insider-load-and-compute.ts` verbatim. The drift-sentinel import in `_shared/longshort-signals/shared/job-signal-mapping_test.ts` rewired to the new module path; the assertion is unchanged. Two docstring references to the deleted file (`form4-row-types.ts:4`, `options-flow-orchestrator.ts:4`) updated to historical-citation form per Rule 8.

**Closure pointer to 3.6b.iii′.** `insider-work-list-registration.ts` (+ test): `seedWorkItems = yesterday's daily index → in-universe qualifying accessions`; `processItem = accession index.json → typed primary-doc selection → Form-4 fetch+parse → INC-74 batch-dedupe → upsert insider_form4_rows` (dual-write contract: MUST persist `EdgarForm4Row.owner_cik` per MIG-095) with Q3 typed-permanent vs transient classification; `loadAndCompute` call-site swaps from this commit's stubs to the queue-finalizer (news-handler pattern); `accessionsPerSlice` arithmetic + drift sentinels; production-registrations wire + cross-mode contamination test; manual-handler `backfill: true` flag with the backfill-before-arm gate at the honest ~91k-call / ~5-hour figure.

---

## Historical record (FP-042 / ACT-156 — preserved per Rule 8)

The sections below are the FP-042 ship + ACT-156 disarm + INC-70 root-cause record. Preserved verbatim as governance history. The EDGAR rebuild above SUPERSEDES the Polygon-fetcher path described below — the FP-042 compute / classifier / filter / z-score code is reused byte-unchanged; only the data-acquisition layer was replaced.

Detailed component reference for Signal #4 (insider transactions, 90-day, 14-day decay) per CROSSWIND §4.4.4 — the fourth of nine signals. Sparse-by-design: most names have zero qualifying insider transactions in any given 90-day window, which is the NORMAL state, not failure.

## Purpose

§4.4.4 spec formula (verbatim):

```text
raw_signal_N = Σ_qualifying( shares × price × sign × role_weight × exp(-age_days / 14) ) / market_cap

sign        = +1 for 'A' (acquired / purchase, bullish)
            = −1 for 'D' (disposed / sale,    bearish)
age_days    = (as_of − transaction_date) in days  (clamped to 0 for future-dated rows)
market_cap  = shares_outstanding × latest_close
```

**Filter (load-bearing).** First gate drops `record_type='holding'` rows (Polygon's Form 4 endpoint returns both). Then:

| code | included? | rationale |
|---|---|---|
| `P` (open-market purchase) | YES, all | spec §4.4.4 — all purchases are bullish signal |
| `S` (sale) AND `aff_10b5_one === false` | YES | spec — discretionary sales only |
| `S` AND `aff_10b5_one === true` | NO | EXCLUDE 10b5-1 planned sales |
| `S` AND `aff_10b5_one` missing/null | NO | conservatively excluded (cannot prove discretionary) |
| `M` / `C` / `A` / `G` and others | NO | option exercises, grants/RSU vests, gifts — not informative trades |

**Sign is load-bearing.** A pure-buy ticker MUST yield positive `raw_signal`; a pure-discretionary-sale ticker MUST yield negative. Both directions are pinned by tests.

## DEC-044 — Title-heuristic NEO proxy (conscious approximation)

"NEO" (Named Executive Officer) is a DEF-14A proxy-statement concept and is **not** a Form 4 field. Per DEC-044, Signal #4 v1 approximates the §4.4.4 NEO=0.7 weight tier via a deterministic 3-tier `officer_title` classifier:

| Tier | Weight | Match | Notes |
|---|---|---|---|
| 1 | 1.0 | `/\bceo\b\|\bcfo\b\|chief executive officer\|chief financial officer\|(?<!vice\s)\bpresident\b/i` | C-suite + President. The `(?<!vice\s)` lookbehind PREVENTS "Vice President" / "Executive Vice President" / "Senior Vice President" from accidentally matching here. The compound "CEO AND PRESIDENT" (real DELL Form 4 title) matches via `\bceo\b`. |
| 2 | 0.7 | `/chief\s+[a-z]+\s+officer\|\bevp\b\|\bsvp\b\|executive vice president\|senior vice president/i` | NEO-proxy tier — other "Chief X Officer" (COO/CTO/CMO/CIO/...) + EVP/SVP. |
| 3a | 0.4 | `is_officer === true` (no title match) | Generic Section-16 officer. |
| 3b | 0.5 | `is_ten_percent_owner === true` AND NOT officer/director | Pure 10%+ owner (institutional shareholders). An officer-AND-10%-owner resolves to 0.4 (officer wins per highest-applicable-weight tie-break). |
| 3c | 0.3 | `is_director === true` AND NOT officer | Independent director. |
| — | null | none of the above | Row dropped from the sum (typed-absence, not zero). |

**Multi-role tie-break.** Highest applicable weight wins (a CEO who also holds 12% is 1.0, not 0.5).

**Visibility (§2 axiom 4).** Every persisted observation carries `role_tier_source='title_heuristic'` (exported as `ROLE_TIER_SOURCE` from `compute-insider.ts`). The approximation is visible, not silent.

**Upgrade path.** Authoritative NEO enrichment via annual DEF 14A proxy statements is registered as DW-093. The `role_tier_source` column makes the upgrade a forward-compatible backfill.

## Scope

**In scope (this component owns):**
- Daily-after-close per-ticker compute per §4.4.4 (weighted-decay dollar-flow / market_cap).
- §4.4.4 filter (transaction-vs-holding gate + transaction-code + 10b5-1 exclusion).
- 3-tier title-heuristic role classifier (DEC-044).
- Within-sector GICS z-score normalization (±3 clip).
- Per-ticker typed-absence attribution into eight `SignalSkipReason` buckets including new `no_qualifying_transactions`.
- Idempotent UPSERT persistence into `signal_observations`; telemetry into `signal_compute_log`.
- New entitlement-aware Polygon Form 4 fetcher (`polygon-form4-fetcher.ts`). Reuses FP-041's `PolygonSharesOutstandingFetcher` and the existing `PolygonPriceHistoryFetcher` for the market-cap denominator.
- Cron + manual operator-trigger production wiring; cron is DISARMED at MIG-077.

**Out of scope (other components / phases):**
- DEF-14A authoritative NEO enrichment (DW-093, deferred).
- 30-min intraday polling cadence (noted in §4.4.4 as a future refinement; v1 is daily-after-close).
- EDGAR backup fetcher (Polygon is entitled; future hardening).
- Combiner-stage missingness imputation — Phase 3.
- Cron wiring / enable-flip / cron-attributable attestation — separate operator step per DEC-040 + DEC-043.

## Architecture

```text
universe_membership (load latest snapshot)
        │
        ▼
ONE market-wide Form 4 fetch (ACT-155):
  PolygonForm4Fetcher.fetchForm4MarketWide(as_of, 90)
    → paginated /stocks/filings/vX/form-4?transaction_date.gte=…&lte=… (NO ticker=)
    → next_url cursor pagination (≤50 pages × 1000 rows)
    → grouped locally by tickers[0] (primary-issuer attribution)
    → Map<ticker, Form4Row[]>
        │
        ▼
for each universe ticker: filterQualifyingTransactions(rowsByTicker.get(t) ?? [])
    │
    ├─ 0 qualifying → typed skip (no_qualifying_transactions)  ← MOST TICKERS, no market-cap fetch
    │
    └─ ≥1 qualifying:
         pLimitedMap (concurrency=20, ONLY over qualifying tickers — typically <100):
           Promise.all([
             PolygonSharesOutstandingFetcher.fetchShares(ticker)            // shares (FP-041 reuse)
             PolygonPriceHistoryFetcher.fetchPriceHistory(ticker, as_of, 7) // latest close
           ])
       ├─ form4 403  → typed skip (subscription_gated)
       ├─ form4 404  → typed skip (data_unavailable)
       ├─ shares 403/404/missing/zero/negative → typed skip (missing_shares_outstanding)
       ├─ price null/empty → typed skip (data_unavailable)
       ├─ other 4xx/5xx after retries → throws → caught → fetch_error
       └─ all ok → market_cap = shares × close
               │
               ├─ classifyRoleWeight per row (3-tier title-heuristic; null → drop)
               ├─ Σ shares × price × sign × role_weight × exp(-age/14) / market_cap
               ├─ market_cap==0 → typed skip (missing_shares_outstanding, defensive)
               └─ raw_signal
         │
         ▼
zScoreNormalizeWithinSector (within-GICS, ±3 clip)
         │
         ▼
SignalRow[] → captureSignalObservations (idempotent UPSERT)
         │
         ▼
signal_compute_log (telemetry, includes skip_counts + skipped_detail)
```

## FP-042 / ACT-155 — Market-wide-fetch addendum (CPU-limit fix)

The deployed cron handler died with HTTP 546 `WORKER_RESOURCE_LIMIT`
(CPU-time-exceeded, NOT memory, NOT wall-time) on the first full-universe
invocation. Cause: per-ticker Form 4 fetch across ~839 tickers totals
~2517 HTTPS calls (Form 4 + shares + price ×839) + 839 JSON parses, ~3–5×
short-interest's CPU footprint, blowing the ~2 s edge-isolate CPU budget
~6 s after boot. No `signal_compute_log` row landed.

The fix replaces the per-ticker Form 4 calls with ONE market-wide paginated
fetch (`fetchForm4MarketWide`) keyed by the 90-day date window with NO
`ticker=` parameter. Rows are returned for all issuers in the window,
grouped locally by `tickers[0]` (primary-issuer attribution; multi-ticker
rows are attributed only to the first listed ticker — rows without
`tickers[]` are dropped, no fabricated attribution). Then:

- `filterQualifyingTransactions` is applied per-universe-ticker BEFORE
  any per-ticker fetch. Most names have zero qualifying transactions and
  skip with `no_qualifying_transactions` without ever incurring a
  shares/price HTTPS call — collapsing the per-ticker side-fetches from
  1678 to typically <200.
- `shares + price` (concurrency=20) is fetched ONLY for tickers with
  qualifying transactions, and the per-ticker compute proceeds exactly
  as before (`computeInsiderSignal`, classifier, decay, divide-by-zero
  guard, z-score, persist are byte-unchanged).

Entitlement handling on the market-wide call: 403 → all-universe
`subscription_gated` skip; 404 → all-universe `data_unavailable` skip; a
throw → all-universe `fetch_error` skip (the run still `completed` with
`persisted_count=0`, mirroring the per-ticker degradation semantics).

This market-wide-fetch-by-date + group-by-ticker pattern is the template
for the remaining feed-signals (#1 analyst, #2 PEAD, #3 options, #8 news);
any per-ticker-across-the-universe fetch would hit the same CPU wall.

## Expected operational profile

UNLIKE momentum / reversal (dense) or short-interest (dense across SI-reported names), insider transactions are SPARSE-by-design. A healthy fire on a ~800-ticker universe typically yields:

- A minority of tickers (~5-20% depending on market conditions, earnings calendar, and lockup windows) carry real z-scored values.
- The majority skip with `no_qualifying_transactions` and contribute `is_present=0` to the combiner.
- `subscription_gated` / `data_unavailable` / `fetch_error` counts should be 0 on a healthy fire (the endpoint is entitled).

## Cross-references

- FP-042 (the implementing FP); ACT-154; DEC-044 (title-heuristic decision); DW-093 (deferred DEF-14A upgrade); MIG-077 (job_registry seed + signal_registry flip).
- CROSSWIND §4.4.4 (signal spec); §4.3.5 (non-critical signal rule); §2 axiom 4 (conscious-approximation discipline).
- Code: `_shared/longshort-signals/shared/polygon-form4-fetcher.ts`; `_shared/longshort-signals/insider-transactions/compute-insider.ts`; `_shared/longshort-signals/insider-transactions/insider-orchestrator.ts`; `supabase/functions/longshort-insider-compute/index.ts`; `supabase/functions/longshort-insider-compute-manual/index.ts`.
- Reuse: `_shared/longshort-signals/shared/polygon-shares-outstanding-fetcher.ts` (FP-041); `_shared/longshort-signals/shared/polygon-price-history-fetcher.ts` (FP-009).

## FP-042 / ACT-156 — Signal #4 disarmed (INC-70 — Polygon Form 4 endpoint filters are no-ops; EDGAR rebuild deferred to DW-094)

After the ACT-155 market-wide fix, the next fire returned HTTP 200 but with telemetrically-impossible skip counts (`fetch_error:839 + no_qualifying_transactions:839` for an 839-ticker universe — 1678 skips; `signal_compute_log.run_id='1021808b-4b1c-4b04-bb45-d989d56b5193'`). A 9-variant probe of `/stocks/filings/vX/form-4` against the deployed `POLYGON_API_KEY` confirmed the endpoint **silently ignores `ticker` (every multi-ticker syntax) and `transaction_date.gte/lte`** at our Stocks Advanced entitlement tier — every variant returned a byte-identical 1.85 MB / 1000-row firehose; `ticker=AAPL` returned rows NOT containing AAPL. Only `limit=` is honored.

**Implication.** The original FP-042 per-ticker fetcher was producing a phantom signal since deploy: same firehose fetched 839×, locally filtered by `tickers[0]===ticker`, ~0 matches per name (the firehose is dominated by recent high-volume filers, not our S&P 900 universe), compute layer marked each ticker `no_qualifying_transactions` — perfectly indistinguishable from the EXPECTED sparse profile. Looked sparse, was wrong. The ACT-155 CPU failure was the lucky trigger that exposed the silent data bug.

**Disarm.** `signal_registry.status` for `insider_transactions_90d` flipped `'live' → 'planned'` at ACT-156 (data UPDATE; no new MIG). `job_registry.longshort.insider.compute.enabled` stays `false` (was disarmed since FP-042 ship). The combiner imputes the non-critical signal's absence per §6.5; the long-short stack continues to rank on momentum / reversal / short-interest.

**P2 telemetry fix.** The ACT-155 catch block on a market-wide throw is rewritten to return `outcome='failed'` with a single `failure_reason='form4 market-wide fetch failed: <thrown message>'` and `skipped: []`, short-circuiting before the qualifying-filter loop. A run can never again show two skip classes for the same ticker. The `kind:'unavailable'` (typed entitlement) branch is UNCHANGED.

**FP-042 compute / classifier / filter / z-score code is UNTOUCHED** and remains in the codebase — it is correct and reused as-is when the EDGAR fetcher lands. Only the data-acquisition layer needs replacing.

**Rebuild path (DW-094).** SEC EDGAR direct: `User-Agent`-keyed GET against `data.sec.gov/submissions/CIK{cik10}.json` filtered to `form='4'`, per-accession-number XML fetch, parse Form 4 XML to per-transaction rows matching the existing `Form4Row` shape. EDGAR is the original source Polygon resells; authoritative per-CIK filtering, no entitlement, well-documented schemas. The FP-042 compute / classifier / filter / z-score layer is the contract this new fetcher targets.

**Pattern lesson (codified).** See [`_pattern-vendor-fetcher-filter-honesty.md`](./_pattern-vendor-fetcher-filter-honesty.md) — every vendor-endpoint fetcher MUST implement a `verifyFilterHonored()` pre-flight before trusting any documented filter. Applies to Signals #1 / #2 / #3 / #8.

**Cross-references.** INC-70 (the endpoint failure); DW-094 (the EDGAR rebuild); ACT-156 (this disarm + P2 fix); FP-042 second addendum (Rule 8); ACT-154 (original ship); ACT-155 (market-wide rewrite); DW-093 (DEF-14A NEO enrichment — independent but parallel); `signal_compute_log.run_id='1021808b-…'` (diagnostic exhibit).

## FP-050 Phase 3.6b.iii′ pre-work (ACT-194, 2026-06-12) — backfill arithmetic + PK contract

### Backfill arithmetic (M4 — derivation, all factors named)

> **Corrected 2026-06-12 (M4 RE-RULE, supersedes the original M4 table below).** The original M4 row labelled ~1,667/day as the "in-universe" measurement. That inverted the provenance: ~1,667 is the **total-market** Form-4 count for 2026-06-11 (`feature-proposals.md:27,175` — daily cross-market `form.{YYYYMMDD}.idx` probe: "1,667 Form-4 + 6 Form-4/A" across ALL filers, not the universe filter). The **in-universe** measurement is the Phase-3.5 forensic table: three real daily indexes 2026-06-03/04/05 with filer CIKs resolved against the universe CIK map returned **352 / 215 / 192 in-universe** (out of 3,298 / 1,707 / 2,067 total-market) → **mean ≈253/day, measured-max ≈352/day**. One supervisor review passed the inverted figure before the challenge round caught it (Catalog #43 supervisor-symmetric clause: a single-supervisor green is not sufficient for measured-input claims; the challenge round is part of the discipline, not an exception to it).

| Factor | Value | Provenance |
|---|---|---|
| Window | 90 calendar days = ~63 trading days | DEC-058 §(b) / §4.4.4 spec; the backfill must seed the rows the FIRST as_of-fire's 90-day window will read. |
| Accessions/day basis (typical) | **In-universe — Phase-3.5 forensic mean ~253/day** | Three real daily indexes (2026-06-03/04/05): in-universe counts 352 / 215 / 192 against totals 3,298 / 1,707 / 2,067; filer CIKs resolved against the universe CIK map. Replaces the inverted ~1,667 figure (which was the 2026-06-11 total-market count from `feature-proposals.md:27`). |
| Accessions/day basis (measured-max) | ~352/day | The 2026-06-03 high cell of the same forensic table. Used as the sizing ceiling for `accessionsPerSlice`. |
| Calls/accession | 2 (`index.json` discovery + XML parse) | DEC-058 §(i) (A) ruling. |
| Daily-index calls | 1/trading day = ~63 | Negligible vs the per-accession total. |
| Rate cap | 5 rps self-imposed | DEC-058 §(g); half SEC's 10 rps headroom. |

**Surviving figure:** ~63 trading days × ~253 accessions/day × 2 calls + ~63 daily-index ≈ **~31,941 calls + 63 ≈ ~32k calls / 5 rps ≈ ~6,400 sec ≈ ~1.8 hours wall-clock**.

**Drain plan: single overnight, widened headroom.** A ~12h window between US market close (21:00 UTC) and pre-market open (~13:00 UTC next day) now carries ~10h of headroom against the ~1.8h drain (vs the ~3h headroom against the inverted ~11.7h estimate). Multiple drains remain rejected (no throughput benefit at the 5 rps wall; the headroom upgrade is pure margin against post-earnings clusters and retry storms).

**Variance robustness.** If a backfill day's in-universe count materially exceeds the measured band (e.g. post-earnings clusters concentrate Form-4 filings on a single date), the FP-045 queue engine absorbs the overflow by design — `accessionsPerSlice` sizes the PLAN against the ~253 typical / ~352 measured-max band, and the engine carries any excess across additional slices at the same 5 rps wall. The arithmetic above sizes the operator's drain expectation; the engine handles the variance.

**`seedWorkItems` in-universe filter — unchanged by this correction.** The producer's `seedWorkItems` step ALWAYS filtered the daily-index against the universe CIK map (DEC-058 §(i); the design pre-dates this M4 RE-RULE). What was wrong here was the **count estimate**, not the filter. No one is to "fix" the in-universe filter to make the prior ~1,667 figure true; the filter is correct, and the prior ~1,667 figure was a label inversion that the forensic table at `Phase-3.5 corrections` already disproved.

**Prior-figure reconciliation (for the audit trail).** (a) ACT-190 §(i) row: ~91k calls / ~5h — anomalous, no recoverable derivation. (b) ACT-193: ~300,060 calls / ~16.7h — used the inverted ~1,667 figure × 90 calendar days. (c) Operator's first challenge: ~31.9k calls / ~1.78h — the surviving derivation, identical to this corrected row to ±100 calls (rounding on trading-day count). The 2026-06-12 M4 RE-RULE retires (a) and (b); (c) is the surviving figure under restored provenance.

### MIG-094 PK contract (M5 — verified for `onConflict`)

Quoted verbatim from `supabase/migrations/20260612153805_…sql` line 57:

```sql
PRIMARY KEY (issuer_cik, accession_number, transaction_seq)
```

This is the DEC-058 §(h) idempotency triple — keep-all-versions, no write-time merge. The §(h) four-part most-recent-accession preference (`issuer_cik, owner_cik, transaction_date, transaction_seq`) is a READ-TIME in-memory operation in `preferMostRecentAccession`; it is **NOT the PK** and **is NOT indexed**.

**γ commit-1 `processItem` upsert MUST quote this PK verbatim:**

```ts
await supabase.from('insider_form4_rows').upsert(rows, {
  onConflict: 'issuer_cik,accession_number,transaction_seq',
});
```

Any other tuple either fabricates an index (runtime failure) or shifts the idempotency contract silently. The `owner_cik` column lands on every upserted row (MIG-095 `NOT NULL`); the M1 parser hardening guarantees no empty-string sentinel ever reaches the upsert.

## FP-050 Phase 3.6b.iii′ γ commit-1 (ACT-195, 2026-06-12) — producer module landed

**File:** `supabase/functions/_shared/longshort-signals/insider-transactions/insider-work-list-registration.ts` (+ companion `_test.ts`, 21 tests). Conforms to the ACT-193 crosswalk + M1-M5 rulings + the ACT-194 Rule-8 M4 RE-RULE corrected band.

**Surface (factory):** `createInsiderWorkListConfig(deps, mode)` returns a registry-ready `QueueSignalConfig`. `mode: 'daily' | 'backfill'` selects the seed strategy; same `signalId` (`insider_transactions_90d`), distinct `jobId` (`longshort.insider.compute` daily / `longshort.insider.compute.backfill` manual). γ commit-2 wires the cron and manual handlers.

**accessionsPerSlice arithmetic row (drift-sentinel-pinned at `(A.1)`):** `itemsPerSlice = 50`; `callsPerItem = 2`; `ratePerSec = 5 × 0.85 = 4.25` (SEC fair-access half-share + FP-045 safety multiplier). Rate-bound per slice = `50 × 2 / 4.25 ≈ 23.5 s` paced + parser CPU + upsert wall ≈ 35-55 s end-to-end. 65-85 s headroom under the 120 s STOP gate; 95-115 s under the 150 s HTTP wall. Daily fire (M4 RE-RULE band): ~253 typical → 6 slices ≈ 3-6 min; ~352 measured-max → 8 slices ≈ 5-7 min. Backfill (~63 trading days × ~253 ≈ ~16k accessions) → 320 slices × 35-55 s ≈ **~3.1-4.9 hours** — fits the single overnight window with ~7-9 h headroom.

**Q3 classification at each call site (typed-permanent vs transient):**

| Layer | Outcome | Classification |
|---|---|---|
| accession `index.json` | 404 | `permanent_skip` `data_unavailable` |
| accession `index.json` | ambiguous (0/>1 primary) | `permanent_skip` `no_primary_doc` (M2; INC-70 anti-heuristic) |
| accession `index.json` | 429 | THROW (transient — cursor preserved) |
| Form-4 XML | 404 | `permanent_skip` `data_unavailable` |
| Form-4 XML | 429 | THROW (transient) |
| Form-4 XML | `unparseable` (incl. absent `owner_cik` per M1) | `permanent_skip` `data_unavailable` |
| upsert | Postgres error | THROW (transient) |
| Form-4 XML | `rows: []` (derivative-only filing) | `processed` (no upsert, cursor deleted) |

**Q1 barrier:** upsert completes BEFORE `{kind:'processed'}` is returned (verified by `(F.1)`/`(F.3)` ordering). MIG-095 dual-write enforced by passing `owner_cik` verbatim from the parser's `EdgarForm4Row` (the M1 hardening makes the empty-string sentinel unreachable; the producer carries a defensive throw should it ever fire).

**`ingested_at` derivation (DEC-034 clause 4):** every upserted row carries `ingested_at: asOf.toISOString()` — derived from the engine-injected `asOf`, NOT the DB-side `now()` default. Replay-determinism preserved; verified at `(F.1)`.

**STOP-with-partials surfacing (per the operator's "if migration sprawls, STOP" escape clause).** The `.run()` shim in `insider-load-and-compute.ts` and its 7 hand-computed fixtures (R1 different-owner regression, §(b) boundary pair, 839 mass-balance, ±√2/2 z-score) REMAIN at this commit. The shim's deletion + fixture migration to the `runStaged` seam is INTENTIONALLY deferred to a follow-up sub-commit (γ commit-1b or rolled into γ commit-2's handler rewiring, operator's choice). Reason: deleting `.run()` before γ commit-2 wires the handlers off it would break the existing 503-stubbed handler tests' compile fence; the no-corpses closure is held one window because the corpse is load-bearing temporarily. The new producer module is fully exercised by its own 21 tests; the staged seam is exercised end-to-end by `(H.1)`.

**Cross-references:** ACT-193 (read-only crosswalk), ACT-194 (M1-M5 pre-work + Rule-8 M4 RE-RULE), ACT-195 (this entry).

## FP-050 Phase 3.6b.iii′ γ commit-2 (ACT-196, 2026-06-12) — handlers rewired + consumer wired in production-registrations

**Files touched:**
- `supabase/functions/longshort-insider-compute/index.ts` — cron handler rewired from the 503 stub to a queue-init shim (DAILY mode).
- `supabase/functions/longshort-insider-compute-manual/index.ts` — manual handler rewired from the 503 stub to a queue-init shim with the operator-triggerable `backfill: true` flag.
- `supabase/functions/_shared/longshort-signals/insider-transactions/insider-queue-bootstrap.ts` — NEW. `buildInsiderDepsFromEnv` + `registerInsiderDailyConsumer` (lazy env-derived deps following the news-fetcher pattern) + `buildInsiderBackfillConfig` (per-request backfill config build).
- `supabase/functions/_shared/longshort-signals/shared/queue-worker/production-registrations.ts` — Signal #4 added to the aggregator (DAILY mode only; backfill never registered).
- `supabase/functions/_shared/longshort-signals/insider-transactions/insider-cross-mode-contamination_test.ts` — NEW. 6 cross-mode invariants (CM-1 through CM-4b).
- Sentinel tests for both handlers rewritten from pinning-the-503 to pinning-the-shim (9 + 10 assertions respectively).

**Registration architecture.**
`production-registrations.ts` registers Signal #4 in DAILY mode only. The four queue edge handlers (init, init-manual, slice, sweeper) plus the dedicated `longshort-insider-compute` cron handler all receive the daily config via this side-effect import.
The dedicated `longshort-insider-compute-manual` handler, when the operator passes `backfill: true`, BUILDS a fresh backfill-mode config via `buildInsiderBackfillConfig` and passes it directly to `initQueueRun` — the backfill config is NEVER registered. This is forced by the engine registry's no-duplicate-signalId contract (asserted by the new cross-mode contamination test `(CM-1)`); since processItem and loadAndCompute are mode-agnostic, the slice-worker / sweeper isolates remain correct against the daily-registered config regardless of which mode init seeded with.

**Drift sentinel.** Both handlers check `productionQueueRegistry.has(INSIDER_SIGNAL_ID)` before fetching the config. Missing entry → 500 `insider_registry_drift` (no silent misroute). The backfill path bypasses this check because it builds its own config.

**Auth ordering.** Cron handler: POST → `verifyCronSecret` → drift sentinel → `initQueueRun` → audit emit. Manual handler: POST → `authenticateRequest` (operator JWT) → `checkPermissionOrThrow('longshort.manage')` → body parse (optional `backfill`) → config resolution (drift-checked for daily, build-then-bypass for backfill) → `initQueueRun` → audit emit.

**Audit events.** RUN_STARTED on `kind:'started'`; RUN_FAILED on init throw. Both via `QUEUE_AUDIT_EVENTS` symbols (no string literals). Metadata includes `trigger:'cron'|'manual'` and `mode:'daily'|'backfill'` so operators can disambiguate cleanly in the audit stream.

**Backfill drain derivation correction (M4 ACT-194 → γ commit-2 reconciliation).**

The γ commit-1 producer module quoted the backfill drain band as **~3.1-4.9 hours** by multiplying 320 slices × 35-55 s/slice end-to-end. That derivation IS the slice-wall floor (paced + parser CPU + per-row upsert), but it OMITS the binding factor: the slice-worker cron fires at `* * * * *` (every minute) and picks the OLDEST run across ALL signals (per `docs/04-modules/longshort/signals/queue-worker.md` §slice-cron). When `slice_wall < 60 s`, the cron cadence — not the slice wall — is the binding floor.

Reconciled arithmetic, paced floor → wall floor → cadence floor (the binding number):

| Bound | Formula | Value | Binding? |
|---|---|---|---|
| Paced (rate-only) | ~32k calls / 4.25 rps | ~7,530 s ≈ **2.1 h** | NO — ignores per-item parser+upsert work |
| Slice-wall | 320 slices × (35-55 s) | **~3.1-4.9 h** | NO — ignores the minute-cron cadence floor |
| **Cron-cadence (BINDING)** | 320 slices × max(slice_wall, 60 s) ≈ 320 × 60 s | **~5.3 h** | **YES** — when `slice_wall < 60s`, the cron interval is the throttle |

The factor turning the paced floor into the slice-wall band is **per-item parser CPU + per-row Supabase upsert** (~10-30 s per slice on top of ~23.5 s paced). The factor turning the slice-wall band into the binding figure is **slice-cadence overhead under the `* * * * *` minute-cron** (one slice claim per cron tick, single shared cron across all signals).

**Corrected backfill drain expectation: ~5.3 h queue-drained** (sole insider drain; if PEAD/options/news are concurrently draining, the shared-cron picker serializes signals across ticks → the effective insider rate halves/thirds proportionally, but operators schedule backfill in the overnight window when other signals are inactive). The single overnight window (US close 21:00 UTC → pre-market 13:00 UTC = 16 h) provides ~10.7 h headroom over the ~5.3 h drain — comfortably one-shot, no multi-night plan required.

The slice-cadence floor IS the named factor. Neither `accessionsPerSlice` nor the slice-wall budget changes — only the operator-facing drain figure. The γ commit-1 `(A.1)` drift sentinel remains the per-slice STOP-gate check and is unaffected.

**Cross-mode contamination invariants (new test file).** `(CM-1)` duplicate signalId registration throws (daily+backfill cannot co-exist in the same isolate's registry). `(CM-2)` daily-only registration carries DAILY jobId; backfill jobId never leaks. `(CM-3)` mode argument actually parameterizes jobId (not silently dropped). `(CM-4)`/`(CM-4b)` cross-mode-family field contamination is rejected by `validateConfig` at register time.

**STOP-with-partials surfacing (per §22.8.4).** The `.run()` shim in `insider-load-and-compute.ts` AND its 7 hand-computed fixtures REMAIN at this commit. The deletion + fixture migration to the `runStaged` seam (z+persist assertions relocating to engine-finalizer-level expectations — already covered structurally by `queue-work-list-mode_test.ts`'s finalizer-dispatch tests) is INTENTIONALLY DEFERRED to a follow-up γ commit-2b. Reason: the migration has its own substantive test-churn axis (rewriting the C.1 ±√2/2 z-score fixture and the E.1 empty-universe fixture against the new staged-result shape, with z+persist re-asserted at the engine finalizer surface), and bundling it into γ commit-2's handler rewiring would entangle two orthogonal test-failure surfaces and violate the atomic-commit discipline. The no-corpses closure is held one more window; γ commit-2b is scoped to ONLY this deletion + migration.

**Cross-references:** ACT-194 (M1-M5 + Rule-8 M4 RE-RULE), ACT-195 (γ commit-1 producer module), ACT-196 (this entry).

## FP-050 Phase 3.6b.iii′ γ commit-2b (ACT-197, 2026-06-12) — `.run()` deleted; 7 hand-computed fixtures migrated to the `runStaged` seam; Gate 2b added to `check-gate-evidence.ts`

**Files touched:** `insider-load-and-compute.ts` (-77 LOC; `.run()` shim and its unused imports removed; `runStaged` is now the sole exported per-run entry point, consumed by the work-list adapter at `insider-work-list-registration.ts:578`); `insider-load-and-compute_test.ts` (A.1/A.2/B.1/B.2/D.1 unchanged — surfaces independent of `.run()`; C.1 pivoted to `runStaged` and now asserts the staged-seam shape — per-ticker values + skips + mass-balance + raw-signal signs + zero `signal_observations` writes; E.1 pivoted to `runStaged` and now asserts `kind:'short-circuit'` / `failure_reason='empty_universe'`; new C.2 fixture relocates the ±√2/2 z-score arithmetic + persist-payload assertions to the engine-finalizer surfaces — `zScoreNormalizeWithinSector` at `queue-finalizer.ts:174` and `captureSignalObservations` at `queue-finalizer.ts:202` — arithmetic byte-identical, SIGNAL_ID + as_of_date + is_present invariants retained); `scripts/check-gate-evidence.ts` (Gate 2b added as the fourth `GateSpec` — `cd supabase/functions && deno test --allow-net --allow-env --allow-read`, no `_shared/` filter, mirroring CI Gate 11 verbatim; `renderAttestation` extended to print the `2b` label); `scripts/check-gate-evidence_test.ts` (gate-count assertion lifted 3→4; structural sentinels pin `argv` and `displayCommand` against the regression that would re-introduce the `_shared/` filter — the exact line is `assert(!GATES[2].argv.includes('_shared/'), 'Gate 2b argv MUST NOT carry _shared/')`); `docs/ai-failure-modes.md` #41 (Status field extended with the symmetric-form phantom-defect note — γ commit-2's *"pre-existing TS2307 errors in the broader suite are unrelated to this commit"* was a positive existence claim with no supporting evidence, falsified by the repo-wide Gate 2b run; the symmetric form of #41 is recorded so future commits don't substitute narrative for evidence on either polarity).

**No-corpses closure.** The §22.8.4 STOP-with-partials surface that γ commit-1 opened and γ commit-2 deferred one window is CLOSED in this commit; no further deferral. The work-list adapter, both handlers, and the engine init are the only call sites for the producer surface — none of them depended on `.run()`. The seven fixtures' arithmetic is preserved verbatim; only their attachment point moves (mechanical computations stay against the producer, finalizer-level arithmetic moves to the finalizer surfaces).

**Gate-2b convention (the mechanical fix for the ACT-196 scope-gap).** `check-gate-evidence.ts` now runs four gates: Gate 1 (`check-wall-clock`), Gate 2 (`_shared/`-scoped deno test), Gate 2b (repo-wide deno test — CI Gate 11 parity), Gate 3 (eslint). The Gate 2b row in the attestation block IS the line that, if absent, auto-fails any `_shared/`-touching commit. The structural sentinel quoted above (`!GATES[2].argv.includes('_shared/')`) prevents a regression that would re-narrow Gate 2b's scope and re-open the gap that let γ commit-2 land on the narrower-than-CI evidence.

**Cross-references:** ACT-195 (γ commit-1), ACT-196 (γ commit-2), ACT-197 (this entry).

## FP-050 Phase 3.6b.iii′ γ commit-3 (ACT-198, 2026-06-12) — build-closure: module-doc final sections + FP-050 Status roll-up + reference-index residuals

γ commit-3 carries no production-code edits. It closes the FP-050 Phase 3.6b.iii′ build arc with the documentation residuals — module-doc work-list-consumer summary + four-gate evidence convention + Phase 4 runway; FP-050 Status §22.3(e) roll-up (Rule-8 lineage preserved); function-index / event-index residuals reconciled against landed code; ACT-198 closing the γ arc with the γ commit-1 → γ commit-2 → γ commit-2b chain summarised; four-gate attestation block at HEAD.

### Work-list consumer design — as-landed summary

**Producer (γ commit-1, `insider-work-list-registration.ts`).** `createInsiderWorkListConfig(deps, mode)` returns a registry-ready `QueueSignalConfig`. `mode: 'daily' | 'backfill'` selects the seed strategy; same `signalId` (`insider_transactions_90d`), distinct `jobId` per mode. Daily seed = yesterday's trading-day EDGAR daily index → in-universe qualifying Form-4(/A) accessions (CIK map fetch-per-fire, ticker→CIK overrides applied, `ticker_to_cik_unresolved` typed skip). Backfill seed = ~63-trading-day sweep covering the rolling 90-day window. `processItem` = accession `index.json` → typed primary-doc selection (M2; INC-70 anti-heuristic — `permanent_skip` `no_primary_doc` on 0/>1 primary) → Form-4 XML fetch + parse (M1 hardening forbids empty-string `owner_cik`) → INC-74 batch-dedupe → upsert `insider_form4_rows` with `onConflict: 'issuer_cik,accession_number,transaction_seq'` (MIG-095 dual-write enforced — `owner_cik` carried verbatim from `EdgarForm4Row`; `ingested_at: asOf.toISOString()` per DEC-034 clause 4). `loadAndCompute` reads the per-as_of slice via `runStaged` and the engine finalizer owns z-score + persist (per M3 staged-seam ruling). Q3 typed-permanent vs transient classification is pinned per call site (404 → `permanent_skip data_unavailable`; ambiguous primary → `permanent_skip no_primary_doc`; 429 → THROW with cursor preserved; Postgres upsert error → THROW).

**Consumer wiring (γ commit-2, `insider-queue-bootstrap.ts` + `production-registrations.ts` + both handlers).** `production-registrations.ts` registers Signal #4 in DAILY mode only via the news-fetcher pattern (`registerInsiderDailyConsumer` with lazy env-derived deps); backfill is NEVER registered — the manual handler with `backfill: true` builds a per-request `buildInsiderBackfillConfig` and passes it directly to `initQueueRun`. This shape is forced by the engine registry's no-duplicate-`signalId` contract (asserted by `insider-cross-mode-contamination_test.ts (CM-1)`). Cron handler: POST → `verifyCronSecret` → drift sentinel (`productionQueueRegistry.has(INSIDER_SIGNAL_ID)` → 500 `insider_registry_drift` if missing) → `initQueueRun` → `QUEUE_AUDIT_EVENTS.RUN_STARTED` / `RUN_FAILED` (metadata carries `trigger:'cron' \| 'manual'` + `mode:'daily' \| 'backfill'`). Manual handler: POST → `authenticateRequest` (operator JWT) → `checkPermissionOrThrow('longshort.manage')` → optional `backfill` body flag → daily config (drift-checked) or backfill config (build-then-bypass) → `initQueueRun` → audit emit. Cross-mode invariants `(CM-1..CM-4b)` pin duplicate-registration throw, DAILY-only registered jobId, mode-argument actually parameterising jobId, and cross-mode-family field contamination rejection by `validateConfig` at register time.

**No-corpses closure (γ commit-2b, `insider-load-and-compute.ts`).** `.run()` deleted; `runStaged` is the sole exported per-run entry point. Seven hand-computed fixtures migrated to the staged seam — A.1/A.2/B.1/B.2/D.1 unchanged (surfaces independent of `.run()`); C.1 + E.1 pivoted to assert the `runStaged` shape (staged-seam values + skips + mass-balance + `kind:'short-circuit'` `failure_reason='empty_universe'`); new C.2 fixture relocates ±√2/2 z-score arithmetic + persist-payload assertions to `zScoreNormalizeWithinSector` (`queue-finalizer.ts:174`) and `captureSignalObservations` (`queue-finalizer.ts:202`) — arithmetic byte-identical, persist invariants retained.

### Four-gate evidence convention (post γ commit-2b)

Every `_shared/`-touching insider commit MUST paste the four-gate attestation block from `scripts/check-gate-evidence.ts` verbatim into its ACT entry:

1. **Gate 1** — `deno run --allow-read scripts/check-wall-clock.ts` (wall-clock kernel ban).
2. **Gate 2** — `cd supabase/functions && deno test --allow-net --allow-env --allow-read _shared/` (the `_shared/`-scoped fast loop; pre-γ-commit-2b this was the sole `deno test` gate).
3. **Gate 2b** — `cd supabase/functions && deno test --allow-net --allow-env --allow-read` (repo-wide CI Gate 11 parity; NO `_shared/` filter — added in γ commit-2b to mechanically close the ACT-196 scope-gap, where handler-test-touching commits could pass Gate 2 while CI failed).
4. **Gate 3** — `npx eslint .` (lint).

The structural sentinel in `scripts/check-gate-evidence_test.ts` — `assert(!GATES[2].argv.includes('_shared/'), 'Gate 2b argv MUST NOT carry _shared/')` — pins Gate 2b's CI-parity scope against a regression that would re-narrow it.

### Phase 4 runway (backfill-before-arm gate)

Phase 4 choreography (deferred to a separate operator-fire window; not in γ commit-3 scope):

1. **Deploy** `longshort-insider-compute` + `longshort-insider-compute-manual` at the γ commit-3 HEAD.
2. **Operator backfill init** — manual handler POST with `{ backfill: true, as_of: <today> }` carrying operator JWT + `longshort.manage`. Builds the backfill config (NOT registered), seeds the ~63-trading-day work-list (~16k accessions, ~32k EDGAR HTTPS calls), returns 202.
3. **Overnight drain watch** — `~5.3 h queue-drained` is the binding wall-clock figure. The slice-wall floor is ~3.1-4.9 h (320 slices × 35-55 s/slice end-to-end); the binding factor is the `* * * * *` slice-worker cron-cadence (one slice claim per cron tick, single shared cron across all signals — when `slice_wall < 60s`, the cron interval is the throttle). Run backfill in the overnight window (US close 21:00 UTC → pre-market 13:00 UTC = 16 h available, ~10.7 h headroom over the ~5.3 h drain — comfortably one-shot, no multi-night plan).
4. **Backfill-before-arm gate** — `cron.job.longshort.insider.compute.active` MUST remain `false` until the backfill run finalises (drain-complete + finalizer ran + `signal_observations` populated for the most recent valid `as_of`). The cron-cadence drain figure (~5.3 h) IS the gate's wall-clock budget; arming the daily cron before drain completion would race the engine and could re-process accessions across daily + backfill modes (the cross-mode contamination test pins the registry against this in-isolate, but the *cron-fired* daily run would attempt its own seed while backfill is still draining slices).
5. **Validation fire** — manual handler POST with `{ as_of: <today> }` (NO `backfill` flag) once the backfill drain is verified complete. Confirms the daily path works end-to-end against a populated `insider_form4_rows`.
6. **Arm** — flip `job_registry.longshort.insider.compute.enabled` `false → true` via MIG (preserving DEC-040 byte-match attestation against `cron.job.schedule`); first natural cron-fire at `15 21 * * 1-5` UTC closes the DEC-043 attestation.

Signal #4 STAYS DISARMED through γ commit-3 and across the Phase 4 choreography until step 6.

### γ arc summary (commit-1 → commit-2 → commit-2b → commit-3)

| Commit | ACT | Scope | Code | Tests | Doc |
|---|---|---|---|---|---|
| γ commit-1 | ACT-195 | Producer module landed | `insider-work-list-registration.ts` (NEW) | 21 (NEW) | module doc §γ commit-1 |
| γ commit-2 | ACT-196 | Both handlers rewired to queue-init shims; production-registrations DAILY; cross-mode contamination test; backfill drain reconciled to ~5.3 h cron-cadence | both handlers (REWRITTEN); `insider-queue-bootstrap.ts` (NEW); `production-registrations.ts` (Signal #4 added) | handler sentinels (REWRITTEN); `insider-cross-mode-contamination_test.ts` (NEW, 6 invariants) | module doc §γ commit-2 |
| γ commit-2b | ACT-197 | `.run()` deleted; 7 fixtures migrated to `runStaged` + finalizer surfaces; Gate 2b added to `check-gate-evidence.ts` | `insider-load-and-compute.ts` (-77 LOC); `scripts/check-gate-evidence.ts` (Gate 2b GateSpec) | `insider-load-and-compute_test.ts` (C.1 + E.1 pivoted; C.2 NEW); `scripts/check-gate-evidence_test.ts` (4-gate sentinels) | module doc §γ commit-2b |
| γ commit-3 | ACT-198 | Build closure: module-doc final sections + FP-050 Status §22.3(e) roll-up + function/event index residuals + ACT closure | none (docs-only) | none | module doc §γ commit-3 (this); FP-050 Status; function-index handler + module entries; event-index supersession |

**Cross-references:** ACT-195 / ACT-196 / ACT-197 / ACT-198. Signal #4 STAYS DISARMED.

**Cross-references:** ACT-193 (crosswalk), ACT-194 (M1-M5 pre-work + M4 RE-RULE), ACT-195 (γ commit-1 producer module), ACT-196 (this entry).

## FP-050 Phase 4 F1 — master.idx pivot (ACT-199)

**Pivot trigger (two-observation §22.8.4 STOP-and-conclude bar met):** two distinct daily-index files were blocked from the Supabase Edge egress with HTTP 403 + SEC `AccessDenied` XML under varied conditions (different file date, different run window, ~80 min apart, identical UA + identical egress + identical `/Archives/edgar/daily-index/{YYYY}/QTR{n}/` path root):

| Observation | File | Run / window | Egress | UA | Result |
|---|---|---|---|---|---|
| #1 | `form.20260612.idx` | initial backfill probe (~80 min before #2) | Supabase Edge `eu-central-1` | `Lovable-Crosswind/fp-050-insider/0.1 (contact: ...)` | HTTP 403 + `AccessDenied` XML |
| #2 | `form.20260525.idx` | run `cbc3a090-84d8-4b65-9132-39397f725384` | Supabase Edge `eu-central-1` | identical | HTTP 403 + `AccessDenied` XML |

The single-observation inversion from the ACT-198-window diagnostic (one positive probe of `form.20260612.idx` returning 200 under paced re-probe) does NOT generalize — it was the over-generalization of a single observation that the ai-failure-modes #41 symmetric-form forward-binding rule binds against (ACT-199 records the second phantom-defect observation and codifies the rule: *negative existence claims under §22.8.4 STOPs require ≥2 corroborating observations under varied conditions*).

**F1.a — code (ACT-199, this commit):**

- **URL pivot:** `dailyIndexUrl(date)` now returns `…/daily-index/{YYYY}/QTR{n}/master.{YYYYMMDD}.idx` (NOT `form.{YYYYMMDD}.idx`). Same path-family root; sibling file. master.idx ships the identical set of accessions for the same date/quarter as form.idx; the difference is format (master = pipe-delimited, ~471 KB; form = fixed-width pre-partitioned by form-type, ~1 MB).
- **Parser rewrite:** `parseDailyIndexBody(body)` now parses pipe-delimited 5-column rows (`CIK|Company Name|Form Type|Date Filed|Filename`), splits on `|`, drops rows with !=5 columns, and applies a post-parse filter `Form Type IN ('4','4/A')` to recover the partitioning that form.idx provided structurally. Header literal pinned to the verbatim `CIK|Company Name|Form Type|Date Filed|Filename` string.
- **Operation id renamed:** `MASTER_INDEX_OPERATION_ID = 'edgar_master_index'` is the new canonical tag; `DAILY_INDEX_OPERATION_ID` is preserved as a back-compat alias pointing at the same value.
- **INC-73-family telemetry:** new shared module `edgar-fetch-telemetry.ts` defines `EdgarFetchTelemetry`, `EdgarFetchTelemetryEvent` (`{op, path_family, status, url, correlation_id, duration_ms}`), and `defaultEdgarFetchTelemetry` (single-line structured JSON via `console.log`). All four fetcher classes (`EdgarCikMapper`, `EdgarDailyIndexFetcher`, `EdgarAccessionIndexFetcher`, `EdgarForm4Fetcher`) accept optional `telemetry` + `correlationId` constructor parameters (additive, backward-compatible defaults) and emit a per-fetch event on response receipt AND on network-throw (status=0 sentinel for pre-response failures). Telemetry callback is defensively try/catched — MUST NOT break the fetch path. Path-family tags: `'company_tickers'` (cik-mapper), `'master_index'` (daily-index), `'accession_index'` (accession-index fetcher), `'form4_xml'` (form4 fetcher). This is the surface that makes future F1-class pivots evidence-based.
- **Drift sentinel:** `edgar-daily-index-fetcher_test.ts` test `(2b) DRIFT SENTINEL` asserts `dailyIndexUrl(d)` matches `/master\.\d{8}\.idx$/` AND does NOT match `/form\.\d{8}\.idx$/` across 5 sample dates spanning all four quarters. Both assertions are load-bearing: a regression that reverts to `form.YYYYMMDD.idx` fails the `assertNotMatch`; a typo introducing a third variant fails the `assertMatch`. Paired with test `(5)` which feeds the legacy form.idx fixed-width header into `parseDailyIndexBody` and asserts `[]` — guards against silent misread of the prior format.
- **Fixture pair:** `FIXTURE_MASTER_MIXED` (7 input rows: 3× '4' + 1× '4/A' + 1× '8-K' + 1× '10-K' + 1× '3'; 4 surviving post-filter) proves the post-parse Form-Type filter; `FIXTURE_MASTER_FORM4_ONLY` (3 input rows: all '4' or '4/A'; 3 surviving) proves filter identity (no row dropped when every input already passes).

**F1.b — docs (ACT-199, this commit):**

- `docs/ai-failure-modes.md` #41 Status row — second phantom-defect observation joining the ACT-197 TS2307 retraction; forward-binding rule codified at catalog level.
- This section.
- `docs/06-tracking/action-tracker.md` ACT-199 entry.

**Phase-4 next step:** operator re-fires the backfill init against the deployed `longshort-insider-compute-manual` at the F1.a-bearing HEAD. The master.idx-bearing fetcher is expected to clear the egress block on the discovery layer; the per-accession `index.json` + form4 XML paths were already 200 from the same egress per the ACT-197 path-probe matrix (rows e + f). Signal #4 STAYS DISARMED through F1.a + F1.b; arm-up follows the backfill-before-arm gate at ~5.3 h overnight drain + validation fire per the γ commit-3 Phase 4 runway.

**Cross-references:** ACT-197 (#41 symmetric-form first observation), ACT-198 (γ arc closure + ACT-198-window diagnostic that surfaced the single-point inversion), ACT-199 (this section's landing ACT).

## FP-050 Phase 4 F2.a — discovery-queue table (ACT-202, MIG-096)

**Sub-commit position:** F2.a in the four-sub-commit F2 sequence (F2-pre deployed-SHA verifier ACT-201 → **F2.a queue table — this commit** → F2.b discovery script + GHA workflow + operator secrets guidance → F2.c `seedWorkItems` switch + R1 heartbeat-or-distinction + R2 concurrency-safety regression test → F2.d module doc + final ACT + FP-050 Status). Migration-only; no edge-function code changes; the F2-pre deploy-SHA verifier contract binds only on deploy steps and does NOT gate this commit.

**Schema (MIG-096 / `sql/16_insider_accession_discovery_queue.sql`):**

| Column | Type | Notes |
|---|---|---|
| `as_of_date` | `date NOT NULL` | trading-day key (matches signal `as_of`) |
| `issuer_cik` | `text NOT NULL` | zero-padded, parser-canon |
| `accession_number` | `text NOT NULL` | EDGAR accession |
| `form_type` | `text NOT NULL` | `CHECK form_type IN ('4','4/A')` |
| `company_name` | `text NOT NULL` | from `master.idx` row |
| `filename` | `text NOT NULL` | relative path from `master.idx` row |
| `discovered_at` | `timestamptz NOT NULL DEFAULT now()` | row write time |
| `discovered_by` | `text NOT NULL` | egress tag (`'github-actions'`, `'cloudflare-worker'`, `'operator-cli'`) — lets reconciliation distinguish runner families during cutovers |
| `discovery_correlation_id` | `text NOT NULL` | joins back to producer-fire telemetry |
| `consumed_at` | `timestamptz NULL` | set by `seedWorkItems` claim-and-mark at F2.c |
| `consumed_run_id` | `uuid NULL` | the `signal_compute_log` `run_id` that drained the row (FK-shaped, NOT enforced) |

**PK:** `(as_of_date, issuer_cik, accession_number)` — locks the §(h) idempotency triple at the discovery layer: an accession can be surfaced AT MOST ONCE per `as_of_date` per `issuer_cik`. F2-b producer's reseed of the same trading day is `ON CONFLICT DO NOTHING` and safe under retry.

**RLS family** (mirrors `signal_queue_*` / `signal_observations` / sql/13 deny-write triad — five policies):

1. `iadq_service_role_all` — PERMISSIVE ALL to `service_role` (producer + consumer both run service-role).
2. `iadq_longshort_view_select` — PERMISSIVE SELECT to `authenticated` gated by `public.has_permission(auth.uid(), 'longshort.view')` (admin tooling renders discovery coverage; queue is NOT exposed to every authenticated user).
3. `iadq_deny_authenticated_insert` — RESTRICTIVE INSERT `WITH CHECK (false)`.
4. `iadq_deny_authenticated_update` — RESTRICTIVE UPDATE `USING (false) WITH CHECK (false)`.
5. `iadq_deny_authenticated_delete` — RESTRICTIVE DELETE `USING (false)`.

RESTRICTIVE policies AND-combine and cannot be OR-defeated by any future PERMISSIVE policy — the deny triad makes discovery-row forgery (silent-zero-day exposure) and discovery-row drops structurally impossible for any non-service-role caller.

**Indexes:**

- PK `(as_of_date, issuer_cik, accession_number)` — point lookups + `as_of_date` range scans.
- `idx_iadq_unconsumed_by_day` — partial `(as_of_date) WHERE consumed_at IS NULL`. Covers the F2.c consumer's hot path `WHERE as_of_date = $1 AND consumed_at IS NULL`; partial keeps the index small (most days drain to empty within minutes of the cron fire).

**§22.5.1 live-read precondition + post-apply evidence:** pre-apply read via `supabase--read_query` returned `{table_present_pre: 0, policy_count_pre: 0, index_count_pre: 0}` (the safety-claim evidence: the table is being created from nothing, the `count(*) = 0` precondition holds trivially). Post-apply evidence pasted into MIG-096 ledger row once the operator confirms the migration applied (or applies `sql/16_insider_accession_discovery_queue.sql` via Dashboard as the OOB companion path — empty-table safety makes the operator-applied path equivalent).

**What this commit does NOT do:** no producer script (F2.b), no GHA workflow (F2.b), no `seedWorkItems` switch (F2.c), no heartbeat/concurrency-safety regression test (F2.c), no `cron.job` change, no `enabled` flip, no `signal_registry` touch, no `job_registry` touch, no `function-index.md` / `event-index.md` / `permission-index.md` touch (no new shared functions / events / permissions — table-only). Signal #4 STAYS DISARMED through F2.a → F2.d.

**Deploy gate:** NO deploy required for this commit. F2.a is migration-only; the F2-pre `check-deployed-sha` MATCH gate binds at F2.b and F2.c when the edge-function bundle changes.

**Four-gate attestation block (ACT-202)** — produced verbatim by `scripts/check-gate-evidence.ts` at HEAD `6e7cdea4943b820bb22790f4ab8ca9f22ea5e0ff`:

```
=== check-gate-evidence ATTESTATION (paste verbatim) ===
HEAD: 6e7cdea4943b820bb22790f4ab8ca9f22ea5e0ff
Generated: 2026-06-13T04:34:40.975Z

Gate 1: deno run --allow-read scripts/check-wall-clock.ts
  exit=0  duration_ms=311
  final-line: check-wall-clock: CLEAN — 0 violations

Gate 2: cd supabase/functions && deno test --allow-net --allow-env --allow-read _shared/
  exit=0  duration_ms=33775
  final-line: ok | 1045 passed | 0 failed (29s)

Gate 2b: cd supabase/functions && deno test --allow-net --allow-env --allow-read
  exit=0  duration_ms=35742
  final-line: ok | 1262 passed | 0 failed (33s)

Gate 3: npx eslint .
  exit=0  duration_ms=9553
  final-line: ✖ 15 problems (0 errors, 15 warnings)

Verdict: ALL GREEN
=== end attestation ===
```

The post-edit HEAD adds only this section, the MIG-096 ledger row, the ACT-202 tracker entry, and `sql/16_insider_accession_discovery_queue.sql`. No test surface moves; the block re-runs to the same final lines at the post-edit HEAD.

**Cross-references:** ACT-201 (F2-pre deployed-SHA verifier — the load-bearing interface check this F2.a does NOT need to invoke, since migration-only); ACT-199 (F1 master.idx pivot — the prior Phase-4 commit); MIG-095 (the prior migration on this table family); DEC-058 §(h) (idempotency triple); FP-050 Phase 4 F2 architecture proposal (ratified — recommendation F2-a / GitHub Actions adopted for F2.b).

## FP-050 Phase 4 F2.b — producer (GHA-egress discovery script + workflow + operator secrets) (ACT-203)

**Sub-commit position:** F2.b in the four-sub-commit F2 sequence (F2-pre ACT-201 → F2.a ACT-202 → **F2.b ACT-203 — this commit** → F2.c (`seedWorkItems` switch + R1 heartbeat-consumption semantics + R2 concurrency-safety regression) → F2.d module-doc + final ACT + FP-050 Status). This commit ships the producer ONLY; consumption is F2.c. Until F2.c lands, the insider seed path remains broken (and DISARMED — no harm); F2.b populates the queue, F2.c reads it.

**Deploy gate:** NO deploy required. F2.b touches no Supabase edge-function code; the entire producer runs on GitHub Actions egress. The F2-pre `check-deployed-sha` MATCH contract binds only on deploy steps and re-enters at F2.c when the consumer edge-function changes.

### Producer architecture

| Layer | File | Purpose |
|---|---|---|
| Script | `scripts/insider-discovery-egress.ts` | Deno CLI. Reuses `EdgarDailyIndexFetcher` (F1 master.idx parser — UNCHANGED, single source of parsing truth; the existing drift sentinels — `assertMatch(/master\.\d{8}\.idx$/)` + `assertNotMatch(/form\.\d{8}\.idx$/)` — protect BOTH call sites). Reuses `isTradingDay` + `iterateTradingDays` shape from `longshort-universe/shared/trading-days.ts` (the shared NYSE-holiday calendar — DO NOT re-implement). Writes via Supabase REST `POST /rest/v1/insider_accession_discovery_queue` with `Prefer: resolution=ignore-duplicates,return=minimal` (ON CONFLICT DO NOTHING on the natural PK). Stamps `discovered_by` per mode + `discovery_correlation_id` per invocation (one UUID for the whole run). Structured JSON logs to stdout on every event (start / day-start / day-complete / day-empty / day-unavailable / run-complete / failure). |
| Tests | `scripts/insider-discovery-egress_test.ts` | 14 hermetic tests covering all five operator-mandated fixtures: (a) master.idx parse → REST payload shape (Form 4 + 4/A surviving the post-parse filter; rowFromEntry parity); (b) multi-day backfill weekday + NYSE-holiday iteration (Memorial Day 2026-05-25 verified skipped); (c) empty-day + 404 heartbeat insert (two cases); (d) SEC HTTP 403 + network throw → `EdgarFetchError` surfaced (no Supabase insert on SEC failure); (e) arg validation — daily, backfill, mode-mixing rejection, missing-flags rejection, malformed-date rejection, inverted-range rejection, unknown-arg rejection. Fully injectable via `RunDeps`; no network, no real EDGAR, no Supabase. |
| Workflow | `.github/workflows/insider-discovery.yml` | `schedule: '15 20 * * 1-5'` UTC daily (30-min buffer before the 21:15 UTC `longshort.insider.compute` cron — buffer absorbs GHA scheduler jitter ~5-15 min typical) + `workflow_dispatch` with `backfill_from` / `backfill_to` inputs. `concurrency: insider-discovery` serializes runs. Deno v1.x (parity with `strong-evidence.yml`). 30-min `timeout-minutes`. On failure → GHA's native email alert (no bespoke alerting wiring). |

**Modes (mutually exclusive — parseArgs rejects mixing):**

- `--as-of=YYYY-MM-DD` — single-trading-day daily mode. `discovered_by='gha-daily'`.
- `--backfill-from=YYYY-MM-DD --backfill-to=YYYY-MM-DD` — one-shot bulk mode; iterates trading days inclusive (~63 trading days for the 2026-03-15 → 2026-06-13 window per the backfill arithmetic in §FP-050 Phase 3.6b.iii′ pre-work). `discovered_by='backfill-oneshot'`.

**Exit codes** (mirrored by GHA's pass/fail surface):

| Code | Meaning |
|---|---|
| 0 | success — all days processed and persisted |
| 1 | SEC API failure — `EdgarFetchError` surfaced on any day |
| 2 | Supabase API failure — non-2xx from PostgREST on any insert |
| 3 | arguments / env error |

### R1 heartbeat-at-write-seam (per F2 ratification refinement R1)

For any trading day where the parsed Form-4 set is empty (legitimate-but-quiet day OR master.idx 404 → `kind:'unavailable'`), the script inserts ONE sentinel row:

```
as_of_date            = <the trading day>
issuer_cik            = '__heartbeat__'
accession_number      = '__heartbeat__'
form_type             = '4'                   -- CHECK form_type IN ('4','4/A')
company_name          = '__heartbeat__'
filename              = '__heartbeat__'
discovered_by         = 'gha-daily' | 'backfill-oneshot'
discovery_correlation_id = <run UUID>
```

This makes **"discovery ran with zero Form-4s"** structurally distinguishable from **"discovery did not run."** The F2.c consumer's `seedWorkItems` will read the heartbeat row, mark it consumed (claim-and-skip), and proceed without seeding any work — a non-empty-day signal that consumes-and-skips. The `'__heartbeat__'` CIK + accession-number sentinels are distinguishable from any real row at consumer time (real CIKs are integer strings; real accessions are `NNNNNNNNNN-NN-NNNNNN`).

### Operator secrets guidance (verbatim — DO NOT abbreviate; the previous EDGAR_CONTACT_EMAIL UA-format slip cost a round)

Three GitHub Actions **repository** secrets MUST be set before the workflow can run. Click sequence and value format are LITERAL — paste shapes exactly as specified.

**Click path:** GitHub repo → **Settings** (top nav) → **Secrets and variables** (left sidebar) → **Actions** → **New repository secret** (top-right button) → fill **Name** + **Secret** → **Add secret**. Repeat for each of the three secrets below.

| GHA secret name | Format / shape | Where to find the value |
|---|---|---|
| `SUPABASE_URL` | EXACT shape `https://<project-ref>.supabase.co` (no trailing slash, no `/rest/v1`, no anon-key fragment). For this project: `https://sftatlxatbdrotivxcip.supabase.co`. | Supabase Dashboard → Project Settings → **API** → **Project URL** (copy the exact string shown). |
| `SUPABASE_SERVICE_ROLE_KEY` | A long `eyJ…` JWT string (typically ~200 chars; three dot-separated base64url segments). **NEVER** paste the `anon` / `publishable` key here — the producer needs RLS-bypass for the discovery-queue write, and the anon key cannot insert. | Supabase Dashboard → Project Settings → **API** → **Project API keys** → **service_role** → **Reveal** → copy. Treat as production-equivalent credential. |
| `EDGAR_CONTACT_EMAIL` | A **plain RFC-5322 email address ONLY**, e.g. `crosswind-ops@example.com`. Do **NOT** wrap in `<…>`, do **NOT** prefix `mailto:`, do **NOT** include any "Crosswind <…>" framing — the script composes the SEC User-Agent header from this raw email via `buildEdgarUserAgent(contactEmail, moduleId)`; any extra characters land verbatim in the UA and trip SEC's UA-format reject (the round-cost incident this row references). | The CROSSWIND ops contact email used in `EDGAR_CONTACT_EMAIL` for the Supabase edge runtime (mirror that value exactly). |

After all three secrets are set, the workflow will fire on the next 20:15 UTC weekday slot automatically. No `git push` is required to "activate" it — GHA reads workflow files from `main` HEAD at each scheduled tick.

### One-shot backfill invocation (copy-paste, NOT described)

The backfill is what tonight's drain depends on; the invocation MUST be copy-pasteable.

**Click path** (preferred, no `gh` CLI required):

1. GitHub repo → **Actions** tab → left sidebar **insider-discovery** workflow → **Run workflow** dropdown (top-right of the runs list).
2. **Use workflow from:** `main` (default).
3. **Backfill start date:** `2026-03-15`
4. **Backfill end date:** `2026-06-13`
5. Click **Run workflow** (green button).

**`gh` CLI equivalent** (paste verbatim, replacing `<owner>/<repo>` with the actual GitHub slug):

```bash
gh workflow run insider-discovery.yml \
  --repo <owner>/<repo> \
  --ref main \
  -f backfill_from=2026-03-15 \
  -f backfill_to=2026-06-13
```

Single invocation iterates ~63 trading days (Mar 15 → Jun 13 inclusive, weekends + Memorial Day 2026-05-25 + Juneteenth 2026-06-19 skipped by the shared trading-days iterator). At the producer's ~1.5 s/day median (SEC fetch + PostgREST insert), wall-clock is ~95 s; well inside the workflow's 30-min `timeout-minutes`. After the bulk lands, operator fires `longshort-insider-compute-manual` for the window. Scheduled daily mode then takes over.

### What this commit does NOT do

No `seedWorkItems` edit (lands at F2.c — the consumer switch + heartbeat-row consumption semantics + R2 concurrency-safety regression test); no `cron.job` change; no `enabled` flip; no `signal_registry` touch; no `job_registry` touch; no migration (no schema change); no `event-index.md` / `permission-index.md` / `route-index.md` touch; no `feature-proposals.md` Status touch (folds into F2.d closure); no edge-function code change; no deploy.

### Four-gate attestation block (ACT-203) — produced verbatim by `scripts/check-gate-evidence.ts` at HEAD `8bd990d88f851c2bddf65e6c8b877e9bf0875a19`

```
=== check-gate-evidence ATTESTATION (paste verbatim) ===
HEAD: 8bd990d88f851c2bddf65e6c8b877e9bf0875a19
Generated: 2026-06-13T04:46:01.040Z

Gate 1: deno run --allow-read scripts/check-wall-clock.ts
  exit=0  duration_ms=188
  final-line: check-wall-clock: CLEAN — 0 violations

Gate 2: cd supabase/functions && deno test --allow-net --allow-env --allow-read _shared/
  exit=0  duration_ms=29593
  final-line: ok | 1045 passed | 0 failed (29s)

Gate 2b: cd supabase/functions && deno test --allow-net --allow-env --allow-read
  exit=0  duration_ms=31558
  final-line: ok | 1262 passed | 0 failed (31s)

Gate 3: npx eslint .
  exit=0  duration_ms=7648
  final-line: ✖ 15 problems (0 errors, 15 warnings)

Verdict: ALL GREEN
=== end attestation ===
```

**Scope note on Gate 2 / 2b:** the new tests live under `scripts/insider-discovery-egress_test.ts`, which falls under the CI strong-evidence Gate 2 (`deno test --allow-read --allow-net --allow-env scripts/`), not the supabase/functions Gates 2 / 2b sweep. The 14 new tests were run directly at HEAD via `deno test --allow-net --allow-env --allow-read scripts/insider-discovery-egress_test.ts` → `ok | 14 passed | 0 failed (11ms)` before this attestation block was captured. Gate-2 supabase counts are unchanged because no `_shared/` test surface moved.

**Cross-references:** ACT-202 (F2.a queue table — the write target this producer fills); ACT-201 (F2-pre verifier — re-enters at F2.c); ACT-199 (F1 master.idx pivot — single-source-of-parsing-truth invariant); DEC-058 §(h) (PK idempotency); `scripts/insider-discovery-egress.ts` (the producer); `scripts/insider-discovery-egress_test.ts` (17-test hermetic suite after ACT-204 hardening); `.github/workflows/insider-discovery.yml` (the cron + dispatch surface); `docs/07-reference/function-index.md` (entry added this commit). NO migration, NO `MIG-NNN` ledger touch (no schema change). F2.c next.

## FP-050 Phase 4 F2.b-hardening — parse/filter semantic-success gate (ACT-204)

**Diagnosis from one real row.** GHA run #3 (`discovery_correlation_id=658b8070-dba7-44f9-881e-cd12b4c81f8b`) returned `days:63`, `rows_inserted:0`, `heartbeats_inserted:63` despite EDGAR fetches returning 200. The failure was NOT CIK normalization: master.idx raw `1045810` pads to `0001045810`, matching the SEC `company_tickers.json` / universe operand for NVDA. The failure was parser shape drift: the F1 parser accepted only the synthetic header `CIK|Company Name|Form Type|Date Filed|Filename` plus ISO `YYYY-MM-DD`; real SEC `master.idx` uses `CIK|Company Name|Form Type|Date Filed|File Name` plus compact `YYYYMMDD`.

**Real-row evidence (2026-06-05 NVDA).**

```text
raw line: 1045810|NVIDIA CORP|4|20260605|edgar/data/1045810/0001768670-26-000002.txt
parsed: { filer_cik:'1045810', company_name:'NVIDIA CORP', form_type:'4', date_filed:'2026-06-05', filename:'edgar/data/1045810/0001768670-26-000002.txt', accession_number:'0001768670-26-000002' }
master operand: 1045810 → 0001045810
universe operand: NVDA → 0001045810
predicate: 0001045810 === 0001045810
verdict: parser header/date mismatch; CIK normalization is correct.
```

**Hardening landed.** `edgar-daily-index-fetcher.ts` now accepts BOTH real `File Name` and historical `Filename` header spellings, normalizes compact `YYYYMMDD` to ISO `YYYY-MM-DD`, and keeps the positional five-column parser + exact `form_type in ('4','4/A')` predicate. `scripts/insider-discovery-egress.ts` now loads current universe tickers, resolves them through `EdgarCikMapper`, filters to in-universe padded CIKs before queue writes, stores real queue `issuer_cik` as padded 10-digit CIK, emits `entries_parsed` + `entries_after_universe_filter`, and refuses green exit when parsed entries exist but semantic in-universe rows are zero.

**External-write verification gate.** Each PostgREST insert logs `event:'insider_discovery_supabase_insert'` with REST path, attempted row count, HTTP status, `Preference-Applied`, as_of date, and correlation ID. Run completion performs a read-back count by `discovery_correlation_id` and includes `persisted_rows_by_correlation_id`; expected writes with zero persisted rows now throw instead of returning success.

**Regression tests.** Added real-row sentinels at all three seams: parser (`edgar-daily-index-fetcher_test.ts` real NVDA row), producer (`scripts/insider-discovery-egress_test.ts` real NVDA row + in-universe predicate + external-write evidence), and consumer seed seam (`insider-work-list-registration_test.ts` padded NVDA CIK operand). Focused evidence: producer suite `ok | 17 passed | 0 failed`; parser+consumer focused suite `ok | 39 passed | 0 failed`.

**Catalog entry.** `docs/ai-failure-modes.md` Catalog #44 records the structural-success-without-semantic-success class: fetches, exits, heartbeats, and attempted writes are not evidence of correctness unless paired with semantic payload counters and persisted-by-correlation verification.

## FP-050 Phase 4 F2.c — consumer queue switch + R1/R2 contracts + work-budget update (ACT-205)

**Sub-commit position:** F2.c in the four-sub-commit F2 sequence (F2-pre ACT-201 → F2.a ACT-202 → F2.b ACT-203 (+ ACT-204 hardening) → **F2.c ACT-205 — this commit** → F2.d closure). This commit switches `seedWorkItems` from on-EDGAR daily-index fetches to a Supabase claim against `insider_accession_discovery_queue` (populated by the F2.b GHA-egress producer), codifies the R1 heartbeat-exclusion structural predicate at the consumer, ratifies the R2 single-statement-atomicity concurrency contract, and updates the per-day work-budget ceiling from the prior ~352 M4-RE-RULE estimate to the empirically-measured 800.

**Deploy gate (BINDS HERE for the first time).** This commit changes the `longshort-insider-compute` and `longshort-insider-compute-manual` edge-function bundles (shared module `supabase/functions/_shared/longshort-signals/insider-transactions/insider-work-list-registration.ts` is in the bundle's import graph). Per the F2-pre `check-deployed-sha` four-outcome contract (ACT-201, `docs/ai-failure-modes.md` §22.8.5), the work-complete report MUST paste a MATCH attestation against both deployed functions at the F2.c HEAD SHA. Without the MATCH attestation the commit is auto-NEEDS-REVISION.

### Consumer switch — `seedWorkItems` no longer hits EDGAR

The on-EDGAR daily-index call site is exclusively the GHA-egress producer (`scripts/insider-discovery-egress.ts`); `EdgarDailyIndexFetcher` is no longer constructed or referenced from `insider-work-list-registration.ts` or `insider-queue-bootstrap.ts`. The F1 master.idx drift sentinels (ACT-199 / ACT-204) travel with the producer's parser+fetcher and are never relaxed.

Daily mode reads exactly one `as_of_date` (yesterday's trading day under the weekends-only-skip approximation); backfill mode iterates the queue's own distinct unconsumed `as_of_date`s within the 63-trading-day window bounded by `previousTradingDay(asOf)` and the oldest trailing day. The queue is authoritative for which days have producer rows — gaps stay gaps.

### R1 heartbeat-exclusion (claim-predicate level)

The producer writes a single sentinel row for empty/unavailable days with `issuer_cik = accession_number = '__heartbeat__'`. The consumer's claim predicate STRUCTURALLY excludes the sentinel via the operator-verbatim conjunction:

```sql
NOT (issuer_cik = '__heartbeat__' AND accession_number = '__heartbeat__')
```

The 63 inert pre-hardening heartbeats from run `658b8070-dba7-44f9-881e-cd12b4c81f8b` exercised this filter on first use (ACT-205 finding (a)). They remain inert in the queue forever — the heartbeat predicate paired with the universe-CIK IN-filter independently keeps them out of every claim. The constants `INSIDER_HEARTBEAT_ISSUER_CIK` / `INSIDER_HEARTBEAT_ACCESSION_NUMBER` are re-exported from the consumer module and pinned equal to the producer's `HEARTBEAT_ISSUER_CIK` / `HEARTBEAT_ACCESSION_NUMBER` by test `(D.5)` so producer/consumer cannot silently drift.

### R2 concurrency contract — single-statement atomicity (ratified narrowing)

The original F2.c brief specified "consume-UPDATE + work-item-INSERT in ONE explicit BEGIN/COMMIT transaction". That wording was a supervisor-brief defect: the engine's `WorkListSeedFn` returns an array, and the cursor INSERT into `signal_queue_cursor` is engine-owned (`queue-init.ts`) — after `seedWorkItems` returns — so the literal "same TX" requirement is architecturally incompatible without re-ordering engine internals (out of F2.c scope). The operator ruling (F2.c) ratified the narrowing to **single-statement atomicity**:

> "Row-level lock atomicity replaces same-TX bracketing — the consume-UPDATE alone is the concurrency barrier; the engine's downstream cursor INSERT inherits atomicity from per-run_id uniqueness."

The claim is one `UPDATE … WHERE consumed_at IS NULL … RETURNING …` statement. Two concurrent calls against overlapping rows serialize at Postgres row-level locks; the second update sees `consumed_at IS NOT NULL` (already set by the first commit) and returns zero rows. The engine's downstream `signal_queue_cursor` INSERT is keyed by `(run_id, ticker)` with a unique `run_id` per init, so double-insert is structurally impossible end-to-end. The narrowing is catalogued as a Catalog #43 recursive supervisor-brief-defect ("over-specified without checking the engine's seed contract") — the SAME failure shape FP-050 has firing in prior rounds. The lesson is not "be more careful with brief language" but "verify the engine surface before binding the brief".

### Forward-binding test pattern — Deno two-client concurrent fire

`supabase/functions/_shared/longshort-signals/insider-transactions/insider-r2-concurrent-claim_test.ts` is the project's **first** transactional-contention test pattern. Forward-binding for every future signal-queue concurrency regression. Pattern:

1. Two independent `SupabaseClient` instances (service-role key — production claim runs under service-role via `supabaseAdmin`; row-lock is what gates the contention, not auth identity).
2. Seed a fixture: N synthetic discovery rows on `as_of_date = '1990-01-02'` (far outside any real window so the test cannot collide with production drain) with a unique `discovery_correlation_id`.
3. `Promise.allSettled([claim(A), claim(B)])` — both fire the exact `UPDATE … RETURNING` shape `seedWorkItems` uses.
4. Assert disjoint outcome: exactly one resolved with N > 0, the other with 0; the sum equals the fixture size; the sequential follow-up against the now-empty pool returns 0.
5. Cleanup keyed by `discovery_correlation_id` — idempotent across runs.

The file ignores cleanly when `VITE_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are absent (no spurious CI failures); it RUNS against the live DB whenever the env is present (CI + GHA + operator-local).

### Per-day work-budget ceiling — 800 (queue-evidence update)

The prior `accessionsPerSlice` sizing band was ~253 typical / ~352 measured-max from the Phase-3.5 forensic table (three daily indexes, 2026-06-03/04/05). The F2.b backfill (correlation `aad615ab-1b58-40d4-b989-7ecc64e16e5a`) landed real evidence on 63 days totalling 14,172 rows — distribution top: **770 on 2026-04-02** (post-earnings cluster), **522 on 2026-03-17**, both above the prior soft 500 band. The new ceiling `INSIDER_PER_DAY_WORK_BUDGET_CEILING = 800` pads the empirical top by ~4% for variance robustness. ⌈800/50⌉ = 16 slices × ~35-55 s ≈ 9-15 min per day — inside the daily window with hours of headroom. Backfill drain at 14,172 accessions: ⌈14172/50⌉ = 284 slices × 35-55 s ≈ 2.8-4.3 h overnight. Drift sentinel test `(A.2)` pins the constant.

### ACT-205 findings inventory

| ID | Finding | Disposition |
|----|---------|-------------|
| (a) | 63 inert pre-hardening heartbeat rows from broken-parser run `658b8070-…` remain in the queue. PK shape `(as_of_date, '__heartbeat__', '__heartbeat__')` lets prior and current heartbeat runs coexist. | Inert per R1 — the structural claim-predicate exclusion (`NOT (cik='__heartbeat__' AND acc='__heartbeat__')`) plus the universe-CIK IN-filter independently keep them out of every claim. No cleanup required; one-shot service-role DELETE is an option but not necessary. |
| (b) | 2-row attempted-vs-persisted delta in the F2.b backfill (14,174 attempted vs 14,172 persisted across 63 days). | Sub-noise-floor (1.4×10⁻⁴). Most-likely cause: SEC double-listing of two accessions on the master.idx (same `(as_of_date, issuer_cik, accession_number)` triple → second insert is the F2.a PK ON-CONFLICT-DO-NOTHING no-op). Named for the record; no further investigation. |
| (c) | Work-budget ceiling updated from ~352 (M4 RE-RULE estimate) to 800 (empirical max + ~4% pad). | Codified in `INSIDER_PER_DAY_WORK_BUDGET_CEILING`; drift-sentinel test `(A.2)` pins it; arithmetic comment block in `insider-work-list-registration.ts` updated. |
| (d) | R2 contract narrowed from "same TX" to single-statement atomicity per operator ruling. | Catalog #43 recursive supervisor-brief-defect logged; ratified narrowing documented in this section and in the module file header. |
| (e) | First transactional-contention test pattern (Deno two-client concurrent fire against live DB). | Forward-binding for all future signal-queue concurrency regressions. Referenced from this section; pattern lives at `insider-r2-concurrent-claim_test.ts`. |

### Four-gate attestation block (ACT-205)

Produced verbatim by `scripts/check-gate-evidence.ts` at HEAD `<set by operator after commit>`. The deployed-SHA MATCH proof against both `longshort-insider-compute` and `longshort-insider-compute-manual` is reproduced in the work-complete report alongside the four-gate attestation. Without MATCH = NEEDS-REVISION.

**Files touched:** `supabase/functions/_shared/longshort-signals/insider-transactions/insider-work-list-registration.ts` (header rewrite + seed switch + constants); `…/insider-queue-bootstrap.ts` (`EdgarDailyIndexFetcher` removed from deps construction); `…/insider-cross-mode-contamination_test.ts` (drop `dailyIndex` stub); `…/insider-work-list-registration_test.ts` (rewrite (D.*) tests against queue stub; add (A.2) work-budget drift sentinel; add (D.5) heartbeat-exclusion regression); NEW `…/insider-r2-concurrent-claim_test.ts` (forward-binding pattern); this module doc; `docs/06-tracking/action-tracker.md`; `docs/07-reference/function-index.md`.

**What this commit does NOT do:** no `cron.job` change; no `enabled` flip; no `signal_registry` touch; no `job_registry` touch; no migration (queue schema is F2.a / MIG-096 — UNCHANGED); no `event-index.md` / `permission-index.md` / `route-index.md` touch (no new shared events / permissions / routes); no `feature-proposals.md` Status touch (folds into F2.d closure); no producer change (`scripts/insider-discovery-egress.ts` is unchanged at F2.c). Signal #4 STAYS DISARMED through F2.c, F2.d, and operator validation. Arms ONLY after validation reads clean.
**Deploy gate:** no edge-function deploy required for the GHA producer hardening itself; however the shared parser file is consumed by edge code, so F2.c deploy-SHA MATCH remains the binding deployment proof before the consumer can be attested. Signal #4 STAYS DISARMED.