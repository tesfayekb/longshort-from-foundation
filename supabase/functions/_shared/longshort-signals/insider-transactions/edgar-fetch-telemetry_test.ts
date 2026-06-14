/**
 * Co-located type-home assertion for EdgarPathFamily union.
 *
 * Catalog #46 — type-home-extension forward-binding rule:
 * adding a discriminator value at a value-site (e.g. an event emit with
 * path_family: 'submissions') REQUIRES extending the type's union
 * definition in the same commit. The value-site and the type-home are a
 * triple-edit pair (union member + persist seed + persist test).
 *
 * Gate is build-time, not runtime: Deno's structural typing accepts the
 * file at runtime even with type errors, so the assertion below is a
 * compile-time check that 'submissions' is assignable to EdgarPathFamily.
 */
import type { EdgarPathFamily } from './edgar-fetch-telemetry.ts';

Deno.test('EdgarPathFamily union includes submissions (compile-time)', () => {
  const v: EdgarPathFamily = 'submissions';
  if (v !== 'submissions') throw new Error('unreachable');
});

Deno.test('EdgarPathFamily union still includes prior members (compile-time)', () => {
  const members: EdgarPathFamily[] = [
    'company_tickers',
    'master_index',
    'accession_index',
    'form4_xml',
    'submissions',
  ];
  if (members.length !== 5) throw new Error('member count drift');
});