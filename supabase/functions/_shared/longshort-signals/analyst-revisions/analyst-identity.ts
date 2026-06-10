/**
 * analyst-identity — DEC-055 §(f) normalization + same-analyst prior recovery
 * for Signal #1 (Analyst Revision Drift, CROSSWIND §4.4.5).
 *
 * Per FP-047 Phase 0 closed-with-revision (Branch A+H, Option 2 — true
 * revision deltas): a focal revision event is paired with its most recent
 * SAME-ANALYST prior target from per-symbol history. Without a prior, the
 * event yields a typed skip (`revision_prior_unavailable`); we do NOT
 * fabricate magnitude from `(priceTarget - priceWhenPosted)` as a fallback
 * (the semantic-drift hazard surfaced by the NKE probe — implied-upside
 * is not revision-direction).
 *
 * Match policy (DEC-055 §(f), strict — phantom-prior prevention):
 *   - Normalize `analystName` AND `analystCompany` by `toLowerCase()` then
 *     strip every non-alphanumeric character (whitespace, punctuation,
 *     accents collapsed by the alnum-only filter).
 *   - A match requires BOTH normalized fields equal AND `analystName`
 *     non-empty on BOTH the focal AND the candidate row.
 *   - Empty-name rows NEVER match anything. No firm-only fallback in v1.
 *     This is the canonical DDOG-shaped hazard: history with firm-matched
 *     rows but empty `analystName` MUST NOT be returned as a prior.
 *
 * Window policy:
 *   - Strictly BEFORE the focal `publishedDate` (equal-timestamp rows are
 *     excluded — a row at exactly the focal moment is the focal event
 *     itself, not a prior).
 *   - Maximum age 365 calendar days; the boundary is exclusive (a row
 *     exactly 366d old is excluded; 365d is included).
 *
 * Owner: longshort (FP-047 Phase 1 — Signal #1)
 * Classification: shared infrastructure — pure normalization + selection,
 * no I/O, no wall-clock.
 */

export interface RawPriceTargetRow {
  symbol: string;
  publishedDate: string;
  analystName: string;
  analystCompany: string;
  priceTarget: number | null;
  adjPriceTarget: number | null;
  priceWhenPosted: number | null;
  newsTitle: string;
}

export interface NormalizedAnalystKey {
  name: string;
  company: string;
}

/**
 * Reason discriminator for a typed-absent prior. Diagnostic detail only;
 * the orchestrator collapses all absences to `revision_prior_unavailable`
 * per DEC-055 §(g).
 */
export type PriorAbsenceReason =
  | 'empty_focal_analyst'  // focal row itself has empty analystName — can never match
  | 'no_history_match'     // history scanned, no same-analyst row in window
  | 'beyond_window';       // candidates exist but all > 365d before focal

export type FindPriorResult =
  | { kind: 'found'; row: RawPriceTargetRow; ageDays: number }
  | { kind: 'absent'; reason: PriorAbsenceReason };

const MAX_PRIOR_AGE_DAYS = 365;
const MS_PER_DAY = 86_400_000;

/** Normalize a single (name, company) pair per DEC-055 §(f). */
export function normalizeAnalystKey(
  analystName: string,
  analystCompany: string,
): NormalizedAnalystKey {
  return {
    name: stripNonAlnumLower(analystName),
    company: stripNonAlnumLower(analystCompany),
  };
}

function stripNonAlnumLower(s: string): string {
  if (typeof s !== 'string') return '';
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * True iff two keys match AND the analyst-name slot is non-empty on BOTH
 * sides. Empty-name rows match nothing — phantom-prior prevention.
 */
export function analystKeysEqual(
  a: NormalizedAnalystKey,
  b: NormalizedAnalystKey,
): boolean {
  if (a.name === '' || b.name === '') return false;
  return a.name === b.name && a.company === b.company;
}

/**
 * Parse an FMP `publishedDate` string into a UTC millisecond timestamp.
 * Accepts the two observed shapes from the Phase-0 probe:
 *   - 'YYYY-MM-DD HH:MM:SS' (space-separated; default for the news endpoints)
 *   - 'YYYY-MM-DDTHH:MM:SS[.fff][Z]' (ISO; defensive)
 *   - 'YYYY-MM-DD' (date-only; defensive)
 * Returns `NaN` on any unparseable input — caller filters.
 *
 * No wall-clock surface: `Date` is only used as a string parser here
 * (explicit-arg constructor; the wall-clock check's `requireLiteralEmpty`
 * discriminator correctly suppresses this).
 */
export function parseFmpDate(s: string): number {
  if (typeof s !== 'string' || s.length < 10) return NaN;
  let iso: string;
  if (s.length === 10) {
    iso = s + 'T00:00:00Z';
  } else if (s.includes('T')) {
    iso = s.endsWith('Z') ? s : s + 'Z';
  } else {
    iso = s.replace(' ', 'T') + 'Z';
  }
  return Date.parse(iso);
}

/**
 * Find the most recent same-analyst prior target for `focal` within the
 * 365-day window, strictly before `focal.publishedDate`. Returns the row
 * plus its age in days, or a typed absence.
 */
export function findSameAnalystPrior(
  focal: RawPriceTargetRow,
  history: ReadonlyArray<RawPriceTargetRow>,
): FindPriorResult {
  const focalKey = normalizeAnalystKey(focal.analystName, focal.analystCompany);
  if (focalKey.name === '') {
    return { kind: 'absent', reason: 'empty_focal_analyst' };
  }

  const focalMs = parseFmpDate(focal.publishedDate);
  if (!Number.isFinite(focalMs)) {
    return { kind: 'absent', reason: 'no_history_match' };
  }
  const windowFloorMs = focalMs - MAX_PRIOR_AGE_DAYS * MS_PER_DAY;

  let best: RawPriceTargetRow | null = null;
  let bestMs = -Infinity;
  let anyKeyMatch = false;
  let anyInWindow = false;

  for (const cand of history) {
    const candKey = normalizeAnalystKey(cand.analystName, cand.analystCompany);
    if (!analystKeysEqual(focalKey, candKey)) continue;
    anyKeyMatch = true;
    const candMs = parseFmpDate(cand.publishedDate);
    if (!Number.isFinite(candMs)) continue;
    // Strictly BEFORE the focal moment.
    if (candMs >= focalMs) continue;
    // Window floor INCLUSIVE: candMs >= windowFloorMs (i.e. age <= 365d).
    if (candMs < windowFloorMs) continue;
    anyInWindow = true;
    if (candMs > bestMs) {
      bestMs = candMs;
      best = cand;
    }
  }

  if (best === null) {
    if (anyKeyMatch && !anyInWindow) {
      return { kind: 'absent', reason: 'beyond_window' };
    }
    return { kind: 'absent', reason: 'no_history_match' };
  }
  const ageDays = (focalMs - bestMs) / MS_PER_DAY;
  return { kind: 'found', row: best, ageDays };
}