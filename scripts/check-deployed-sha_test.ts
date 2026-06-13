/**
 * Unit tests for `check-deployed-sha` (F2-pre / ACT-201).
 *
 * Covers all four outcome branches of the §22.8.5 contract — MATCH,
 * MISMATCH, HEADER_MISSING, SCRIPT_ERROR — plus the argument-parse path
 * and the outcome→exit-code mapping. No network, no git: every test
 * injects `readSourceSha` and `readDeployedSha` overrides so the suite
 * is hermetic and runs under the same `deno test` invocation as Gates
 * 2 / 2b in the four-gate attestation block.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  checkDeployedSha,
  outcomeToExitCode,
  parseArgs,
  renderOutcome,
} from './check-deployed-sha.ts';

const SHA_A = '4e5236ae0bb3adc7f5e2f888173d26e13364bc42';
const SHA_B = 'deadbeefcafebabe0123456789abcdef01234567';

Deno.test('MATCH — deployed SHA equals source SHA → exit 0', async () => {
  const outcome = await checkDeployedSha({
    functionUrl: 'https://example.test/functions/v1/probe',
    readSourceSha: () => Promise.resolve(SHA_A),
    readDeployedSha: () => Promise.resolve(SHA_A),
  });
  assertEquals(outcome.kind, 'MATCH');
  assertEquals(outcomeToExitCode(outcome), 0);
  assertEquals(
    renderOutcome(outcome),
    `check-deployed-sha: MATCH deployed=${SHA_A} source=${SHA_A}`,
  );
});

Deno.test('MISMATCH — deployed SHA differs from source SHA → exit 1', async () => {
  const outcome = await checkDeployedSha({
    functionUrl: 'https://example.test/functions/v1/probe',
    readSourceSha: () => Promise.resolve(SHA_A),
    readDeployedSha: () => Promise.resolve(SHA_B),
  });
  assertEquals(outcome.kind, 'MISMATCH');
  assertEquals(outcomeToExitCode(outcome), 1);
  assertEquals(
    renderOutcome(outcome),
    `check-deployed-sha: MISMATCH deployed=${SHA_B} source=${SHA_A}`,
  );
});

Deno.test('HEADER_MISSING — runtime omitted x-build-sha → exit 2 (distinct from MISMATCH)', async () => {
  const outcome = await checkDeployedSha({
    functionUrl: 'https://example.test/functions/v1/probe',
    readSourceSha: () => Promise.resolve(SHA_A),
    readDeployedSha: () => Promise.resolve(null),
  });
  assertEquals(outcome.kind, 'HEADER_MISSING');
  assertEquals(outcomeToExitCode(outcome), 2);
  assertEquals(
    renderOutcome(outcome),
    `check-deployed-sha: HEADER_MISSING deployed=<none> source=${SHA_A}`,
  );
});

Deno.test('SCRIPT_ERROR — git unavailable (source-sha null) → exit 3', async () => {
  const outcome = await checkDeployedSha({
    functionUrl: 'https://example.test/functions/v1/probe',
    readSourceSha: () => Promise.resolve(null),
    readDeployedSha: () => Promise.resolve(SHA_A),
  });
  assertEquals(outcome.kind, 'SCRIPT_ERROR');
  assertEquals(outcomeToExitCode(outcome), 3);
});

Deno.test('SCRIPT_ERROR — fetch throws (network failure) → exit 3 with verbatim reason', async () => {
  const outcome = await checkDeployedSha({
    functionUrl: 'https://example.test/functions/v1/probe',
    readSourceSha: () => Promise.resolve(SHA_A),
    readDeployedSha: () => Promise.reject(new Error('connection refused')),
  });
  assertEquals(outcome.kind, 'SCRIPT_ERROR');
  assertEquals(outcomeToExitCode(outcome), 3);
  if (outcome.kind === 'SCRIPT_ERROR') {
    assertEquals(
      outcome.reason,
      'deployed-sha fetch failed: connection refused',
    );
  }
});

Deno.test('parseArgs — accepts --function-url= and rejects missing flag', () => {
  const ok = parseArgs(['--function-url=https://x.test/functions/v1/f']);
  assertEquals(ok.functionUrl, 'https://x.test/functions/v1/f');
  assertEquals(ok.error, null);

  const bad = parseArgs([]);
  assertEquals(bad.functionUrl, null);
  assertEquals(
    bad.error,
    'missing required flag --function-url=<https://...>',
  );
});

Deno.test('outcomeToExitCode — covers all four kinds (compile-time exhaustiveness)', () => {
  assertEquals(outcomeToExitCode({ kind: 'MATCH', sourceSha: 's', deployedSha: 'd' }), 0);
  assertEquals(outcomeToExitCode({ kind: 'MISMATCH', sourceSha: 's', deployedSha: 'd' }), 1);
  assertEquals(outcomeToExitCode({ kind: 'HEADER_MISSING', sourceSha: 's' }), 2);
  assertEquals(outcomeToExitCode({ kind: 'SCRIPT_ERROR', reason: 'r' }), 3);
});