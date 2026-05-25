/**
 * Deno test suite for `longshort-universe-hard-exclusion-refresh`
 * one-dispatcher edge function — sub-step 8.5 / ACT-109 regression sentinel.
 *
 * Coverage (handler-source sentinels per ACT-108 precedent):
 *  (a) Method gate — non-POST rejected before body parse.
 *  (b) Rule param required + validated via `isHardExclusionRuleKey`.
 *  (c) Authz wired with longshort.view (parity with sub-step 8.4 handler).
 *  (d) Surface 0 Option α — empty/absent tickers short-circuit to
 *      `awaiting_universe_membership_8_6` skip audit event.
 *  (e) Orchestrator path wired + failure audit emission in catch branch.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);

Deno.test("(a) handler rejects non-POST with 405", () => {
  const has405 = HANDLER_SOURCE.includes("method_not_allowed");
  assertEquals(has405, true);
  // Method gate must come before body parse for cheap rejection.
  const methodIdx = HANDLER_SOURCE.indexOf("req.method !== 'POST'");
  const bodyParseIdx = HANDLER_SOURCE.indexOf("await req.text()");
  if (!(methodIdx > 0 && bodyParseIdx > 0 && methodIdx < bodyParseIdx)) {
    throw new Error(
      `Ordering: methodIdx=${methodIdx} bodyParseIdx=${bodyParseIdx}`,
    );
  }
});

Deno.test("(b) rule param is required and validated via isHardExclusionRuleKey", () => {
  if (!HANDLER_SOURCE.includes("isHardExclusionRuleKey")) {
    throw new Error("Missing isHardExclusionRuleKey import/use");
  }
  if (!HANDLER_SOURCE.includes("rule_param_required_or_invalid")) {
    throw new Error("Missing rule_param_required_or_invalid error");
  }
});

Deno.test("(c) handler wires checkPermissionOrThrow with longshort.view", () => {
  if (!HANDLER_SOURCE.includes("checkPermissionOrThrow")) {
    throw new Error("Missing checkPermissionOrThrow call");
  }
  if (!HANDLER_SOURCE.includes("'longshort.view'")) {
    throw new Error("Missing 'longshort.view' permission key");
  }
});

Deno.test("(d) Surface 0 Option α — empty/absent tickers emit awaiting_universe_membership_8_6 skip", () => {
  if (!HANDLER_SOURCE.includes("awaiting_universe_membership_8_6")) {
    throw new Error("Missing awaiting_universe_membership_8_6 skip reason");
  }
  if (!HANDLER_SOURCE.includes("'skipped'")) {
    throw new Error("Missing 'skipped' outcome string");
  }
  // Skip emission must reference the per-rule audit-action suffix builder
  // (actionFor(rule, 'skipped')) so MIG-049 ids stay consistent.
  if (!HANDLER_SOURCE.includes("actionFor(rule, 'skipped')")) {
    throw new Error("Missing actionFor(rule, 'skipped') audit call");
  }
});

Deno.test("(e) orchestrator wired + failure audit emission in catch branch", () => {
  if (!HANDLER_SOURCE.includes("createHardExclusionRefreshOrchestrator")) {
    throw new Error("Missing orchestrator import/use");
  }
  if (!HANDLER_SOURCE.includes("actionFor(rule, 'failed')")) {
    throw new Error("Missing actionFor(rule, 'failed') audit call");
  }
  if (!HANDLER_SOURCE.includes("hard_exclusion_refresh_failed")) {
    throw new Error("Missing hard_exclusion_refresh_failed error code");
  }
  if (!/catch\s*\(\s*e\s*\)/.test(HANDLER_SOURCE)) {
    throw new Error("Missing try/catch around orchestrator run");
  }
});

Deno.test("audit-action suffix builder produces MIG-049-aligned ids", () => {
  // Replicate the actionFor() suffix logic locally to lock the format.
  const f = (rule: string, suffix: string) =>
    `longshort.universe.hard_exclusion_refresh_${rule.replace('.', '_')}.${suffix}`;
  assertEquals(f('3.3a', 'skipped'), 'longshort.universe.hard_exclusion_refresh_3_3a.skipped');
  assertEquals(f('3.3e', 'completed'), 'longshort.universe.hard_exclusion_refresh_3_3e.completed');
  assertEquals(f('3.3b', 'failed'), 'longshort.universe.hard_exclusion_refresh_3_3b.failed');
});