#!/usr/bin/env -S deno run --allow-net --allow-env --allow-run

/**
 * check-deployed-sha — F2-pre verifier: prove deployed-HEAD == source-HEAD.
 *
 * Per ai-failure-modes §22.8.5 (deploy-replay-lag) catalogued from the
 * FP-050 Phase 4 stale-bundle false start (run `bbe882e3`, post-F1
 * source HEAD `4e5236ae`, deployed runtime served the pre-F1 `form.idx`
 * URL because the previous isolate was still alive). Every F2
 * verification step downstream depends on knowing the runtime is
 * actually executing the source HEAD whose attestation block was just
 * produced. Without this gate, a green attestation block + a stale
 * isolate compose to a false-green at the next live fire.
 *
 * Mechanism:
 *   1. Read the source HEAD via `git rev-parse HEAD` (long SHA).
 *   2. CORS-preflight (OPTIONS) the target edge-function URL — no auth,
 *      no rate-limit concern, no body to parse, every handler responds
 *      via the shared `createHandler` envelope and stamps `x-build-sha`.
 *   3. Compare the header value against the source HEAD.
 *
 * Outcomes (typed-Optional discipline; no phantom defaults):
 *   - MATCH  → exit 0  (`deployed=<sha> source=<sha> MATCH`)
 *   - MISMATCH → exit 1 (`deployed=<sha> source=<sha> MISMATCH`)
 *   - HEADER_MISSING → exit 2 (`deployed=<none> source=<sha> HEADER_MISSING`)
 *     Distinct from MISMATCH: a missing header means the deployment did
 *     not declare a build SHA at all (BUILD_SHA env var unset at deploy
 *     time) — actionable as "fix the deploy pipeline", not as "redeploy".
 *   - SCRIPT_ERROR → exit 3 (network failure, git unavailable, etc.;
 *     reported with the verbatim error reason for forensics).
 *
 * The 4-outcome design is deliberate: a 2-outcome script (PASS/FAIL)
 * would collapse the HEADER_MISSING and MISMATCH cases, hiding the
 * deployment-pipeline configuration defect behind a redeploy loop.
 *
 * Usage:
 *   deno run --allow-net --allow-env --allow-run scripts/check-deployed-sha.ts \
 *     --function-url=https://<ref>.supabase.co/functions/v1/<fn>
 *
 * The script intentionally uses OPTIONS (CORS preflight) rather than a
 * GET/POST to a real endpoint: OPTIONS bypasses auth, rate-limiting,
 * body parsing, and side effects — it is the cheapest possible probe
 * that still exercises the shared handler envelope. Any edge function
 * wired via `_shared/handler.ts createHandler` answers it.
 *
 * Owner: governance (FP-050 Phase 4 F2-pre; ACT-201).
 */

export type CheckOutcome =
  | { kind: 'MATCH'; sourceSha: string; deployedSha: string }
  | { kind: 'MISMATCH'; sourceSha: string; deployedSha: string }
  | { kind: 'HEADER_MISSING'; sourceSha: string }
  | { kind: 'SCRIPT_ERROR'; reason: string };

export interface CheckOptions {
  functionUrl: string;
  /** Override `git rev-parse HEAD` (test-injection). */
  readSourceSha?: () => Promise<string | null>;
  /** Override the OPTIONS fetch (test-injection). */
  readDeployedSha?: (functionUrl: string) => Promise<string | null>;
}

/** Read the local source HEAD via `git rev-parse HEAD`. Returns null on failure. */
export async function readSourceShaFromGit(): Promise<string | null> {
  try {
    const cmd = new Deno.Command('git', {
      args: ['rev-parse', 'HEAD'],
      stdout: 'piped',
      stderr: 'piped',
    });
    const { code, stdout } = await cmd.output();
    if (code !== 0) return null;
    const trimmed = new TextDecoder().decode(stdout).trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * CORS-preflight the target URL; return the `x-build-sha` header value or null.
 * A null return = header absent OR fetch failed; the caller distinguishes via
 * the exception path (caller wraps in try/catch and routes to SCRIPT_ERROR).
 */
export async function readDeployedShaFromOptions(functionUrl: string): Promise<string | null> {
  const res = await fetch(functionUrl, {
    method: 'OPTIONS',
    headers: { 'origin': 'https://check-deployed-sha.local' },
  });
  // Drain body — Deno resource-leak hygiene (matches edge-function-testing rule).
  await res.text();
  const header = res.headers.get('x-build-sha');
  if (header === null) return null;
  const trimmed = header.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Pure decision function — fully test-injectable. */
export async function checkDeployedSha(opts: CheckOptions): Promise<CheckOutcome> {
  const readSrc = opts.readSourceSha ?? readSourceShaFromGit;
  const readDep = opts.readDeployedSha ?? readDeployedShaFromOptions;

  let sourceSha: string | null;
  try {
    sourceSha = await readSrc();
  } catch (e) {
    return { kind: 'SCRIPT_ERROR', reason: `source-sha read failed: ${(e as Error).message}` };
  }
  if (sourceSha === null) {
    return { kind: 'SCRIPT_ERROR', reason: 'source-sha read returned null (git unavailable?)' };
  }

  let deployedSha: string | null;
  try {
    deployedSha = await readDep(opts.functionUrl);
  } catch (e) {
    return { kind: 'SCRIPT_ERROR', reason: `deployed-sha fetch failed: ${(e as Error).message}` };
  }
  if (deployedSha === null) {
    return { kind: 'HEADER_MISSING', sourceSha };
  }

  if (deployedSha === sourceSha) {
    return { kind: 'MATCH', sourceSha, deployedSha };
  }
  return { kind: 'MISMATCH', sourceSha, deployedSha };
}

/** Render a one-line operator-readable summary for the outcome. */
export function renderOutcome(o: CheckOutcome): string {
  switch (o.kind) {
    case 'MATCH':
      return `check-deployed-sha: MATCH deployed=${o.deployedSha} source=${o.sourceSha}`;
    case 'MISMATCH':
      return `check-deployed-sha: MISMATCH deployed=${o.deployedSha} source=${o.sourceSha}`;
    case 'HEADER_MISSING':
      return `check-deployed-sha: HEADER_MISSING deployed=<none> source=${o.sourceSha}`;
    case 'SCRIPT_ERROR':
      return `check-deployed-sha: SCRIPT_ERROR ${o.reason}`;
  }
}

/** Map outcome to exit code per the §22.8.5 four-outcome contract. */
export function outcomeToExitCode(o: CheckOutcome): number {
  switch (o.kind) {
    case 'MATCH': return 0;
    case 'MISMATCH': return 1;
    case 'HEADER_MISSING': return 2;
    case 'SCRIPT_ERROR': return 3;
  }
}

function parseArgs(argv: readonly string[]): { functionUrl: string | null; error: string | null } {
  let functionUrl: string | null = null;
  for (const a of argv) {
    if (a.startsWith('--function-url=')) {
      const v = a.slice('--function-url='.length).trim();
      if (v.length > 0) functionUrl = v;
    }
  }
  if (functionUrl === null) {
    return { functionUrl: null, error: 'missing required flag --function-url=<https://...>' };
  }
  return { functionUrl, error: null };
}

if (import.meta.main) {
  const parsed = parseArgs(Deno.args);
  if (parsed.error !== null || parsed.functionUrl === null) {
    console.error(`check-deployed-sha: ${parsed.error ?? 'argument parse failure'}`);
    Deno.exit(3);
  }
  const outcome = await checkDeployedSha({ functionUrl: parsed.functionUrl });
  console.log(renderOutcome(outcome));
  Deno.exit(outcomeToExitCode(outcome));
}

export { parseArgs };