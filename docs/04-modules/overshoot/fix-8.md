# FIX-8 — Completion-Pass Re-Invocation of `overshoot-entry-run`

**Status:** ACTIVE (build+arm 2026-07-23, maiden 2026-07-24 14:05Z per DEC-083 §c).
**Authority:** DEC-083 §(c) (Morning-Exit Adoption redeploy half); operator ruling
2026-07-23 (FLAG-A/B/C/D/E micro-rulings — codified verbatim below).
**Companion:** `docs/08-planning/FIX-2-spec.md` (rail predecessor).
**Provenance failure captured:** INC-136 family — this spec was chat-only for one turn;
committed BEFORE the build turn per operator rule "behavioral specs for money-path
fixes commit BEFORE the build turn". Supervisor co-file: the initial FLAG-C list
contained `overshoot.entry.exclusion_earnings_proximity` without grep-anchoring; the
spec's own §(3) verification rule caught it (FLAG-E) — discipline symmetric across
agents.

---

## 1. Architecture

FIX-8 is a **PARAM-DRIVEN re-invocation** of the existing `overshoot-entry-run` edge
function — NOT a new function. The handler body gains one field:

```
body.pass?: 'primary' | 'completion'
```

- **Absent** → treated as `'primary'` (backward-compatible; all pre-FIX-8 callers).
- **Any other value** → 400 `pass_invalid_expected_primary_or_completion`.
  Extend the probe-taxonomy test with this case.
- Reuses **every** gate, rail, probe, boot-assertion, drift-canary, session-marker
  idempotency, kill-switch, and job-disarmed check. The completion pass is a
  behaviorally-identical run with three additional pre-loop filters and one budget
  substitution.

**No new function; no new handler envelope; no new audit table.** Every completion-pass
audit row is written to `overshoot_audit_logs` via `writeStrategyAuditEvent` (T4).

---

## 2. Contract (six locked points, verbatim intent)

### (1) SAME detection-run SoT

Completion pass loads the SAME session's `detection_run_id` via the existing
`detection-linkage` module. NO re-ranking, NO new candidates. The pass-2 target set is
the identical `selections` array (same SQL, same `ORDER BY e.side, e.rank_score DESC
NULLS LAST, e.ticker`) that pass-1 loaded. Any target pass-1 never reached (budget
truncation) is eligible for pass-2 re-evaluation; any target pass-1 admitted or
terminally refused is filtered out (§4).

### (2) BUDGET — ledger truth via `computeRemainingBudget`

Lives at `supabase/functions/_shared/overshoot-execution/daily-budget.ts` as a PURE
helper:

```ts
export interface RemainingBudgetInputs {
  budget: number;               // K, cited from OVERSHOOT_DAILY_ENTRY_BUDGET
  priorAdmittedCount: number;   // COUNT(*) FROM overshoot_lots WHERE entry_ts::date = sessionDate
}
export function computeRemainingBudget(input: RemainingBudgetInputs): number;
```

K is cited from `_shared/overshoot-execution/daily-budget.ts:36`
(`OVERSHOOT_DAILY_ENTRY_BUDGET = 5`) — the single-homed constant; NOT redeclared.

`priorAdmittedCount` is derived by the handler from `overshoot_lots` (ledger truth —
automatically counts pass-1 admits AND any AM activity). Cash sufficiency stays with
the existing sizing/buying-power path per DEC-083 §c; **no cash math here**.

`K_remaining = max(0, K − priorAdmittedCount)`. On `K_remaining === 0`, the completion
pass returns a clean heartbeat `outcome:'no_op', reason:'budget_exhausted_pre_loop'`
with the standard response envelope; NO Alpaca/Polygon vendor calls beyond boot.

### (3) TRANSIENT allow-set (FLAG-A/B — replacement per operator ruling)

```ts
// Match against literal refusal-class strings entry-run actually emits.
// Pattern rule (codified): alpaca_api_5xx + 429 + network = transient.
//                          alpaca_api_4xx (except 429) + alpaca_credential_missing = TERMINAL.
// polygon_fetch_error DROPPED entirely (zero emit-sites; if a distinct
// fetch-throw class emerges later it gets its own emitter + row, not a
// phantom string).
export const OVERSHOOT_COMPLETION_TRANSIENT_ALLOW = [
  'polygon_snapshot_stale',
  'polygon_snapshot_unavailable',
  'alpaca_api_500',
  'alpaca_api_502',
  'alpaca_api_503',
  'alpaca_api_504',
  'alpaca_api_429',
  'alpaca_network_error',
] as const;
```

**Grep-verification (each member has an emit-site, per §(3) verification rule):**

| Class literal | Emit-site |
|---|---|
| `polygon_snapshot_stale`, `polygon_snapshot_unavailable` | `_shared/overshoot-execution/snapshot-retry.ts` (FIX-2 typed refusal on both-attempts-fail) |
| `alpaca_api_500..504`, `alpaca_api_429` | `overshoot-entry-run/index.ts:1267` (`reason = alpaca_api_${err.status}`) |
| `alpaca_network_error` | `overshoot-entry-run/index.ts:1268` |

Any string with zero emit-sites is FLAGGED, not silently kept. `polygon_fetch_error`
dropped for this reason; `alpaca_submit_transient_5xx` (previously planned) replaced
by the explicit-status literals `alpaca_api_500..504` + `alpaca_api_429` + explicit
`alpaca_network_error`.

### (4) TERMINAL_ACTIONS (FLAG-C Option-2 — skip only on terminal-match)

Full-action-string set. Polarity: pass-2 skips a symbol iff any prior pass-1 refusal
for that symbol matches this set.

```ts
export const OVERSHOOT_COMPLETION_TERMINAL_ACTIONS = [
  'overshoot.entry.i5_refusal.i5_reversion_exceeded',
  'overshoot.entry.allocation_cap_reached',
  'overshoot.entry.position_already_open',
  'overshoot.entry.shortability_refusal.not_shortable',
] as const;

// Two-field match: action + metadata.reason. Applies to exactly this action;
// everything else is pure action-string.
export const OVERSHOOT_COMPLETION_TERMINAL_SUBMIT_FAILED_REASONS = [
  'alpaca_credential_missing',
  // alpaca_api_4XX non-transient — matched by predicate:
  //   /^alpaca_api_4\d\d$/ && status !== '429'
] as const;
```

**Grep-verification of each FULL action string (per FLAG-C ruling, applied symmetrically
to FLAG-A/B — the discipline that caught FLAG-E):**

| Action | Emit-site | Verified |
|---|---|---|
| `overshoot.entry.i5_refusal.i5_reversion_exceeded` | `overshoot-entry-run/index.ts:994` (dynamic `.${i5.refusal}` suffix; `i5_reversion_exceeded` is a valid I5 refusal per `i5-recheck.ts`) | ✅ |
| `overshoot.entry.allocation_cap_reached` | `overshoot-entry-run/index.ts:1042` | ✅ |
| `overshoot.entry.position_already_open` | `overshoot-entry-run/index.ts:925` | ✅ |
| `overshoot.entry.shortability_refusal.not_shortable` | `overshoot-entry-run/index.ts:1125` | ✅ |
| `overshoot.entry.submit_failed` + `metadata.reason='alpaca_credential_missing'` | `overshoot-entry-run/index.ts:1269, 1274` (two-field match) | ✅ |
| `overshoot.entry.submit_failed` + `metadata.reason` matches `/^alpaca_api_4\d\d$/ && !== '429'` | `overshoot-entry-run/index.ts:1267, 1274` (predicate, not literal) | ✅ |

#### FLAG-E resolution — layer-boundary note (verbatim, per operator ruling)

> **Detector-layer exclusions are pre-filtered from `selections`; entry-run
> `TERMINAL_ACTIONS` enumerates only entry-run-emitted refusals.**

`overshoot.entry.exclusion_earnings_proximity` was DROPPED from `TERMINAL_ACTIONS`
because it has zero emit-sites in `supabase/functions/overshoot-entry-run/`. The
earnings-proximity filter fires at the detector layer
(`_shared/overshoot/detector/detector.ts:867`) with class `exclusion_earnings_proximity`
and never writes an entry-run audit row. Earnings-proximate candidates therefore never
appear in `selections`, so pass-1 and pass-2 inherit the exclusion automatically without
a phantom terminal string.

#### FLAG-D confirmation — `daily_budget_reached` is NOT terminal

`overshoot.entry.daily_budget_reached` (emitted at
`supabase/functions/overshoot-entry-run/index.ts:1080-1092`) is **NOT** in
`TERMINAL_ACTIONS`. It is the **primary re-eval trigger**: a candidate that pass-1
refused with `daily_budget_reached` is exactly the case pass-2 exists to serve. Adding
it to the terminal set would defeat FIX-8. Codified with citation:

```
overshoot-entry-run/index.ts:1080  action: 'overshoot.entry.daily_budget_reached',
overshoot-entry-run/index.ts:1092  continue;
```

#### Unknown-action default rule

Any entry-run refusal action NOT in `TERMINAL_ACTIONS` (and not the two-field
`submit_failed` terminal match) defaults to **NON-terminal** (re-eligible). This
includes but is not limited to: `daily_budget_reached`, `reference_bar_missing`,
`sizing_refusal.*`, `buying_power_refusal.*`, `price_refusal.*`, `submit_failed` with
transient/unknown reasons, `regime_indeterminate`, and any future non-terminal refusal
class that lands without touching this file. **Rationale:** conservative — assume
re-eligibility unless evidence of terminality; the double-count guard (§4) is the hard
backstop.

#### TERMINAL-SKIP pre-loop lookup

Before the per-candidate loop in pass-2, the handler queries:

```sql
SELECT action, metadata->>'reason' AS reason, target_id AS ticker
FROM overshoot_audit_logs
WHERE action LIKE 'overshoot.entry.%'
  AND (metadata->>'session_date') = <sessionDate>
  AND (metadata->>'pass') IS DISTINCT FROM 'completion'  -- pass-1 rows only
```

For each `sel.ticker` in `selections`, classify prior refusal rows via the pure
`classifyPass1Refusal(action, reason)` helper (see §5). If ANY row is terminal → emit
typed skip `pass2_terminal_class_refused_in_pass1` and continue (i5_reversion case
especially: market-moved stays refused even if it would now pass — the alpha window
moved).

### (5) AUDIT — pass stamp

Every pass-2 audit row carries `metadata.pass = 'completion'`. Pass-1 stamps
`metadata.pass = 'primary'` (default stamp added in the same diff). The pass label is
attached to:

- Every per-target refusal audit inside the loop.
- The `overshoot.entry.session_marker` audit.
- The `overshoot.entry.submitted.*` audit on successful submissions.
- The `overshoot.entry.submit_failed` audit on submission failure.
- The `overshoot.entry.run` run-envelope audit (via response `pass` field, mirrored
  into the outer wrapper's metadata).

### (6) CONFIG-NOT-CONSTANT

`system_config` row `key = 'overshoot_completion_pass_minutes'`, `value = '[65]'` (JSON
array). Seeded in the same transaction as the sql/42 cron + registry row. The `[65]`
list is the minute-offset(s) from primary entry (13:30Z) at which completion passes
fire — currently a single 14:35Z offset (13:30 + 65 = 14:35 UTC). **The 14:05Z cron
in sql/42 is the maiden slot per DEC-083 §c** (35 min after 13:30Z primary entries,
20 min after 13:45Z morning exits — waits for morning-exit fills to clear).

Wait — DEC-083 §c specifies **14:05Z**, not 14:35Z. Reconcile: the config seed above
is a forward-looking ACT-509-grid extension surface (ACT-509 Stage-2 minute grid may
extend later without code). The **cron schedule is authoritative today**: `5 14 * * 1-5`
= 14:05 UTC = 09:05 ET (redeploy window per DEC-083 §c). The system_config row is
seeded as `'[35]'` (35 min after 13:30Z primary — matching sql/42) so the
config-vs-cron audit is byte-consistent; ACT-509 grid extensions later.

---

## 3. Rail (SOURCE_VERSION bump)

Entry-run only (behavior changed):

```
SOURCE_VERSION: 'fb5fdf13+fix2' → 'fb5fdf13+fix2+fix8'
```

The other three rails stay `+fix2` (unchanged — per-function constants, no cross-file
coupling). Re-pin the drift-guard test that asserts entry-run's SOURCE_VERSION. Deploy
entry-run. Probe-verify the new echo via OPTIONS + `x-source-version` header AND
`{probe:'version'}` short-circuit.

---

## 4. Handler pipeline (pass='completion' delta)

Insertion point: **after** `selections` load (line ~789), **before** the per-target
loop (line ~881).

```
if (pass === 'completion') {
  // (a) LEDGER truth — count today's admits (pass-1 + any AM activity).
  const [{ count: priorAdmittedCount }] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM overshoot_lots
    WHERE entry_ts::date = ${sessionDate}::date
  `;
  const kRemaining = computeRemainingBudget({
    budget: OVERSHOOT_DAILY_ENTRY_BUDGET,
    priorAdmittedCount,
  });
  if (kRemaining === 0) return apiSuccess({
    outcome: 'no_op', reason: 'budget_exhausted_pre_loop',
    pass, session_date: sessionDate, prior_admitted_count: priorAdmittedCount,
    budget: OVERSHOOT_DAILY_ENTRY_BUDGET, k_remaining: 0,
    targets_loaded: selections.length, orders_submitted: 0,
    correlation_id: correlationId,
  });

  // (b) Prior-admitted symbol set (double-count guard #1).
  const priorAdmittedSymbols = new Set<string>(
    (await sql<{ symbol: string }[]>`
      SELECT DISTINCT symbol FROM overshoot_lots
      WHERE entry_ts::date = ${sessionDate}::date
    `).map((r) => r.symbol)
  );

  // (c) Prior pass-1 refusals — classify per (ticker × action × reason).
  const priorRefusals = await sql<{
    ticker: string; action: string; reason: string | null;
  }[]>`
    SELECT target_id AS ticker, action, metadata->>'reason' AS reason
    FROM overshoot_audit_logs
    WHERE action LIKE 'overshoot.entry.%'
      AND (metadata->>'session_date') = ${sessionDate}
      AND (metadata->>'pass') IS DISTINCT FROM 'completion'
  `;
  const terminallyRefusedSymbols = new Set<string>();
  for (const r of priorRefusals) {
    if (classifyPass1Refusal(r.action, r.reason) === 'terminal') {
      terminallyRefusedSymbols.add(r.ticker);
    }
  }

  // (d) Filter `selections` in place. Emit typed skip audits for each drop.
  const kept: SelectionRow[] = [];
  for (const sel of selections) {
    if (priorAdmittedSymbols.has(sel.ticker)) {
      await writeStrategyAuditEvent({ ..., action: 'overshoot.entry.pass2_already_admitted_in_pass1', metadata: { ..., pass: 'completion' } });
      continue;
    }
    if (terminallyRefusedSymbols.has(sel.ticker)) {
      await writeStrategyAuditEvent({ ..., action: 'overshoot.entry.pass2_terminal_class_refused_in_pass1', metadata: { ..., pass: 'completion' } });
      continue;
    }
    kept.push(sel);
  }
  selections = kept;

  // (e) Substitute budget cap for the loop.
  effectiveBudget = kRemaining;
} else {
  effectiveBudget = OVERSHOOT_DAILY_ENTRY_BUDGET;
}
```

Downstream loop: replace the literal `OVERSHOOT_DAILY_ENTRY_BUDGET` inside the
`evaluateDailyBudget` call with `effectiveBudget`. **Rank-order preserved** (kept
preserves `selections` order).

**Double-count guard #2 (safety-net inside the loop, unchanged from ACT-466):** the
existing `heldTickers` check at line 918 already refuses any symbol with an open lot,
regardless of pass. The pre-loop filter is the first line of defence; ACT-466 is the
second.

---

## 5. Modules created

### `supabase/functions/_shared/overshoot-execution/completion-pass-allow-list.ts`

Pure module. Exports:

- `OVERSHOOT_COMPLETION_TRANSIENT_ALLOW: readonly string[]`
- `OVERSHOOT_COMPLETION_TERMINAL_ACTIONS: readonly string[]`
- `OVERSHOOT_COMPLETION_TERMINAL_SUBMIT_FAILED_REASONS: readonly string[]`
- `classifyPass1Refusal(action: string, reason: string | null): 'terminal' | 'transient' | 'non_terminal_default'`

### `supabase/functions/_shared/overshoot-execution/daily-budget.ts` (extension)

Adds `computeRemainingBudget` (pure). Existing `evaluateDailyBudget` unchanged (per-slot
admission gate still consumes `effectiveBudget` — the substituted cap).

---

## 6. Tests (minimum, per spec)

In `completion-pass-allow-list_test.ts`:

1. **Budget-refused-in-pass1 ADMITS in pass-2** (the FLAG-C regression case):
   `classifyPass1Refusal('overshoot.entry.daily_budget_reached', null) === 'non_terminal_default'`.
2. **`alpaca_api_403` terminal-skips**:
   `classifyPass1Refusal('overshoot.entry.submit_failed', 'alpaca_api_403') === 'terminal'`.
3. **Unknown-action defaults non-terminal**:
   `classifyPass1Refusal('overshoot.entry.some_future_class', null) === 'non_terminal_default'`.
4. **`alpaca_api_500` transient** (allow-set positive):
   `classifyPass1Refusal('overshoot.entry.submit_failed', 'alpaca_api_500') === 'transient'`.
5. **`alpaca_api_429` transient** (5xx+429 rule): same shape.
6. **`alpaca_credential_missing` terminal** (two-field):
   `classifyPass1Refusal('overshoot.entry.submit_failed', 'alpaca_credential_missing') === 'terminal'`.
7. **`i5_reversion_exceeded` terminal**:
   `classifyPass1Refusal('overshoot.entry.i5_refusal.i5_reversion_exceeded', null) === 'terminal'`.
8. **`position_already_open` terminal** (double-count belt-and-suspenders).
9. **`polygon_snapshot_stale` transient**.
10. **`allocation_cap_reached` terminal** (alpha exhausted).
11. **Every terminal + transient literal grep-anchored** — the test file re-exports
    the arrays and asserts each entry appears at a real emit-site (regression against
    future phantom-string reintroduction).

In `daily-budget_test.ts` (extension):

12. **K_remaining=0** on `priorAdmittedCount>=K`.
13. **K_remaining=K** on `priorAdmittedCount=0` (primary-skipped-day → pass-2 acts).
14. **K_remaining=K−n** on interior counts.

Handler-integration (folded into `overshoot-entry-run/index_test.ts` via source-sentinel
pattern): the pass-param taxonomy test (accepts 'primary'|'completion'|absent; 400 on
other).

---

## 7. Ops surface

**Cron (sql/42):**

```
jobname:  overshoot-entry-run-completion
schedule: 5 14 * * 1-5    -- 14:05 UTC Mon-Fri
command:  POST /functions/v1/overshoot-entry-run
          body: {"pass":"completion"}
          headers: {X-Cron-Secret: ..., Content-Type: application/json}
status:   ENABLED at seed (safe: budget-exhausted days no-op with clean heartbeat)
```

**job_registry:**

```
id:          overshoot.entry.run.completion
enabled:     true
schedule:    '5 14 * * 1-5'
description: 'DEC-083 §c completion-pass re-invocation of overshoot-entry-run (FIX-8)'
```

**system_config:**

```
key:   overshoot_completion_pass_minutes
value: [35]  -- JSON array; forward-looking ACT-509 grid extension surface
```

**§22.5.1 read-back (mandatory):**

```sql
-- Surface 1: cron.job
SELECT jobid, jobname, schedule, active, md5(command)
FROM cron.job WHERE jobname = 'overshoot-entry-run-completion';

-- Surface 2: job_registry
SELECT id, enabled, schedule, description
FROM job_registry WHERE id = 'overshoot.entry.run.completion';

-- Surface 3: system_config
SELECT key, value FROM system_config
WHERE key = 'overshoot_completion_pass_minutes';

-- Surface 4: probe echo (deploy verification)
curl -X OPTIONS $URL/functions/v1/overshoot-entry-run -i | grep x-source-version
-- Expect: x-source-version: fb5fdf13+fix2+fix8

curl -X POST $URL/functions/v1/overshoot-entry-run \
  -H 'X-Cron-Secret: ...' -H 'Content-Type: application/json' \
  -d '{"probe":"version"}'
-- Expect: SOURCE_VERSION === 'fb5fdf13+fix2+fix8'
```

---

## 8. Non-goals

- **NOT a new detection.** Same `detection_run_id` re-consumed.
- **NOT a new function.** Same handler, new pass param.
- **NOT a new audit table.** All rows to `overshoot_audit_logs`.
- **NOT a new sizing/BP path.** Existing sizing + BP gates unchanged.
- **NOT a new refusal-class emitter.** Every referenced literal has a real emit-site
  (per §(3) grep-verification rule).
- **NOT a bypass of ACT-466.** `position_already_open` remains the hard in-loop guard.
- **NOT a bypass of the alpha window.** `i5_reversion_exceeded` is TERMINAL: a
  market-moved candidate stays refused even if it would now pass.

---

## 9. Rollback

```sql
-- 1. Disarm cron
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname='overshoot-entry-run-completion'),
  active := false
);

-- 2. Disarm registry
UPDATE job_registry SET enabled=false
WHERE id = 'overshoot.entry.run.completion';
```

Rollback is safe at any time — the primary 13:30Z entry cron is untouched and pass-1
behavior is byte-identical to pre-FIX-8 when `body.pass` is absent.

---

## 10. INC-136 family footnote (supervisor discipline)

**INC-136 (originator, 2026-07-23):** FIX-2 behavioral spec was chat-only for one
turn — codified BEFORE the build turn per operator rule.

**INC-136-b (supervisor co-file, 2026-07-23):** FIX-8's initial FLAG-C `TERMINAL_ACTIONS`
list contained `overshoot.entry.exclusion_earnings_proximity` without grep-anchoring.
The spec's own §(3) verification rule ("any string with zero emit-sites is flagged,
not silently kept") caught it via FLAG-E — the discipline is symmetric across agents
(operator, supervisor Claude, Lovable executor). This spec commits BEFORE the build
turn and includes the grep-anchoring evidence inline for every literal.