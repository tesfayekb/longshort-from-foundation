# FIX-2 Spec — In-Run Snapshot Retry (verbatim operator-supplied spec, codified 2026-07-23)

**Status:** ACTIVE — spec codified this turn, build fires same turn. Spec is the pre-build artifact required by the INC-135-family class rule ("behavioural specs for money-path fixes commit BEFORE the build turn").

**Provenance.** Operator-supplied verbatim during the 2026-07-23 GO turn ("FIX-2 SPEC SUPPLIED VERBATIM (locked earlier this session)"). No AI paraphrase — the text below is a faithful restatement of the operator's message with structural formatting for build reference.

## Behavior

**FIX-2 = IN-RUN SNAPSHOT RETRY, both legs.**

At the **shared snapshot-fetch seam** (the fetcher consumed by `entry-price-construction`, `exit-price-construction`, and `i5-recheck` — **wire ONCE at the seam, not per callsite**):

1. When a fetched snapshot **fails the freshness predicate**, refetch **ONCE** after `backoff_ms = 1500` **within the same run** (`attempts = 2` hard cap, **per lot**).
2. Emit the typed **`polygon_snapshot_stale`** refusal **ONLY if BOTH attempts fail freshness**.
3. Increment a **`retry_recovered`** counter, surfaced in run metadata (so FIX-6-class analyses can price the fix).
4. Raw signed **`snapshotAgeMs`** from the **FINAL attempt** is preserved on the envelope.

## Non-Behavior (explicit)

- **NOT** a refusal-class demotion.
- **NOT** a window override.
- **NOT** an age bypass.
- The **freshness predicate itself is untouched** (FIX-1's clamp stands as-is — `Math.max(OVERSHOOT_SNAPSHOT_MIN_AGE_MS, rawAgeMs) ≤ OVERSHOOT_SNAPSHOT_MAX_AGE_MS`; negative raw ages clamp fresh).

## Motivation

VICR-class genuine transients (**+15.5s** snapshot skew observed in `FIX-2-NOTE-01`) that strand lots past horizon: measured at **−900 bps of −1467 bps** of the VICR loss. Retry-once catches the transient without loosening the predicate for the true-stale case.

## Build

### Files

- `supabase/functions/_shared/overshoot-execution/snapshot-retry.ts` — pure wrapper. Injected fetcher (test seam), injected `asOf` Date, injected `sleep`. Returns `{ snapshot, attempts, retryRecovered, finalAgeMs }`.
- `supabase/functions/_shared/overshoot-execution/snapshot-retry_test.ts` — 4 named cases:
  1. **first-success** — attempt-1 fresh; no retry; `attempts=1, retryRecovered=false`.
  2. **retry-success + counter** — attempt-1 stale, attempt-2 fresh; `attempts=2, retryRecovered=true`; final age is attempt-2's age.
  3. **both-fail-typed** — attempt-1 stale, attempt-2 also stale; wrapper returns attempt-2 snapshot; downstream price-construction emits `polygon_snapshot_stale`; `attempts=2, retryRecovered=false`.
  4. **unrelated-throw-not-retried** — fetcher throws; wrapper re-throws; NO retry; NO counter increment.

### SOURCE_VERSION rail bump

`fb5fdf13+fix1` → **`fb5fdf13+fix2`** in the four rail functions (**CONFIRMED**):

- `overshoot-entry-run`
- `overshoot-exit-run`
- `overshoot-detection-run`
- `overshoot-fill-sweep`

`alerts-dispatcher` stays **OFF** the rail per prior ruling. `overshoot-minute-ingest` also stays at `+fix1` (not on the rail).

### Money-path wiring (per lot loop)

`overshoot-entry-run` (`index.ts` L931 site — the "reused for I5 + entry-price" fetch) and `overshoot-exit-run` (`index.ts` L929 site) replace the direct `fetchPolygonSnapshot(...)` call with:

```ts
const retry = await fetchPolygonSnapshotWithRetry({
  fetcher: () => fetchPolygonSnapshot(env.polygonKey, symbol),
  asOf: nowTs,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
});
const snap = retry.snapshot;
if (retry.retryRecovered) tally.snapshot_retry_recovered += 1;
```

Detection-run and fill-sweep do **NOT** fetch Polygon snapshots in a per-lot money loop — they get the `+fix2` bump for **rail parity only** (uniform `x-source-version` deploy-freshness) and are not wired to the retry wrapper.

### Drift-guard re-pins

`overshoot-entry-run/index_test.ts`, `overshoot-exit-run/index_test.ts`, `overshoot-detection-run/index_test.ts` — bump the pinned string from `fb5fdf13+fix1` to `fb5fdf13+fix2` and update the `// FIX-3 (ACT-565)` narrative comment to reference `FIX-2`. `overshoot-fill-sweep` has no such drift-guard test today; the bump lands in prod-only.

### Deploy + probe verify

- Deploy all 4 rail functions.
- Probe via `OPTIONS` (or `POST {probe:'version'}`) each — verify `x-source-version=fb5fdf13+fix2` **BEFORE** declaring done.
- **Hard deadline:** 2026-07-24 **13:30Z** (protects the 13:35Z entry cron AND the 13:45Z DEC-083 maiden morning-exits).

## Cross-refs

- **FIX-1** — negative-age clamp; untouched.
- **FIX-2-NOTE-01** — VICR incident narrative (−900 bps of −1467 bps).
- **FIX-3 (ACT-565)** — SOURCE_VERSION rail introduction; FIX-2 is a rail-bump instance of the FIX-3 discipline.
- **INC-135** — commit-before-execute discipline for money-path artifacts; FIX-2 footnote extends this class from sampling SQL to behavioural specs. See same-turn footnote appended in `docs/06-tracking/incidental-findings.md`.
- **DEC-083 §(a)** — 13:45Z morning-exits maiden fire; FIX-2 is now protective of that path.