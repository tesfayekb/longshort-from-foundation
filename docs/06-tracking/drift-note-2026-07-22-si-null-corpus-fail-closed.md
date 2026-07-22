# Drift Note — SI NULL-corpus semantics (caught pre-deploy, 2026-07-22)

**Class**: approved-plan drift (fail-open direction).
**Detected**: clone verification of the DEC-504-4 wire, before deploy.
**Runtime exposure**: ZERO — patch had not been rolled out.

## What drifted

Landed `siStaleActive(asOf, null, maxDays)` returned **FALSE** ("safe fresh
default; T1 fail-open"), and the writer tests pinned that inversion at
`sleeve-reallocation-writer_test.ts:34` and `:64`. The approved DEC-504-4 §7
ratifies **NULL corpus → stale (fail-closed)** and requires a NULL→40/0
construction test.

## Fix

- `_shared/overshoot/si-freshness.ts` — `siStaleActive` NULL branch flipped
  to `return true`; header rationale updated to cite sibling precedent
  (analyst/M&A freshness fail-closed; book-level belt is first, per-ticker
  `si_unavailable` is second).
- `_shared/overshoot/sleeve-reallocation-writer.ts` — reason union widened
  to `'si_stale_active' | 'si_corpus_absent' | 'si_freshness_restored'`;
  the audit row now names WHICH degradation fired.
- `overshoot-detection-run/index.ts` — engage-transition reason resolves
  to `si_corpus_absent` when `freshestSiAsOfDate === null`, else
  `si_stale_active`.
- Tests: `sleeve-reallocation-writer_test.ts:34` flipped; `:64`
  construction case rewritten to assert NULL → 40/0 fail-closed;
  `si-freshness_test.ts:33` flipped; symmetry comment at `:113` updated
  to note the analyst-guard NULL semantics is pre-existing and no longer
  parallel.

## Sequencing

Everything else stands: deploy held until tonight's 22:00Z receipts land
under H-a. Maiden flight Thursday 22:00Z, emitted iff still-stale;
disengaged-first branch equally pre-committed. HK-001 deletion note
accepted.
