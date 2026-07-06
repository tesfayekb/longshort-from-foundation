# FP-069 Overshoot — Forward Roadmap (ROI-ordered, evidence-gated)

**Owner:** operator (final authority) · supervisor (draft/review) · Lovable (execution)
**Anchor:** FP-069 (see `docs/08-planning/feature-proposals.md`); master-plan
linkage recorded at `docs/08-planning/master-plan.md` PLAN-TRADING-001 section
per the FP-069 W4 CLOSED clause; charter ACT-467 (`docs/06-tracking/action-tracker.md`).
**Purpose:** the full forward sequence from W4-CLOSED console to small live capital,
ordered to minimize time-to-first-real-fill while gating each irreversible step on
banked evidence. Every phase names entry criteria, exit criteria, owner, and the
standing invariants that never bend.

**Standing invariants (apply to every phase — never negotiable):**
- One prompt in flight (operator-serialized execution).
- Machine-rule gates on every tranche: separation-guard headline; tsgo + eslint;
  TODO-grep; Polygon-only price grep; byte-untouched diffs (longshort tree +
  supabase engine tree + lockfiles) when scope excludes them; no new deps
  without justification.
- Data-write bracket discipline: every write path is dry-run-attested before
  arming; every arming is registry-row-flip + first-fire attestation.
- Polygon-only prices (no console-driven price fetches; live-price source
  contract per the standing directive).
- Never-silent-drop: every refusal writes an audit row + increments a typed
  counter; no silent sentinels in money paths (anti-phantom-defaults).
- Part-2 EXEC outranks everything the moment operator evidence lands.

---

## PROOF ITEM — Exit-Run Per-Lot Isolation (as of HEAD `9fdd4334`)

`supabase/functions/overshoot-exit-run/index.ts` per-lot loop (lines 449-545)
isolation status: **PARTIAL — isolation present on submitter + pricing;
ABSENT on Polygon fetch + per-lot SQL.** Verbatim structural evidence:

- **Line 449** — `for (const m of report.matched) { … }` iterates per (symbol, side, lotIds) group.
- **Lines 481-496** — pricing refusal: `fetchPolygonSnapshot` return-null → `constructExitLimitPrice` typed-refusal path → `tally.exit_price[refusal] += 1` + audit row + `continue`. Isolated.
- **Lines 509-544** — submitter: `try { submitOrder(...) } catch (err) { tally.submissions_failed += 1; typed reason from OvershootAlpacaApiError | NetworkError | CredentialError | 'submit_unexpected'; audit row; loop continues }`. Isolated.
- **Gaps** — `fetchPolygonSnapshot` throw on raw `fetch` network error (line 146) is NOT wrapped per-lot; per-lot SQL age-check (`sql\`SELECT …\`` at 452-467) is NOT wrapped. Either throw abandons remaining lots in the same tick.

**Ruling:** the operator directive was "if isolation is absent, STOP and report — it
becomes hardening-wave item zero." Isolation is present on the submitter core (the
most likely failure mode in normal operations) but ABSENT on network/pricing IO and
per-lot SQL. Per the ruling this becomes **H0 (was H6, promoted)** in the Hardening
wave — the pre-arming gate cannot pass without full per-lot isolation. Roadmap
incorporates the promotion; no engine touch this turn (docs-only tranche).

---

## PHASE NOW — First Light [attended] (this week)

**Owner:** operator (execution); Lovable (evidence intake); supervisor (adjudication).
**Objective:** bank the first real detection + first real entry-fill + first real
exit-fill under attended brackets, per FP-069 §9 Parts 1-2.

**Scope (verbatim):**
- Session 1 — detection bracket (Mon evening); repeat until `selected_count > 0`.
- Session 2 — entry bracket (morning after GO); real submission via `overshoot-entry-run` with attendance.
- Evidence bundles banked at each session (six-MATCH boot probes; audit-row IDs; broker fill confirms).
- Exit first-light lands **T+5 sessions after the first entry fills** (calendar dependency stated — no in-week acceleration).
- W4.e config no-op attestation (30-second SECURITY DEFINER RPC round-trip; anytime).

**Entry criteria:** W4 console closed (met — ACT-465.h); `position_already_open`
entry gate landed (met — ACT-466); Part-2 EXEC runbook current (FP-069 §9).
**Exit criteria:** ≥1 detection run with `selected_count>0` banked; ≥1 real entry
fill in `overshoot_lots`; ≥1 real exit fill closing an overshoot_lot; ACT-467
first-light closure evidence captured.

---

## PHASE H — Hardening Wave (parallel, this week + next; charter ACT-468 when NOW banks)

**Owner:** Lovable (implementation); supervisor (review); operator (arming).
**Objective:** every item that must land BEFORE the arming gate. This is the
pre-arming gate — ARM does not open until H0-H5 are green.

- **H0 (promoted from H6, Tier A — money path)** — **CLOSED ON LANDING (ACT-468, 2026-07-06).** exit-run per-lot isolation. `fetchPolygonSnapshot` and per-lot SQL (session-age query) now wrapped in a full per-lot try/catch keyed on a `perLotStage` tag; typed refusal counters added to `RefusalTally` (`session_age_query_failed`, `snapshot_fetch_failed`, `per_lot_unexpected`); accounting identity extended; loop continues on any per-lot failure. Run-level failures (boot, kill-switch/disarmed, /v2/clock, broker positions, open-lots SELECT, config) stay run-level per the boundary comment. Evidence: `supabase/functions/overshoot-exit-run/index.ts` + `index_test.ts` (24/24 tests green, 6 new ACT-468 sentinels); gates pasted in the ACT-468 tracker entry.
- **H1** — late-fill CID-adoption sweep. Own-CID fills arriving AFTER entry-run's `position_already_open` check become `overshoot_lots` automatically (CID scheme is already the source of ownership per W3.4). A5 alerting remains reserved for **foreign** positions (non-overshoot CIDs). Deliverable: reconciliation loop clause + test coverage.
- **H2 (CANDIDATE-v)** — ALERTING. Operator notifications for: run failures (any 5xx or unhandled throw from overshoot-* handlers); reconciliation refusals (position_already_open, foreign-position identity break, split/dividend detection); identity breaks (broker positions vs lots delta > 0 outside expected windows); SI staleness (max as_of > `DETECTOR_SI_STALENESS_MAX_DAYS = 20`). Proposal: mechanism selection (email vs push vs both) with repo evidence — grep existing platform notification surfaces before proposing net-new infrastructure.
- **H3** — kill-switch row seeded + trip-proven. Seed `public.kill_switches` overshoot entry, exercise it in a test (blocks entry-run + exit-run submissions), and add a one-line kill SQL atop the FP-069 §9 runbook: `UPDATE public.kill_switches SET tripped=true WHERE id='overshoot';`.
- **H4** — nightly independent reconciliation job (own disarmed cron, e.g. `sql/34_…`). Compares `overshoot_lots` (status=open) × broker positions × equity snapshot; emits `verify_lots_vs_broker` + `verify_lots_vs_equity` audit rows. Own registry entry (`overshoot.reconciliation.nightly`), own cron, `enabled=false` at seed.
- **H5 (CANDIDATE-iii)** — equity snapshots. Daily broker-truth equity rows into `overshoot_equity_snapshots`. Feeds the Overview gain cards (currently pending-empty per W4.g) and the W5 windowed P&L. This is the honest counterpart to console-driven price fetches (still forbidden).
- **H6** — RETIRED (promoted into H0 above; the pre-existing H6 slot is the exit-loop isolation fix; recorded here for cross-reference discipline).

### H-SEC — Security-posture P0 items (ACT-469 landed the corrective; these are the residuals)

ACT-469 (2026-07-05) applied the RLS permissive-policy tightening (DROP the
`overshoot_audit_logs` forgery vector; DROP the two engine-only permissive
SELECT policies on `corporate_actions`/`feature_flags`; REPLACE the
`kill_switches` read with a scoped policy per operator ruling Q1(a); DROP 20
functionless service-role no-op policies). The residual security-posture items
below are **operator out-of-band actions** (Supabase Dashboard, not Lovable)
plus one follow-up sweep:

- **H-SEC-1 (operator)** — **signups disabled.** Authentication → Providers →
  Email → confirm "Allow new users to sign up" is **OFF** (single-operator
  project, invitation-only per DEC-030 spirit). Paste-back: screenshot or
  Dashboard URL + timestamp into ACT-469 follow-up.
- **H-SEC-2 (operator)** — **leaked-password protection enabled.**
  Authentication → Providers → Email → confirm "Prevent use of leaked passwords
  (HaveIBeenPwned)" is **ON**.
- **H-SEC-3 (operator)** — **MFA enrolled.** Authentication → Users → confirm
  the operator's row shows an MFA factor present. If absent, enroll before
  Phase ARM opens.
- **H-SEC-4 (Lovable follow-up)** — **linter output paste-back sweep.** After
  H-SEC-1..3 confirmed, paste current Supabase linter output verbatim into a
  follow-up ACT for the SECURITY DEFINER WARN triage (post-ACT-469 the linter
  reports 13 findings, all pre-existing: 1× `RLS Enabled No Policy` INFO, 11× +
  1× `Signed-In Users Can Execute SECURITY DEFINER Function` WARN — the RBAC
  helpers and kill-switch/config RPCs are DESIGNED callable-by-signed-in
  contract; triage will separate designed-callable from over-exposed).
- **H-SEC-5 (Lovable + operator, ACT-475)** — **MCP surface ratification and
  standing invariant.** The `supabase/functions/mcp` edge function (bundled
  from `src/lib/mcp/{index,tools/app-info,tools/echo}.ts` by the
  `@lovable.dev/mcp-js@0.20.0` Vite plugin, deployed and reachable
  unauthenticated at `https://sftatlxatbdrotivxcip.supabase.co/functions/v1/mcp`)
  is **ratified READ-ONLY forever**: no write / mutation / order-touching /
  RBAC-touching / secret-touching tool may be added under any future prompt.
  Current surface = exactly two tools: `app_info` (static non-sensitive
  name/description JSON) and `echo` (returns caller-supplied text). Auth
  posture (verbatim, this turn): `defineMcp` has no `auth` field
  (`.lovable/mcp/manifest.json` → `"auth":{"type":"none"}`); no
  `functions.mcp.verify_jwt` override in `supabase/config.toml`; the emitted
  function body performs **no** `getClaims` / `checkPermissionOrThrow` /
  bearer verification — handler is
  `Deno.serve(createSupabaseHandler(mcp_default, { functionName: "mcp" }))`.
  Live probe this turn: unauthenticated `POST tools/list` → `HTTP 200` +
  full tool list SSE. **Operator waiver required** to hold this public-auth
  posture past ratification: the MCP client-connect flow (ChatGPT / Claude
  / Cursor / Codex) requires the surface be reachable without app auth to
  discover tools; the tradeoff is that `app_info` name/description is
  world-readable and `echo` is a public reflector. Both are non-sensitive
  by construction — the read-only-forever invariant is what makes this
  waiver bounded. **Alternative (surface as choice, do not decide):** add
  Supabase OAuth 2.1 (RFC 8414 resource-server flow per the
  `app-mcp-server-authoring` knowledge) — every client re-authenticates as
  a real user, tools receive a per-user token; cost is the OAuth server
  provisioning + consent-route build + every future tool becomes
  RBAC-scoped. Operator ruling recorded here before any tool beyond the
  two current ones is added.
  - **Operator + supervisor ruling (ACT-475 closure, verbatim):** option
    **(a) `auth: none` is ACCEPTED** for the CURRENT surface only, because
    that surface is frozen at exactly `app_info` + `echo` (non-sensitive
    by construction) and public reachability keeps the operator's MCP
    connector working. **HARD CONDITION (STANDING INVARIANT, additive to
    the READ-ONLY-forever contract):** any tool beyond these two requires
    OAuth 2.1 adoption FIRST (per the `app-mcp-server-authoring` KB path),
    PLUS its own FP + operator ratification + `function-index.md` row +
    H-SEC-5 amendment — **no exceptions, no "just one read-only query
    tool" incrementalism; RBAC without caller identity is unsound.** The
    five supervisor-verification tools proposed in ACT-475 are REGISTERED
    as **FP-CANDIDATE-vi** (supervisor MCP verification channel,
    OAuth-prerequisite) and SEQUENCED after the critical month — they are
    a verification-convenience upgrade, not a money-path item; the proven
    paste-based §22.5.1 channel continues meanwhile.

**Entry criteria:** ACT-469 landed (met). **Exit criteria:** H-SEC-1..4 all
confirmed with evidence paste-back before Phase ARM opens.

**Entry criteria:** NOW phase banked (≥1 first-light detection + entry + exit fill).
**Exit criteria:** H0-H5 green (each with test + evidence bundle); ACT-468 closure.

---

## PHASE ARM — Arming Gate (~week 2, DEC-043-analog)

**Owner:** operator (Dashboard SQL execution + registry flips); Lovable (runbook drafting); supervisor (attestation review).
**Objective:** flip the disarmed engine to unattended paper, one cron at a time,
with first-fire attestation at each flip.

**Scope (verbatim):**
- Runbook document (§9 Part 3 or dedicated `docs/04-modules/overshoot/arming-gate.md`).
- Execute `sql/30` (SI cron), `sql/31` (detection cron), `sql/32` (exit-run cron), `sql/33` (entry-run cron slot-a + slot-b) — operator, Supabase Dashboard SQL Editor.
- Registry rows flipped **one at a time** with per-flip attestation and first-cron-fire verification (cron.job row visible + audit-row-on-fire).
- Unattended paper begins only after the last flip attests.

**Entry criteria:** all H0-H5 green; ACT-468 closed; kill switch trip-proven.
**Exit criteria:** all four crons live + first-fire audit rows banked; ACT-469 attestation.

---

## PHASE P — Unattended Paper Accumulation (weeks 2-6)

**Owner:** operator (weekly evidence review); Lovable (W5 instrumentation build).
**Objective:** compound the data asset. Overshoot fires ~1-2 entries/day; a month
of paper ≈ 20-40 round-trips (the minimum honest sample for the L-phase gate).

**Scope:**
- Weekly evidence reviews: accounting identities (targets = orders + Σ refusals + no-ops; broker positions = Σ overshoot_lots by (symbol, side)); refusal distribution (which typed refusals dominate, what does the distribution imply); fill quality (slippage vs modeled caps).
- **W5 instrumentation** (implementation lands during this phase):
  - **First**, per the standing ROI directive: per-fill overnight-gap attribution (entry fill price → next-open bar vs subsequent path; the honest overnight-vs-intraday split).
  - Slippage vs caps (per-fill realized slippage against `constructExitLimitPrice` / entry-side caps).
  - I5 opportunity-cost measurement (targets refused at gate — what would they have returned?).
  - Capacity-refusal tracking (refusals attributable to gross exposure / margin ceiling).
- **SHADOW-EXPANSION build (CANDIDATE-i)** — re-sequenced per operator: build HERE, not at W5 read-out. Prospective data cannot be backfilled; the shadow ranker must run alongside live from arming day forward to accumulate the comparison sample.

**Entry criteria:** ARM gate passed.
**Exit criteria:** ≥20 completed round-trips (feeds L-phase gate); W5 dashboards render real data; ≥4 clean weekly reviews.

---

## PHASE L — Live-Readiness Review → Small Live (weeks 5-8, **evidence-gated not calendar-gated**)

**Owner:** operator (sign-off); supervisor (evidence adjudication); Lovable (dial-down implementation).
**Objective:** small real-money deployment gated on measured paper evidence.

**Gate criteria (written NOW, not later — all must be true):**
1. **≥20 completed round-trips** (entry fill → exit fill both banked; partial fills counted per-lot).
2. **Accounting identities unbroken** across the full window (zero reconciliation refusals unexplained).
3. **Realized slippage within modeled haircuts** (per-fill median + p95 within `constructExitLimitPrice` caps + entry-side model).
4. **Zero unresolved reconciliation refusals** (H2 alerts either fired-and-resolved or never fired).
5. **Alerting proven by at least one real notification** (H2 not just deployed — actually rung a bell that reached the operator).
6. **Operator sign-off** (explicit, in-writing, referencing this document).

**Pre-live decision items (must resolve BEFORE first live dollar):**
- **CANDIDATE-iv (wash-sale)** — account structure decision: does overshoot re-entry need a lightweight interlock before the W8 wash-sale ledger lands? Operator ruling required.
- **Real-money sizing dial-down proposal** — the paper allocation × sizing rules do not port 1:1 to live; propose an explicit haircut (e.g. 25% of paper notional for first two weeks, 50% for weeks 3-4, 100% conditional on continued gate-green).
- **IBKR sequencing note** — post-viability only (Alpaca paper → Alpaca live small → IBKR migration is a separate charter, not this phase).

**Live sample honesty:** live at week 5-6 if and only if the gates pass. Slippage
by a single criterion = no live. This is not a schedule; it is a gate.

**Entry criteria:** all six gate criteria evidenced.
**Exit criteria:** small-live deployed; first live fill audited; first live weekly review.

---

## REGISTERED-FUTURE (evidence-gated, sequenced — do NOT build ahead of gate)

| Item | Gate | Notes |
| --- | --- | --- |
| Capacity 20 → 40 expansion | W5 capacity-refusal evidence + performance evidence | operator ceiling pre-authorized; expansion is an ACT + FP-status flip, not a re-adjudication. |
| Pyramiding policy | Measurement of `position_already_open` refusal value (are we refusing profitable adds?) | requires ≥N refusals with follow-through data to adjudicate. |
| FINRA-SI ingestion (CANDIDATE-ii) | Post-L-phase gate green | own charter; augments T2 SI source. |
| Reconciliation console page (promoted from Portfolio tab) | Post-H2 (A5 alerting matures) | R-4(b) census entry from W4.f. |
| Study explorer page (R-4(c)) | When study results have operator consumers | UI atop `overshoot_study_runs` + `overshoot_study_cell_results`. |
| Intraday variant | Own study required (separate charter) | not a delta from the daily variant; a new strategy. |
| Stop-loss / take-profit revisit | W5 max-adverse-excursion analysis | current design is fixed T+5 exit; any deviation requires MAE evidence. |

---

## Cross-References

- Runbook: `docs/04-modules/overshoot/overshoot.md` §9 Parts 1-2 (first-light), §10 (W4 completion), §11 (position_already_open gate).
- FP-069 status ledger: `docs/08-planning/feature-proposals.md` (W4 CLOSED clause + CANDIDATE-i…v).
- Action tracker anchors: ACT-465.a…h (W4 tranches); ACT-466 (entry-gate corrective); ACT-467 (this roadmap); ACT-468 (Hardening charter, opens when NOW banks); ACT-469 (Arming attestation).
- Master plan: `docs/08-planning/master-plan.md` PLAN-TRADING-001 section (FP-069 sits under trading-panel; W4 closure recorded in that section).
- Standing directives: anti-phantom-defaults; live-price source contract (Polygon-only); never-silent-drop; one-prompt-in-flight; data-write bracket discipline.

**Part-2 EXEC (Monday evening Session 1) outranks everything the moment operator evidence lands.**
