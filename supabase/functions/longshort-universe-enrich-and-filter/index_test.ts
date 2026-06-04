/**
 * Gate 11 type-check coverage anchor + FP-008.4 #23 source-level sentinel.
 *
 * Purpose (Commit 2.5 / INC-30): force `deno test --no-run` to walk
 * index.ts's dependency graph so its types are checked on every gate run.
 * Without this sibling file, the entry point is invisible to Gate 11
 * (see INC-30 + DW-082).
 *
 * Purpose (FP-008.4 #23): the worker-pool catch-block lives inside
 * `Deno.serve(createHandler(...))` and is not unit-testable as a pure
 * function without standing up a full Deno.serve + supabase-admin + Polygon
 * HTTP harness — out of scope for #23 (logged as INC-48 sub-finding for
 * future broader caller-behavioral-test closure). Use a source-level pin
 * (precedent: Commit 3.5 STREAK_FAILURE_OUTCOMES sentinel) to lock the
 * structural attribution: the catch-block MUST classify thrown errors as
 * `'fetch_error'` and persist the aggregate to
 * `universe_refresh_log.enrichment_skip_counts` (MIG-061).
 */
import { assert, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import "./index.ts";

Deno.test("enrich-and-filter/index.ts type-checks (Gate 11 coverage — FP-008.4 Commit 2.5)", () => {
  assertExists(import.meta.url);
});

Deno.test("FP-008.4 #23 source-level pin: catch-block classifies thrown errors as fetch_error and persists enrichment_skip_counts", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  // The caller's catch path MUST emit a `fetch_error`-reason skip entry —
  // pinning the structural attribution against silent regression to the
  // pre-#23 `return { kind: 'skipped' }` collapse that swallowed thrown
  // errors with no per-ticker / per-reason record.
  assert(
    /reason:\s*['"]fetch_error['"]/.test(src),
    "expected catch-block to attribute thrown errors as reason: 'fetch_error' (FP-008.4 #23 attribution gap)",
  );
  // The aggregate MUST persist to universe_refresh_log via the MIG-061
  // column — pinning the persistence contract against silent regression to
  // attribution-without-persistence.
  assert(
    /enrichment_skip_counts:\s*enrichmentSkipCounts/.test(src),
    "expected enrichment_skip_counts to be persisted in the universe_refresh_log.insert call (MIG-061 / FP-008.4 #23)",
  );
  // The accumulator MUST cover all three reasons (two fetcher-structural +
  // one caller-side fetch_error) — pinning the tracked-zero convention
  // (MIG-061 comment: tracked-zero is distinct from untracked-NULL).
  assert(
    /not_in_polygon_404:\s*0/.test(src) &&
      /fetch_error:\s*0/.test(src) &&
      /ishares_source:\s*0/.test(src),
    "expected enrichmentSkipCounts to initialise all three reasons to 0 (tracked-zero convention; FP-008.4 #23)",
  );
});
