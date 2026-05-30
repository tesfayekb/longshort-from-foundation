import "https://deno.land/std@0.224.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const BASE = `${SUPABASE_URL}/functions/v1`;

Deno.test("deactivate-user: rejects unauthenticated request", async () => {
  const res = await fetch(`${BASE}/deactivate-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000000" }),
  });
  const body = await res.text();
  assertEquals(res.status, 401, `Expected 401, got ${res.status}: ${body}`);
});

Deno.test("deactivate-user: rejects GET method", async () => {
  const res = await fetch(`${BASE}/deactivate-user`, {
    method: "GET",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
  });
  await res.text();
  // Handler wraps with createHandler which checks auth first, but method check is inside handler
  // Actual behavior: 405 (method checked inside handler after auth) or 401 (auth checked first)
  // Accept either as valid denial
  const ok = res.status === 401 || res.status === 405;
  assertEquals(ok, true, `Expected 401 or 405, got ${res.status}`);
});

Deno.test("deactivate-user: CORS preflight", async () => {
  const res = await fetch(`${BASE}/deactivate-user`, {
    method: "OPTIONS",
    headers: { apikey: SUPABASE_ANON_KEY },
  });
  await res.text();
  assertEquals(res.status, 200);
  // Refreshed at FP-008.4 Commit 1.5d (INC-29 secondary scope item).
  // CORS policy for this endpoint is dynamic-origin (admin-only,
  // authenticated, high-risk per index.ts docstring). Allow-list lives
  // in `_shared/cors.ts`: ALLOWED_ORIGINS env + Lovable preview hosts.
  // Wildcard "*" would be a CSRF surface on an admin mutation
  // endpoint — the prior assertion (== "*") had it backwards and was
  // the test bug, not a CORS-leakage defect. Structural assertion:
  //   (i) header is present and non-empty (CORS responsibility wired)
  //   (ii) header is NOT "*" (positive-absence sentinel; locks the
  //        dynamic-origin policy against silent regression to wildcard
  //        — same INC-28 pattern of asserting absence of the wrong
  //        primitive to prevent silent re-introduction).
  const origin = res.headers.get("access-control-allow-origin");
  assertEquals(typeof origin === "string" && origin.length > 0, true,
    "Access-Control-Allow-Origin must be present and non-empty");
  assertEquals(origin !== "*", true,
    "Access-Control-Allow-Origin must NOT be wildcard on admin endpoint — see INC-29 + _shared/cors.ts");
});

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
