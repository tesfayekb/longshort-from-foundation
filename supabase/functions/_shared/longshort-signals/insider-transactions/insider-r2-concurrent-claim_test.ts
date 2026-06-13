// @ts-nocheck — Deno integration test. FP-050 Phase 4 F2.c — R2
// concurrency-safety regression for `seedWorkItems` claim against
// `public.insider_accession_discovery_queue`.
//
// ─── Project's FIRST transactional-contention test pattern ─────────────
//
// Forward-binding for all future signal-queue concurrency regressions.
// Pattern:
//   (1) Two independent SupabaseClient instances (separate fetch
//       sessions; service-role key — the claim runs under service-role
//       in production via the edge-function `supabaseAdmin`). The
//       row-lock is what gates the contention, not the auth identity.
//   (2) Seed a fixture: N synthetic discovery rows on a synthetic
//       `as_of_date` (1990-01-02 — far outside any real window so the
//       test cannot collide with production drain).
//   (3) Promise.allSettled([claim(client_A), claim(client_B)]) — both
//       fire the same UPDATE … RETURNING shape that `seedWorkItems`
//       uses.
//   (4) Assert the DISJOINT outcome: exactly one resolved with N > 0,
//       one with 0; the sum equals the seeded fixture size. The single
//       sequential-equivalent (re-running the same claim afterwards
//       against the now-empty pool) returns 0.
//   (5) Cleanup: DELETE the fixture rows by `discovery_correlation_id`
//       so the test is fully idempotent across runs.
//
// The pattern proves Postgres row-level locking on
// `UPDATE … WHERE consumed_at IS NULL RETURNING …` is the concurrency
// barrier (R2 contract — single-statement atomicity narrowing from the
// original "same TX" wording; ratified by operator F2.c ruling and
// catalogued as a Catalog #43 recursive supervisor-brief-defect).
//
// ENV REQUIREMENTS (test skips when absent — no spurious CI failures):
//   VITE_SUPABASE_URL              — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY      — service-role secret
//   R2_LIVE=1                      — explicit opt-in, gates the live fire
//                                    against accidental batch-run inclusion
//                                    when a sibling test happens to load
//                                    `.env` into the same Deno process.
//
// Locally: `.env` is auto-loaded via the dotenv import below (Lovable
// edge-function-testing convention).

import 'https://deno.land/std@0.224.0/dotenv/load.ts';
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const SUPABASE_URL = Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const LIVE_OPT_IN = Deno.env.get('R2_LIVE') === '1';

const ENV_READY = LIVE_OPT_IN && SUPABASE_URL.length > 0 && SERVICE_ROLE_KEY.length > 0;

const HEARTBEAT_ISSUER_CIK = '__heartbeat__';
const HEARTBEAT_ACCESSION_NUMBER = '__heartbeat__';

/** Run the exact claim shape `seedWorkItems` uses, against the live DB. */
async function claim(
  client: ReturnType<typeof createClient>,
  asOfDate: string,
  paddedUniverseCiks: string[],
  consumedAtIso: string,
) {
  const heartbeatExclusion =
    `issuer_cik.neq.${HEARTBEAT_ISSUER_CIK},` +
    `accession_number.neq.${HEARTBEAT_ACCESSION_NUMBER}`;
  return client
    .from('insider_accession_discovery_queue')
    .update({ consumed_at: consumedAtIso })
    .eq('as_of_date', asOfDate)
    .is('consumed_at', null)
    .in('issuer_cik', paddedUniverseCiks)
    .or(heartbeatExclusion)
    .select('issuer_cik, accession_number');
}

Deno.test({
  name: '(R2.1) two concurrent seedWorkItems claims → one wins N, one wins 0, sum = N (live DB)',
  ignore: !ENV_READY,
  fn: async () => {
    const clientA = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const clientB = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Fixture: 10 synthetic rows on a date far from any production
    // window. Use a unique correlation id so cleanup is precise even if
    // a previous run aborted before its cleanup.
    const asOfDate = '1990-01-02';
    const correlationId = crypto.randomUUID();
    const paddedCiks = Array.from({ length: 10 }, (_, i) =>
      String(900000000 + i).padStart(10, '0'),
    );
    const fixture = paddedCiks.map((cik, i) => ({
      as_of_date: asOfDate,
      issuer_cik: cik,
      accession_number: `${cik}-90-${String(i).padStart(6, '0')}`,
      form_type: '4',
      company_name: 'R2-CONCURRENT-CLAIM-FIXTURE',
      filename: `edgar/data/${cik}/${i}.txt`,
      discovered_by: 'r2-concurrent-claim-test',
      discovery_correlation_id: correlationId,
    }));

    try {
      // Pre-clean any stale rows from prior aborted runs (matched by
      // the well-known company_name marker).
      await clientA
        .from('insider_accession_discovery_queue')
        .delete()
        .eq('as_of_date', asOfDate)
        .eq('company_name', 'R2-CONCURRENT-CLAIM-FIXTURE');

      const { error: insertErr } = await clientA
        .from('insider_accession_discovery_queue')
        .insert(fixture);
      assertEquals(insertErr, null, `fixture insert failed: ${insertErr?.message ?? ''}`);

      const consumedAtIso = '2026-06-13T20:00:00.000Z';
      const [resA, resB] = await Promise.allSettled([
        claim(clientA, asOfDate, paddedCiks, consumedAtIso),
        claim(clientB, asOfDate, paddedCiks, consumedAtIso),
      ]);

      assertEquals(resA.status, 'fulfilled', `client A claim rejected: ${(resA as { reason?: unknown }).reason ?? ''}`);
      assertEquals(resB.status, 'fulfilled', `client B claim rejected: ${(resB as { reason?: unknown }).reason ?? ''}`);

      const dataA = (resA as PromiseFulfilledResult<{ data: unknown[] | null; error: unknown }>).value.data ?? [];
      const dataB = (resB as PromiseFulfilledResult<{ data: unknown[] | null; error: unknown }>).value.data ?? [];

      const lenA = dataA.length;
      const lenB = dataB.length;

      // R2 property: disjoint outcome.
      assertEquals(lenA + lenB, fixture.length, `sum (${lenA}+${lenB}) must equal fixture size ${fixture.length} — no rows lost, no rows double-claimed`);
      const winnerWonAll = (lenA === fixture.length && lenB === 0) || (lenB === fixture.length && lenA === 0);
      assert(
        winnerWonAll,
        `expected exactly one client to claim all ${fixture.length} rows and the other 0; ` +
          `got A=${lenA} B=${lenB}`,
      );

      // Sequential follow-up against the now-fully-consumed pool returns 0.
      const tail = await claim(clientA, asOfDate, paddedCiks, consumedAtIso);
      assertEquals((tail.data ?? []).length, 0, 'pool fully consumed → follow-up claim returns 0');
    } finally {
      // Idempotent cleanup — keyed by the unique correlation id so we
      // never disturb production rows.
      await clientA
        .from('insider_accession_discovery_queue')
        .delete()
        .eq('discovery_correlation_id', correlationId);
    }
  },
});