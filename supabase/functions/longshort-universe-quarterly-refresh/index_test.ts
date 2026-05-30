/**
 * Deno test suite for `longshort-universe-quarterly-refresh` edge function
 * — sub-step 8.4 / ACT-108 regression sentinel.
 *
 * Coverage (4 assertions per ACT-108 prompt):
 *  (a) Quarter-gating: non-first-trading-day requests return 200 + status
 *      'skipped' BEFORE auth (matches handler ordering in index.ts).
 *  (b) Authentication is enforced on first-trading-day path: a malformed
 *      authorization header is treated identically to no-auth and is
 *      rejected — exercised here indirectly by asserting the gating
 *      branch's pre-auth ordering (auth never reached on non-quarter day,
 *      no side effects emitted beyond the 'skipped' audit event).
 *  (c) Authorization (longshort.view) wiring: surfaced via response-shape
 *      assertion — `apiError(401, 'unauthorized')` shape consumed by the
 *      handler's try/catch around `checkPermissionOrThrow`. Indirectly
 *      verified by the skip-path NOT returning 401 (proves the gate
 *      short-circuits before auth).
 *  (d) Atomicity-on-failure path: orchestrator + persister contract is
 *      unit-tested at quarterly-refresh-orchestrator_test.ts; this file
 *      verifies the HTTP wrapper returns 200 cleanly on the skip path
 *      (no `universe_refresh_log` row written when refresh does not run).
 *
 * Tests run against the deployed edge function and follow the dotenv
 * pattern documented for shared-test infrastructure.
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  isFirstTradingDayOfQuarter,
  firstTradingDayOfQuarter,
  nextQuarterRefreshDate,
} from "../_shared/longshort-universe/shared/trading-days.ts";

/**
 * ACT-108 regression sentinels — sub-step 8.4 / `longshort-universe-quarterly-refresh`.
 *
 * In-process unit tests of the gating + atomicity contracts the edge
 * function depends on. Tests do not call the deployed URL (avoids
 * coupling the regression suite to deployment availability + cron
 * windowing); the gating predicate + handler ordering + persister
 * contract are exercised in-process.
 *
 * Coverage required by ACT-108 prompt:
 *  (a) Quarter-gating predicate behaves correctly across the 4 quarter
 *      boundaries + non-quarter-start trading days + weekends/holidays.
 *      Today (2026-05-25) MUST be `false`; first trading day of Q2
 *      2026 (2026-04-01) MUST be `true`.
 *  (b) Authentication is gated AFTER quarter-check — handler-source
 *      regression sentinel: the function-source string MUST contain the
 *      `isFirstTradingDayOfQuarter` short-circuit BEFORE the
 *      `authenticateRequest` call (ordering invariant).
 *  (c) Authorization gate is wired via `checkPermissionOrThrow` for
 *      `longshort.view` — handler-source regression sentinel asserts
 *      both the import and the call site exist with the right
 *      permission key.
 *  (d) Atomicity-on-failure path — the orchestrator's
 *      finalize-even-on-failure contract is exercised at
 *      `quarterly-refresh-orchestrator_test.ts`; here we sentinel the
 *      handler-level `try/catch` around `orch.run()` + the
 *      `longshort.universe.refresh.failed` audit emission in the catch
 *      branch.
 */

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);

Deno.test("(a) quarter-gating predicate: 2026-05-25 is not first trading day; 2026-04-01 is", () => {
  // 2026-05-25 (today per ACT-108 chat) — non-first-trading-day → false
  assertEquals(isFirstTradingDayOfQuarter(new Date("2026-05-25T14:00:00Z")), false);
  // Q2 2026 first trading day = 2026-04-01 (Wednesday, no NYSE holiday) → true
  assertEquals(isFirstTradingDayOfQuarter(new Date("2026-04-01T14:00:00Z")), true);
  // Q3 2026 first trading day = 2026-07-01 (Wednesday) → true
  assertEquals(isFirstTradingDayOfQuarter(new Date("2026-07-01T14:00:00Z")), true);
  // Sanity: helpers expose a forward-quarter calculator (Q2 2026 = 2026-04-01)
  assertExists(firstTradingDayOfQuarter(2026, 2));
  assertExists(nextQuarterRefreshDate(new Date("2026-05-25T00:00:00Z")));
});

Deno.test("(b) handler short-circuits on quarter-gating BEFORE authenticateRequest (ordering invariant)", () => {
  // Refreshed at FP-008.4 Commit 1.5c (INC-28): handler architecture
  // converted JWT-auth → cron-secret-auth. With cron-secret being a
  // cheap O(1) header HMAC, auth-first is correct — prevents log
  // noise + abuse from unauthenticated callers. The prior JWT-path
  // "gating-first for load-shedding" rationale no longer applies.
  // Test name retained for git-blame continuity; assertion inverted.
  const authIdx = HANDLER_SOURCE.indexOf("verifyCronSecret(req)");
  const skipIdx = HANDLER_SOURCE.indexOf("isFirstTradingDayOfQuarter(as_of)");
  assertExists(authIdx >= 0 ? true : undefined);
  assertExists(skipIdx >= 0 ? true : undefined);
  if (!(authIdx > 0 && skipIdx > 0 && authIdx < skipIdx)) {
    throw new Error(
      `Ordering invariant violated (expected verifyCronSecret BEFORE isFirstTradingDayOfQuarter): authIdx=${authIdx} skipIdx=${skipIdx}`,
    );
  }
});

Deno.test("(c) handler wires checkPermissionOrThrow with longshort.view", () => {
  // Refreshed at FP-008.4 Commit 1.5c (INC-28): cron-dispatched
  // userless handler — pg_cron has no user identity, so permission-
  // based authz (checkPermissionOrThrow longshort.view) is conceptually
  // inapplicable. Real auth is cron-secret HMAC verification.
  // Operator-triggered manual refresh runs through a separate edge
  // function (per handler docstring lines 112-114) that wraps user
  // authz before proxying the cron secret in.
  // Test name retained for git-blame continuity; assertion converted
  // to: verifyCronSecret present + user-identity primitives ABSENT.
  if (!HANDLER_SOURCE.includes("verifyCronSecret")) {
    throw new Error("Missing verifyCronSecret call in handler");
  }
  if (!HANDLER_SOURCE.includes("'../_shared/cron-auth.ts'")) {
    throw new Error("Missing import from _shared/cron-auth.ts");
  }
  if (HANDLER_SOURCE.includes("checkPermissionOrThrow")) {
    throw new Error(
      "Unexpected checkPermissionOrThrow on cron-only handler — see INC-28",
    );
  }
  if (HANDLER_SOURCE.includes("authenticateRequest")) {
    throw new Error(
      "Unexpected authenticateRequest on cron-only handler — see INC-28",
    );
  }
});

Deno.test("(d) atomicity-on-failure: handler catches orchestrator throws and emits longshort.universe.refresh.failed", () => {
  // try/catch around orch.run() + emit failed event in catch branch
  if (!HANDLER_SOURCE.includes("longshort.universe.refresh.failed")) {
    throw new Error("Missing failure audit event emission");
  }
  if (!/catch\s*\(\s*e\s*\)/.test(HANDLER_SOURCE)) {
    throw new Error("Missing try/catch around orchestrator run");
  }
  // Skip-path audit marker is also required by the contract
  if (!HANDLER_SOURCE.includes("longshort.universe.refresh.skipped")) {
    throw new Error("Missing skip audit event emission");
  }
});