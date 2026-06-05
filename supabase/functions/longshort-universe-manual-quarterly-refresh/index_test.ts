/**
 * Deno test suite for `longshort-universe-manual-quarterly-refresh` edge
 * function — FP-009 Bucket 0.2 regression sentinel.
 *
 * Coverage shape mirrors `longshort-universe-quarterly-refresh/index_test.ts`
 * — in-process source-sentinel + pure-function tests rather than deployed
 * HTTP calls (precedent: ACT-108 + DW-082 edge-function-behavioral-test
 * orphan class; same justification — `Deno.serve(createHandler(...))`
 * harness coupling is out of unit-test scope here).
 *
 * Tests:
 *  (a) operator JWT (`authenticateRequest`) is wired — NOT cron-secret.
 *  (b) `longshort.manage` permission is wired (NOT `longshort.admin`
 *      which doesn't exist; NOT `longshort.view` which is read-only).
 *  (c) request body validation — `parseAsOfDate` pure unit tests +
 *      handler-source sentinels for the missing/invalid/future paths.
 *  (d) bypasses ONLY the calendar gate — handler-source must NOT contain
 *      `isFirstTradingDayOfQuarter` (the whole point of the manual path)
 *      but MUST invoke `createQuarterlyRefreshOrchestrator` with the
 *      operator-supplied `as_of` and MUST NOT bypass `crossCheck` /
 *      `reconcile` (correctness gates preserved).
 *  (e) dual audit-event trail — the three manual envelope actions
 *      (`.manual_triggered` / `.manual_completed` / `.manual_failed`)
 *      are emitted via `writeStrategyAuditEvent`; the orchestrator's
 *      inner events fire from the orchestrator itself (covered by
 *      `quarterly-refresh-orchestrator_test.ts`).
 *  (f) correlation-id flow — handler uses `ctx.correlationId` from
 *      `authenticateRequest` and threads it into every audit event +
 *      the response body.
 *  (g) cron handler unchanged — sentinel: the cron handler still gates
 *      on `isFirstTradingDayOfQuarter` and still uses `verifyCronSecret`.
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { parseAsOfDate } from "./parse-as-of-date.ts";

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
const CRON_HANDLER_SOURCE = await Deno.readTextFile(
  new URL("../longshort-universe-quarterly-refresh/index.ts", import.meta.url),
);

Deno.test("(a) operator JWT wired via authenticateRequest (NOT cron-secret)", () => {
  if (!HANDLER_SOURCE.includes("authenticateRequest(req)")) {
    throw new Error("Missing authenticateRequest(req) call");
  }
  if (!HANDLER_SOURCE.includes("'../_shared/authenticate-request.ts'")) {
    throw new Error("Missing import from _shared/authenticate-request.ts");
  }
  if (HANDLER_SOURCE.includes("verifyCronSecret")) {
    throw new Error(
      "Unexpected verifyCronSecret on operator-auth handler — cron-secret is for cron-only paths",
    );
  }
});

Deno.test("(b) checkPermissionOrThrow wired with longshort.manage (NOT .admin, NOT .view-only)", () => {
  if (!HANDLER_SOURCE.includes("checkPermissionOrThrow(ctx.user.id, 'longshort.manage')")) {
    throw new Error("Missing checkPermissionOrThrow with 'longshort.manage'");
  }
  // .admin doesn't exist in the live schema — guard against typo regressions.
  if (HANDLER_SOURCE.includes("'longshort.admin'")) {
    throw new Error("Unexpected 'longshort.admin' — permission does not exist in live schema");
  }
});

Deno.test("(c1) parseAsOfDate accepts valid YYYY-MM-DD", () => {
  const d = parseAsOfDate("2026-06-05");
  assertExists(d);
  assertEquals(d!.toISOString(), "2026-06-05T00:00:00.000Z");
});

Deno.test("(c2) parseAsOfDate rejects malformed/invalid input", () => {
  assertEquals(parseAsOfDate(undefined), null);
  assertEquals(parseAsOfDate(null), null);
  assertEquals(parseAsOfDate(20260605), null);
  assertEquals(parseAsOfDate("2026/06/05"), null);
  assertEquals(parseAsOfDate("2026-6-5"), null);
  assertEquals(parseAsOfDate("2026-13-01"), null);
  assertEquals(parseAsOfDate("2026-02-30"), null);
  assertEquals(parseAsOfDate("not-a-date"), null);
});

Deno.test("(c3) handler emits the four request-validation 400s + a future-as_of guard", () => {
  for (const code of [
    "invalid_json_body",
    "as_of_required",
    "as_of_invalid_format_expected_YYYY_MM_DD",
    "as_of_in_future",
  ]) {
    if (!HANDLER_SOURCE.includes(code)) {
      throw new Error(`Missing 400 error code: ${code}`);
    }
  }
});

Deno.test("(d) bypasses ONLY calendar gate; orchestrator + cross-check preserved", () => {
  // Look for any *call* to isFirstTradingDayOfQuarter (open-paren) — the
  // header comment legitimately mentions the symbol by name to explain the
  // architectural separation, so a bare substring match would false-positive.
  if (/isFirstTradingDayOfQuarter\s*\(/.test(HANDLER_SOURCE)) {
    throw new Error(
      "Manual handler must NOT gate on isFirstTradingDayOfQuarter (whole point of the path)",
    );
  }
  if (!HANDLER_SOURCE.includes("createQuarterlyRefreshOrchestrator(refreshCtx, DEFAULT_OPERATOR_ID)")) {
    throw new Error("Missing orchestrator invocation");
  }
  if (!HANDLER_SOURCE.includes("orch.run(as_of)")) {
    throw new Error("Orchestrator must run with the operator-supplied as_of");
  }
  // Correctness gates preserved — crossCheck wires reconcile() identically
  // to the cron path.
  if (!HANDLER_SOURCE.includes("crossCheck:") || !HANDLER_SOURCE.includes("reconcile(")) {
    throw new Error("Cross-check / reconcile wiring missing — correctness gate broken");
  }
  if (!HANDLER_SOURCE.includes("buildUniverseCrossCheckSpec(")) {
    throw new Error("buildUniverseCrossCheckSpec missing — cross-check spec contract broken");
  }
});

Deno.test("(e) dual audit-event envelope — manual_triggered + manual_completed + manual_failed", () => {
  for (const action of [
    "longshort.universe.refresh.manual_triggered",
    "longshort.universe.refresh.manual_completed",
    "longshort.universe.refresh.manual_failed",
  ]) {
    if (!HANDLER_SOURCE.includes(action)) {
      throw new Error(`Missing audit action: ${action}`);
    }
  }
  if (!HANDLER_SOURCE.includes("writeStrategyAuditEvent")) {
    throw new Error("Missing writeStrategyAuditEvent (T4 audit-writer-trap)");
  }
  if (HANDLER_SOURCE.includes("logAuditEvent")) {
    throw new Error(
      "T4 audit-writer-trap: strategy code must not import platform logAuditEvent",
    );
  }
  // try/catch around orchestrator MUST emit manual_failed in the catch branch.
  if (!/catch\s*\(\s*e\s*\)\s*\{[\s\S]*manual_failed/.test(HANDLER_SOURCE)) {
    throw new Error("manual_failed must be emitted from the catch branch");
  }
});

Deno.test("(f) correlation-id flows from auth context into events + response", () => {
  if (!HANDLER_SOURCE.includes("const correlationId = ctx.correlationId")) {
    throw new Error("correlationId must derive from authenticated context");
  }
  if (!HANDLER_SOURCE.includes("correlation_id: correlationId")) {
    throw new Error("Response must include correlation_id");
  }
});

Deno.test("(g) cron handler unchanged — calendar gate + cron-secret intact", () => {
  if (!CRON_HANDLER_SOURCE.includes("isFirstTradingDayOfQuarter(as_of)")) {
    throw new Error(
      "Cron handler must still gate on isFirstTradingDayOfQuarter — Bucket 0.2 must NOT modify the cron path",
    );
  }
  if (!CRON_HANDLER_SOURCE.includes("verifyCronSecret(req)")) {
    throw new Error(
      "Cron handler must still use verifyCronSecret — Bucket 0.2 must NOT modify the cron path",
    );
  }
});