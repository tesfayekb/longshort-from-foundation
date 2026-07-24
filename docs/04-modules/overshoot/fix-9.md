# FIX-9 — Pass-Scoped `run_already_exists` Idempotency Gate

**Status:** ARMED 2026-07-24 (this turn, per operator GO on "TWO GOs").
**Owner:** overshoot / entry-run.
**Prior art:** FIX-8 (`docs/04-modules/overshoot/fix-8.md`) — DEC-083 §c
completion-pass semantics. FIX-9 closes the last blocking bug that
prevented the completion pass from ever reaching its pre-loop filter.
**Root-cause receipt:** `docs/06-tracking/2026-07-24-midday-deviations.md`
§RULINGS(b) — clone-confirmed against `index.ts:612–629` pass-blind gate.

## 1. Problem statement

`overshoot-entry-run/index.ts` L608–629 implements the DUAL-SLOT DST
`run_already_exists` idempotency gate. Before FIX-9 the SQL predicate
was:

```sql
SELECT id FROM overshoot_audit_logs
 WHERE action = 'overshoot.entry.session_marker'
   AND metadata->>'session_date' = <sessionDate>
```

The gate was authored for slot-a/slot-b DST collapse and predates FIX-8's
`pass ∈ {'primary','completion'}` re-invocation surface. Because it
ignores `pass`, the primary-run session_marker (written L853–865 with
`pass='primary'`) short-circuits every subsequent completion invocation
with `outcome:'no_op', reason:'run_already_exists'` — BEFORE the L959
FIX-8 pre-loop filter runs. Empirical confirmation: `net._http_response`
id=460005, 2026-07-24 14:05:02Z (maiden completion).

## 2. Fix — pass-scoped gate (both directions)

The gate becomes pass-scoped so:

- **Primary re-fire is still blocked by prior primary** (DST slot-a→slot-b
  semantics preserved).
- **Completion sees only completion markers** — it proceeds past primary's
  marker AND cannot double-fire itself.
- **Legacy markers (written before FIX-9, no `pass` key) are treated as
  `'primary'`** so history does not false-block a completion fire.

Predicate:

```sql
SELECT id FROM overshoot_audit_logs
 WHERE action = 'overshoot.entry.session_marker'
   AND metadata->>'session_date' = <sessionDate>
   AND COALESCE(metadata->>'pass', 'primary') = <passLabel>
```

`manual_confirm=true` remains exempt from the gate (operator-deliberate
re-fire, unchanged).

## 3. Session-marker write site

No change. L853–865 already stamps `pass: passLabel` on every marker
(verified L863). FIX-9 depends on this; a paired grep-guard in the test
file asserts the marker write carries the `pass` key so a future refactor
cannot silently drop it.

## 4. SOURCE_VERSION bump

`fb5fdf13+fix2+fix8+sp1` → `fb5fdf13+fix2+fix8+sp1+fix9`. Rail-only bump
(no `RATIFIED_DETECTOR_VERSION`/predicate-spec impact, per INC-126
two-rail discipline). Probe echo (`OPTIONS` `x-source-version` and
`POST {"probe":"version"}`) verified post-deploy.

## 5. Test matrix

All five in `overshoot-entry-run/index_test.ts`:

1. **primary-reblocks-primary** — primary marker present → primary invoke
   returns `no_op/run_already_exists`. (DST slot-b intact.)
2. **completion-passes-primary-marker** — primary marker present,
   completion invoke proceeds past the gate (reaches FIX-8 filter).
3. **completion-blocks-second-completion** — completion marker present,
   second completion invoke returns `no_op/run_already_exists`.
4. **legacy-null-marker=primary** — marker row without `pass` key present,
   primary invoke returns `no_op` (COALESCE default), completion invoke
   proceeds.
5. **manual-confirm-exempt** — with any marker present, `manual_confirm:
   true` bypasses the gate unchanged.

Plus a grep-guard: session_marker write includes `pass: passLabel` in
metadata.

## 6. Rollback

Revert the two-line SQL predicate change and the SOURCE_VERSION suffix.
No data migration; no marker rewrite. Legacy null-pass markers are safe
under both old and new code (old code ignores `pass`; new code
COALESCEs to `'primary'`).

## 7. Monday 14:05Z scheduled fire

With FIX-9 live, jobid=135's Monday 07-27 14:05Z fire becomes routine:
the primary marker no longer blocks the completion invocation; the
FIX-8 pre-loop filter runs and either admits K-remaining names or
emits a clean `pass='completion'` heartbeat.