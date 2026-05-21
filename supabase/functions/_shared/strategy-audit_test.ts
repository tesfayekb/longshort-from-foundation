import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Pure exports are safe to import — they do not trigger supabaseAdmin
// creation at module load. The main `writeStrategyAuditEvent` export
// transitively imports supabase-admin.ts, but we exercise it only via
// the unknown-key path which short-circuits BEFORE any DB call, so no
// live credentials are required.
import {
  KNOWN_STRATEGY_KEYS,
  DEFAULT_OPERATOR_ID,
  resolveStrategyAuditTable,
  isKnownStrategyKey,
  sanitizeStrategyMetadata,
  writeStrategyAuditEvent,
  type StrategyAuditWriteResult,
} from "../_shared/strategy-audit.ts";

// ─── AC-05: Table-name interpolation ────────────────────────────────

Deno.test("resolveStrategyAuditTable interpolates strategyKey", () => {
  assertEquals(resolveStrategyAuditTable("longshort"), "longshort_audit_logs");
});

Deno.test("resolveStrategyAuditTable interpolates arbitrary keys (pure)", () => {
  // Pure resolver does not enforce the registry — that is the caller's job.
  assertEquals(resolveStrategyAuditTable("foo"), "foo_audit_logs");
});

// ─── AC-05: Registry ────────────────────────────────────────────────

Deno.test("KNOWN_STRATEGY_KEYS contains 'longshort'", () => {
  assertEquals(KNOWN_STRATEGY_KEYS.has("longshort"), true);
});

Deno.test("isKnownStrategyKey distinguishes registered vs typo", () => {
  assertEquals(isKnownStrategyKey("longshort"), true);
  assertEquals(isKnownStrategyKey("longshrt"), false);
  assertEquals(isKnownStrategyKey(""), false);
});

// ─── AC-05: Platform-parity return shape (unknown-key failure path) ──

Deno.test("writeStrategyAuditEvent returns structured failure on unknown key", async () => {
  const result: StrategyAuditWriteResult = await writeStrategyAuditEvent({
    strategyKey: "nonexistent_strategy",
    action: "nonexistent_strategy.init",
    correlationId: "test-corr-001",
  });
  assertEquals(result.success, false);
  if (result.success === false) {
    assertEquals(result.code, "unknown_strategy_key");
    assertEquals(result.correlationId, "test-corr-001");
    assertExists(result.reason);
  }
});

Deno.test("writeStrategyAuditEvent never throws on unknown key", async () => {
  let threw = false;
  try {
    await writeStrategyAuditEvent({
      strategyKey: "another_typo",
      action: "x.y",
      correlationId: "test-corr-002",
    });
  } catch {
    threw = true;
  }
  assertEquals(threw, false);
});

Deno.test("writeStrategyAuditEvent failure result carries correlationId round-trip", async () => {
  const corr = "round-trip-corr-999";
  const result = await writeStrategyAuditEvent({
    strategyKey: "unknown",
    action: "unknown.act",
    correlationId: corr,
  });
  assertEquals(result.correlationId, corr);
});

// ─── Metadata sanitization (platform parity) ────────────────────────

Deno.test("sanitizeStrategyMetadata redacts forbidden keys", () => {
  const out = sanitizeStrategyMetadata({
    password: "hunter2",
    token: "abc",
    safe_field: "ok",
  });
  assertEquals(out.password, "[REDACTED]");
  assertEquals(out.token, "[REDACTED]");
  assertEquals(out.safe_field, "ok");
});

Deno.test("sanitizeStrategyMetadata is case-insensitive on forbidden keys", () => {
  const out = sanitizeStrategyMetadata({
    PASSWORD: "x",
    Api_Key: "y",
    keep: 1,
  });
  assertEquals(out.PASSWORD, "[REDACTED]");
  assertEquals(out.Api_Key, "[REDACTED]");
  assertEquals(out.keep, 1);
});

Deno.test("sanitizeStrategyMetadata preserves non-forbidden values verbatim", () => {
  const out = sanitizeStrategyMetadata({
    count: 42,
    nested: { a: 1 },
    flag: true,
  });
  assertEquals(out.count, 42);
  assertEquals((out.nested as { a: number }).a, 1);
  assertEquals(out.flag, true);
});

// ─── Default operator UUID ──────────────────────────────────────────

Deno.test("DEFAULT_OPERATOR_ID matches FP-005 AC-10 contract", () => {
  assertEquals(DEFAULT_OPERATOR_ID, "00000000-0000-0000-0000-000000000001");
});