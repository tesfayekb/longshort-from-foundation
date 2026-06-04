// @ts-nocheck — Deno test file with fetch-stub harness.
/**
 * Tests for longshort-reconciliation-lifecycle.ts — FP-008.4 Commit 7
 * infrastructure-failure audit-hole closure.
 *
 * Coverage:
 *   (a) Audit-hole closure: when reconcile()'s loadFn throws, a
 *       reconciliation_events row with outcome='system_bug' and
 *       divergence={infrastructure_failure:true,error:<msg>} is written
 *       BEFORE the original error is re-thrown (restores the "every
 *       verify_* invocation writes one row" invariant).
 *   (b) Original error is re-thrown — caller's fail-loud contract preserved.
 *   (c) State surface is NOT updated on the infra-failure path (event-row-only).
 *
 * Harness: stubs globalThis.fetch + sets fake SUPABASE_URL/SERVICE_ROLE_KEY
 * env vars so supabase-js routes through the stub. No live DB access.
 */
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

const FAKE_URL = 'https://stub.supabase.co';
const FAKE_KEY = 'fake-service-role-key';

type CapturedCall = { method: string; url: string; body: unknown };

function installFetchStub(): {
  calls: CapturedCall[];
  restore: () => void;
} {
  const calls: CapturedCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    let body: unknown = undefined;
    if (init?.body) {
      try { body = JSON.parse(String(init.body)); } catch { body = init.body; }
    }
    calls.push({ method, url, body });

    // Stub responses by endpoint shape:
    //  - POST /rest/v1/reconciliation_events?... → INSERT returning {event_id}
    //  - GET  /rest/v1/longshort_reconciliation_state?... → empty
    //  - POST /rest/v1/longshort_reconciliation_state?... → upsert ok
    if (url.includes('/rest/v1/reconciliation_events') && method === 'POST') {
      return new Response(JSON.stringify([{ event_id: 'evt-stub-uuid' }]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/rest/v1/longshort_reconciliation_state')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  return {
    calls,
    restore: () => { globalThis.fetch = original; },
  };
}

Deno.env.set('SUPABASE_URL', FAKE_URL);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', FAKE_KEY);

const { reconcile } = await import('./longshort-reconciliation-lifecycle.ts');

function makeSpec() {
  return {
    call_name: 'verify_buying_power' as const,
    tier: 'medium' as const,
    tolerance_class: 'noise_tolerant' as const,
    operator_id: '00000000-0000-0000-0000-000000000001',
    symbol: null,
    tolerance: {},
    compute_divergence: () => ({}),
    classify_outcome: () => 'false_positive_within_tolerance' as const,
    failure_action: async () => ({ action_taken: 'noop' }),
  };
}

Deno.test('audit-hole closure: invoke() throw → system_bug event row written + original error re-thrown', async () => {
  const stub = installFetchStub();
  try {
    const spec = makeSpec();
    const ts = new Date('2026-06-01T14:00:00Z');
    const infraError = new Error('alpaca timeout: ECONNRESET');

    await assertRejects(
      () => reconcile(spec, async () => { throw infraError; }, ts),
      Error,
      'alpaca timeout: ECONNRESET',
    );

    // Find the POST to reconciliation_events
    const eventWrites = stub.calls.filter((c) =>
      c.method === 'POST' && c.url.includes('/rest/v1/reconciliation_events')
    );
    assertEquals(eventWrites.length, 1, 'exactly one event row should be written');

    const row = eventWrites[0].body as Record<string, unknown>;
    assertEquals(row.outcome, 'system_bug');
    assertEquals(row.expected_value, null);
    assertEquals(row.observed_value, null);
    assertEquals(row.call_name, 'verify_buying_power');
    assertEquals((row.divergence as Record<string, unknown>).infrastructure_failure, true);
    assertStringIncludes(
      String((row.divergence as Record<string, unknown>).error),
      'alpaca timeout',
    );
    assertStringIncludes(String(row.notes), 'infrastructure_failure:');
    assertStringIncludes(String(row.notes), 'alpaca timeout');
  } finally {
    stub.restore();
  }
});

Deno.test('audit-hole closure: state surface is NOT updated on infra-failure path (event-row-only)', async () => {
  const stub = installFetchStub();
  try {
    const spec = makeSpec();
    const ts = new Date('2026-06-01T14:00:00Z');

    await assertRejects(
      () => reconcile(spec, async () => { throw new Error('boom'); }, ts),
    );

    const stateCalls = stub.calls.filter((c) =>
      c.url.includes('/rest/v1/longshort_reconciliation_state')
    );
    assertEquals(
      stateCalls.length,
      0,
      'state surface must not be read or written on infra-failure path',
    );
  } finally {
    stub.restore();
  }
});

Deno.test('audit-hole closure: event-write failure during closure is logged but original error still propagates', async () => {
  const calls: CapturedCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    calls.push({ method, url, body: undefined });
    if (url.includes('/rest/v1/reconciliation_events') && method === 'POST') {
      return new Response(JSON.stringify({ message: 'DB down' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const spec = makeSpec();
    const ts = new Date('2026-06-01T14:00:00Z');
    // Original error must still propagate even when audit write fails.
    await assertRejects(
      () => reconcile(spec, async () => { throw new Error('original-infra-error'); }, ts),
      Error,
      'original-infra-error',
    );
    const eventAttempts = calls.filter((c) =>
      c.method === 'POST' && c.url.includes('/rest/v1/reconciliation_events')
    );
    assert(eventAttempts.length >= 1, 'audit write should have been attempted');
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test('source sentinel: STEP (a) loadFn invocation is wrapped in try/catch', async () => {
  const src = await Deno.readTextFile(
    new URL('./longshort-reconciliation-lifecycle.ts', import.meta.url),
  );
  // The closure shape: a try { ({ expected, observed } = await invoke(ts)); } catch
  assertStringIncludes(src, 'await invoke(ts)');
  assertStringIncludes(src, 'infrastructure_failure: true');
  assertStringIncludes(src, "outcome: 'system_bug'");
  // Re-throw must be present
  assertStringIncludes(src, 'throw err');
});