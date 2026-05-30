/**
 * Server-side tests for log-sudo-event.
 *
 * PLAN-AUTH-SUDO-001 / DEC-029 / FP-003 / RW-019.
 *
 * Verifies that the client-supplied `correlation_id` is persisted into the
 * `audit_logs` row AND echoed in both the success and 500 error responses.
 *
 * Strategy: env vars are set BEFORE importing the handler so supabase-admin
 * constructs against a stub URL; `globalThis.fetch` is stubbed to intercept
 * the supabase REST calls (`/auth/v1/user` and `/rest/v1/audit_logs`) and
 * capture the insert payload.
 */
import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ─── env MUST be set before importing the handler ───────────────────
Deno.env.set("LOG_SUDO_EVENT_TEST", "1");
Deno.env.set("SUPABASE_URL", "http://stub.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-srk");
Deno.env.set("ALLOWED_ORIGINS", "*");

const FAKE_USER_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_CID  = "22222222-2222-4222-8222-222222222222";

interface CapturedInsert {
  url: string;
  body: Record<string, unknown>;
}

type FetchFn = typeof fetch;
const realFetch: FetchFn = globalThis.fetch;

function installStubFetch(opts: { auditShouldFail: boolean }): {
  captured: CapturedInsert[];
  restore: () => void;
} {
  const captured: CapturedInsert[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // supabaseAdmin.auth.getUser(token) → POST /auth/v1/user
    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({
          id: FAKE_USER_ID,
          email: "test@example.com",
          last_sign_in_at: new Date().toISOString(),
          factors: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // supabaseAdmin.from('audit_logs').insert(...).select('id').single()
    if (url.includes("/rest/v1/audit_logs")) {
      const rawBody = init?.body;
      let parsed: unknown = {};
      if (typeof rawBody === "string") {
        try { parsed = JSON.parse(rawBody); } catch { /* ignore */ }
      }
      const row = Array.isArray(parsed) ? parsed[0] : parsed;
      captured.push({ url, body: row as Record<string, unknown> });

      if (opts.auditShouldFail) {
        return new Response(
          JSON.stringify({ message: "simulated DB failure", code: "XX000" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ id: "audit-row-uuid" }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }

    // Unknown call — fail loudly so we notice if scope expands.
    throw new Error(`Unstubbed fetch in test: ${url}`);
  }) as FetchFn;

  return {
    captured,
    restore: () => { globalThis.fetch = realFetch; },
  };
}

function buildRequest(body: object): Request {
  return new Request("http://localhost/log-sudo-event", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test.jwt.token",
      "Content-Type": "application/json",
      "origin": "http://localhost",
      "user-agent": "deno-test",
    },
    body: JSON.stringify(body),
  });
}

// Import once; both tests reuse the same handler.
const { handler } = await import("./index.ts");

// Sanitize opts applied to all three tests at FP-008.4 Commit 1.5d:
// `@supabase/auth-js` initializes a `setInterval` for auto-token-refresh
// the first time the admin client is used inside a test. Under Deno's
// per-test leak detector this is flagged as an uncleared interval on
// whichever test triggers it first (typically the leading test), even
// though the interval is a process-lifetime resource managed by the
// auth client, not a per-test resource leak in this code. Disabling
// sanitize for these three stub-fetch unit tests is the canonical
// pattern (same convention as get-profile/index_test.ts L110); the
// tests still exercise correlation-id flow correctness via captured
// stub assertions. INC-29 documents the convention for future
// supabase-admin-importing edge function tests.
Deno.test({
  name: "log-sudo-event SUCCESS: client correlation_id is persisted into audit row and echoed in response",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
  const stub = installStubFetch({ auditShouldFail: false });
  try {
    const res = await handler(buildRequest({
      action: "auth.sudo_granted",
      action_key: "mfa_enroll_route",
      correlation_id: CLIENT_CID,
    }));

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.logged, true);
    assertEquals(body.correlation_id, CLIENT_CID, "success response must echo client correlation_id");

    // Exactly one audit insert occurred and carries the client cid.
    assertEquals(stub.captured.length, 1, "expected one audit_logs insert");
    const row = stub.captured[0].body;
    assertEquals(row.correlation_id, CLIENT_CID, "audit_logs.correlation_id column must be the client cid");
    assertEquals(row.action, "auth.sudo_granted");
    assertEquals(row.actor_id, FAKE_USER_ID, "actor_id must come from JWT, not body");
    assertEquals(row.target_type, "auth.sudo");
    assertEquals(row.target_id, FAKE_USER_ID);

    // metadata.correlation_id mirror is also present (audit.ts contract).
    const metadata = row.metadata as Record<string, unknown>;
    assertEquals(metadata.correlation_id, CLIENT_CID, "metadata.correlation_id mirror must also be the client cid");
    assertEquals(metadata.action_key, "mfa_enroll_route");
  } finally {
    stub.restore();
  }
  },
});

Deno.test({
  name: "log-sudo-event FAILURE (500): client correlation_id is still attempted on the row AND surfaced in the error response",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
  const stub = installStubFetch({ auditShouldFail: true });
  try {
    const res = await handler(buildRequest({
      action: "auth.sensitive_action_performed",
      action_key: "password_change",
      correlation_id: CLIENT_CID,
    }));

    assertEquals(res.status, 500);
    const body = await res.json();
    assertExists(body.correlation_id, "500 response must carry correlation_id");
    assertEquals(body.correlation_id, CLIENT_CID, "500 response correlation_id must equal client cid");
    assertEquals(body.code, "INTERNAL_ERROR");

    // Insert was attempted with the client cid even though it failed.
    assertEquals(stub.captured.length, 1, "expected one attempted audit_logs insert");
    const row = stub.captured[0].body;
    assertEquals(row.correlation_id, CLIENT_CID, "attempted audit row must carry the client cid");
    assertEquals(row.action, "auth.sensitive_action_performed");
    assertEquals(row.actor_id, FAKE_USER_ID);
    const metadata = row.metadata as Record<string, unknown>;
    assertEquals(metadata.action_key, "password_change");
  } finally {
    stub.restore();
  }
  },
});

Deno.test({
  name: "log-sudo-event SUCCESS without client cid: server-generated cid still flows into row and response",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
  const stub = installStubFetch({ auditShouldFail: false });
  try {
    const res = await handler(buildRequest({
      action: "auth.sudo_granted",
      action_key: "recovery_codes_generate",
      // no correlation_id
    }));

    assertEquals(res.status, 200);
    const body = await res.json();
    assertExists(body.correlation_id);
    assert(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.correlation_id),
      "fallback correlation_id must be a uuid",
    );

    assertEquals(stub.captured.length, 1);
    const row = stub.captured[0].body;
    // Whatever the server chose, the row and the response MUST agree.
    assertEquals(row.correlation_id, body.correlation_id, "row cid must equal response cid");
  } finally {
    stub.restore();
  }
  },
});