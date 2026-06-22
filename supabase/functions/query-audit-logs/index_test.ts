/**
 * Tests for query-audit-logs and export-audit-logs edge functions.
 * Call deployed edge functions via HTTP; require live Supabase URL + anon key.
 * DW-121: env-guarded -- tests skip honestly when live env is absent (was hidden via deno.json exclude).
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? "";
const HAS_ENV = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

const queryUrl = `${SUPABASE_URL}/functions/v1/query-audit-logs`;
const exportUrl = `${SUPABASE_URL}/functions/v1/export-audit-logs`;

// --- Unauthenticated denial tests ---

Deno.test({ name: "query-audit-logs returns 401 without auth token", ignore: !HAS_ENV, fn: async () => {
  const res = await fetch(queryUrl, { headers: { "apikey": SUPABASE_ANON_KEY } });
  assertEquals(res.status, 401);
  const body = await res.json();
  assertExists(body.error);
}});

Deno.test({ name: "export-audit-logs returns 401 without auth token", ignore: !HAS_ENV, fn: async () => {
  const res = await fetch(exportUrl, { headers: { "apikey": SUPABASE_ANON_KEY } });
  assertEquals(res.status, 401);
  const body = await res.json();
  assertExists(body.error);
}});

// --- Method denial tests ---

Deno.test({ name: "query-audit-logs rejects POST method", ignore: !HAS_ENV, fn: async () => {
  const res = await fetch(queryUrl, { method: "POST", headers: { "apikey": SUPABASE_ANON_KEY } });
  const status = res.status;
  assertEquals(status === 401 || status === 405, true);
  await res.text();
}});

Deno.test({ name: "export-audit-logs rejects POST method", ignore: !HAS_ENV, fn: async () => {
  const res = await fetch(exportUrl, { method: "POST", headers: { "apikey": SUPABASE_ANON_KEY } });
  const status = res.status;
  assertEquals(status === 401 || status === 405, true);
  await res.text();
}});

// --- CORS tests ---

Deno.test({ name: "query-audit-logs handles OPTIONS preflight", ignore: !HAS_ENV, fn: async () => {
  const res = await fetch(queryUrl, { method: "OPTIONS" });
  assertEquals(res.status, 200);
  assertExists(res.headers.get("Access-Control-Allow-Origin"));
  await res.text();
}});

Deno.test({ name: "export-audit-logs handles OPTIONS preflight", ignore: !HAS_ENV, fn: async () => {
  const res = await fetch(exportUrl, { method: "OPTIONS" });
  assertEquals(res.status, 200);
  assertExists(res.headers.get("Access-Control-Allow-Origin"));
  await res.text();
}});

// --- Input validation (auth-fail short-circuit) ---

Deno.test({ name: "query-audit-logs validates actor_id UUID format", ignore: !HAS_ENV, fn: async () => {
  const res = await fetch(`${queryUrl}?actor_id=not-a-uuid`, {
    headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer invalid-token" },
  });
  // Auth runs before validation -> 401 with invalid token.
  assertEquals(res.status, 401);
  await res.text();
}});
