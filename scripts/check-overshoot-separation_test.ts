import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { scanFile } from './check-overshoot-separation.ts';

Deno.test('overshoot file: allowlisted longshort leaf util → OK', () => {
  // FP-069 W1b (ACT-456): HttpFetch now overshoot-owned (./http-fetch.ts),
  // so the only remaining allowlisted longshort import is fetch-with-timeout.
  const v = scanFile(
    'supabase/functions/_shared/overshoot/polygon-daily-ohlcv-fetcher.ts',
    `import type { HttpFetch } from './http-fetch.ts';
     import { fetchWithTimeoutAndRetry } from '../longshort-universe/shared/fetch-with-timeout.ts';`,
  );
  assertEquals(v.length, 0);
});

Deno.test('overshoot file: PREVIOUSLY-allowlisted interfaces.ts now → violation', () => {
  // W1b tightening: importing HttpFetch from the longshort interfaces module
  // is no longer allowed — must use the overshoot-owned redeclaration.
  const v = scanFile(
    'supabase/functions/_shared/overshoot/polygon-daily-ohlcv-fetcher.ts',
    `import type { HttpFetch } from '../longshort-universe-interfaces.ts';`,
  );
  assertEquals(v.length, 1);
});

Deno.test('overshoot file: ratified-but-not-listed leaf (z-score-normalize) → violation', () => {
  // FP-069 W1b turn-2: proves narrower-than-charter posture. `z-score-normalize`
  // is a ratified charter leaf but is NOT pre-listed in A3_ALLOWLIST; the guard
  // therefore REJECTS an overshoot import of it. The intended remediation is
  // to add it to the allowlist in the SAME PR that introduces the first genuine
  // overshoot import of the util, citing the charter clause.
  const v = scanFile(
    'supabase/functions/_shared/overshoot/some-consumer.ts',
    `import { zScoreNormalize } from '../longshort-signals/shared/z-score-normalize.ts';`,
  );
  assertEquals(v.length, 1);
});

Deno.test('overshoot file: NON-allowlisted longshort import → violation', () => {
  const v = scanFile(
    'supabase/functions/_shared/overshoot/bad.ts',
    `import { computeMomentum } from '../longshort-signals/cross-sectional-momentum/momentum-orchestrator.ts';`,
  );
  assertEquals(v.length, 1);
  assertEquals(v[0].line, 1);
});

Deno.test('longshort file: importing overshoot → violation', () => {
  const v = scanFile(
    'supabase/functions/longshort-momentum-compute/index.ts',
    `import { X } from '../_shared/overshoot/polygon-daily-ohlcv-fetcher.ts';`,
  );
  assertEquals(v.length, 1);
});

Deno.test('unrelated file: no matches → OK', () => {
  const v = scanFile(
    'src/pages/PortfolioHubPage.tsx',
    `import * as React from 'react';`,
  );
  assertEquals(v.length, 0);
});

Deno.test('overshoot function directory recognized', () => {
  const v = scanFile(
    'supabase/functions/overshoot-backfill-bars-manual/index.ts',
    `import { X } from '../_shared/longshort-signals/foo.ts';`,
  );
  assertEquals(v.length, 1);
});