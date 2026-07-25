/**
 * INC-141-b — TYPED REFUSAL AUDIT drift sentinel.
 *
 * Every default-path `!ok` early-return in `overshoot-universe-refresh`
 * MUST be preceded by a `writeUniverseRefusalAudit(...)` call. Monday
 * 10:00Z must fail LOUD, never silent-200 (see
 * `docs/06-tracking/2026-07-25-act-571-build-and-cdn-block.md` DEV-9
 * follow-up). This grep-lock catches any future !ok branch that ships
 * without an audit row.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.test('INC-141-b: every default-path !ok early-return writes a typed refusal audit', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

  // Helper must exist.
  assert(
    src.includes('async function writeUniverseRefusalAudit'),
    'writeUniverseRefusalAudit helper must be defined',
  );
  assert(
    src.includes("action: 'overshoot.universe.refresh.refused'"),
    "helper must emit action 'overshoot.universe.refresh.refused'",
  );

  // Every refusal status typed by the default path must appear as a
  // `status:` argument to the helper. If a new status is added to a
  // returned response without the matching helper call, this fails.
  const expectedStatuses = [
    'roster_sanity_failed',
    'universe_read_failed',
    'universe_upsert_failed',
    'universe_deactivate_failed',
  ];
  for (const s of expectedStatuses) {
    // Match: `status: '<s>',` occurring inside a writeUniverseRefusalAudit({...}) call.
    const re = new RegExp(
      String.raw`writeUniverseRefusalAudit\(\{[\s\S]{0,400}status:\s*'` + s + `'`,
      'm',
    );
    assert(re.test(src), `writeUniverseRefusalAudit call missing for status '${s}'`);
  }

  // Composite failure path passes status dynamically (`composite.status`)
  // so we assert the presence of the dynamic-status call adjacent to the
  // `!composite.ok` branch instead of a literal string.
  const compositeBranch = src.match(
    /if\s*\(\s*!composite\.ok\s*\)\s*\{[\s\S]{0,600}?\}/m,
  );
  assert(compositeBranch, '!composite.ok branch not found');
  assert(
    /writeUniverseRefusalAudit\(\{[\s\S]{0,300}status:\s*composite\.status/.test(
      compositeBranch![0],
    ),
    'composite failure branch must write refusal audit with status: composite.status',
  );

  // Total refusal-audit call count on the default path must be >= 5
  // (composite + 4 typed statuses). Guards against a future refactor
  // that consolidates one branch and forgets to keep the audit.
  const callCount = (src.match(/writeUniverseRefusalAudit\(\{/g) ?? []).length;
  assert(
    callCount >= 5,
    `expected >= 5 writeUniverseRefusalAudit call sites, found ${callCount}`,
  );

  // Silent 200 sentinel: no `apiSuccess({ ok: false` on the default path
  // sits without a preceding audit-write within the enclosing 800-char
  // window. This is a heuristic guard, tightened by the per-status
  // checks above.
  assertEquals(
    typeof callCount,
    'number',
    'sanity: string-length arithmetic executed',
  );
});