import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? "";
// DW-121: env-guard.
const HAS_ENV = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

const BASE = `${SUPABASE_URL}/functions/v1`;

Deno.test({ name: "reactivate-user: rejects unauthenticated request", ignore: !HAS_ENV, fn: async () => {
  const res = await fetch(`${BASE}/reactivate-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000000" }),
  });
  const body = await res.text();
  assertEquals(res.status, 401, `Expected 401, got ${res.status}: ${body}`);
}});

Deno.test({ name: "reactivate-user: rejects GET method", ignore: !HAS_ENV, fn: async () => {
  const res = await fetch(`${BASE}/reactivate-user`, {
    method: "GET",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
  });
  await res.text();
  const ok = res.status === 401 || res.status === 405;
  assertEquals(ok, true, `Expected 401 or 405, got ${res.status}`);
}});

Deno.test({ name: "reactivate-user: CORS preflight", ignore: !HAS_ENV, fn: async () => {
  const res = await fetch(`${BASE}/reactivate-user`, {
    method: "OPTIONS",
    headers: { apikey: SUPABASE_ANON_KEY },
  });
  await res.text();
  assertEquals(res.status, 200);
  // Parity with deactivate-user CORS test (INC-29 + INC-28).
  const origin = res.headers.get("access-control-allow-origin");
  assertEquals(typeof origin === "string" && origin.length > 0, true,
    "Access-Control-Allow-Origin must be present and non-empty");
  assertEquals(origin !== "*", true,
    "Access-Control-Allow-Origin must NOT be wildcard on admin endpoint");
}});
