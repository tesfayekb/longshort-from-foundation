/**
 * Catalyst keyword + verb-gate maps — Signal #9 / FP-049 Phase 1 commit 1b.
 *
 * Authority: DEC-057 §(b) + §(j).
 * §(b): "Minimum-keyword set with action-verb gate is mandatory — 'guidance'
 *       alone is NOT an event; 'raises guidance' + a numeric description-
 *       field match IS." Named misclassification risk on every keyword-
 *       derived row (`source:'keyword'`); Tier-3 weighting partially
 *       absorbs false positives; Phase-7 IC ablation arbitrates reweighting.
 * §(j): Both maps are FROZEN at Phase 1 with operator audit; the maps
 *       land verbatim in `docs/04-modules/longshort/signals/active-
 *       catalyst-flag.md` at the Phase-1 commit for audit (the doc itself
 *       is created at Phase 3 per the DEC-057 Affected-Modules paragraph —
 *       this file IS the operator-audit surface until then).
 *
 * Scope: KEYWORD-FAMILY event types ONLY (per §(g) IN-set). The structured
 * families (earnings/ma/splits/dividend_change/analyst_rating/fda_advisory)
 * have AUTHORITATIVE endpoint primaries; they do NOT consume this map.
 *
 * NO wall-clock; pure data; no string-mutation outside the classifier
 * (this file just exports the frozen lookup tables).
 *
 * Owner: longshort (FP-049 Phase 1 — Signal #9 commit 1b)
 */
import type { CatalystEventType } from './catalyst-types.ts';

/** §(g) keyword-derived families. Subset of the 10-type IN-set. */
export type CatalystKeywordEventType = Extract<
  CatalystEventType,
  'executive_change' | 'guidance' | 'regulatory_action' | 'partnership'
>;

/**
 * §(j) frozen minimum-keyword set. Conservative v1 — false-positive
 * containment beats recall. Every term is lower-case; the matcher
 * lower-cases the candidate text once. Multi-word terms (e.g.
 * "chief executive") are substring-matched so word-boundary issues
 * (apostrophes, punctuation) do not silently drop a hit.
 */
export const CATALYST_KEYWORDS: Readonly<
  Record<CatalystKeywordEventType, ReadonlyArray<string>>
> = Object.freeze({
  executive_change: Object.freeze([
    'ceo',
    'cfo',
    'chief executive',
    'chief financial',
    'president',
    'chairman',
  ]),
  guidance: Object.freeze([
    'guidance',
    'outlook',
    'forecast',
  ]),
  regulatory_action: Object.freeze([
    'sec',
    'doj',
    'ftc',
    'investigation',
    'subpoena',
    'consent decree',
    'settlement',
  ]),
  partnership: Object.freeze([
    'partnership',
    'collaboration',
    'strategic alliance',
    'joint venture',
  ]),
});

/**
 * §(b) action-verb gate. Mandatory companion to `CATALYST_KEYWORDS`:
 * the noun match is NECESSARY but NOT SUFFICIENT — at least one verb
 * MUST also match the same text. This is the §(b) named highest-impact
 * false-positive control.
 *
 * `guidance` additionally requires a numeric token (see
 * `GUIDANCE_NUMERIC_PATTERN`) per §(b) verbatim.
 */
export const CATALYST_VERB_GATE: Readonly<
  Record<CatalystKeywordEventType, ReadonlyArray<string>>
> = Object.freeze({
  executive_change: Object.freeze([
    'appoints',
    'appointed',
    'names',
    'named',
    'resigns',
    'resigned',
    'departs',
    'departed',
    'steps down',
    'stepped down',
    'fired',
    'terminated',
    'replaces',
    'replaced',
    'succeeds',
  ]),
  guidance: Object.freeze([
    'raises',
    'raised',
    'lowers',
    'lowered',
    'cuts',
    'cut',
    'withdraws',
    'withdrew',
    'reaffirms',
    'reaffirmed',
    'guides',
    'updates',
    'updated',
  ]),
  regulatory_action: Object.freeze([
    'investigates',
    'investigating',
    'subpoenas',
    'subpoenaed',
    'fined',
    'fines',
    'charges',
    'charged',
    'sues',
    'sued',
    'settles',
    'settled',
    'orders',
    'ordered',
  ]),
  partnership: Object.freeze([
    'announces',
    'announced',
    'signs',
    'signed',
    'enters',
    'entered',
    'forms',
    'formed',
    'partners',
  ]),
});

/**
 * §(b) numeric-token gate for `guidance` ONLY. A digit-bearing token must
 * appear in the candidate text alongside a guidance noun + verb. Allows
 * currency symbols and percent signs adjacent to digits. Per-spec literal:
 * "'raises guidance' + a numeric description-field match IS [an event]".
 */
export const GUIDANCE_NUMERIC_PATTERN = /\d/;

/**
 * Sanity check called by the classifier on cold start to fail loudly if
 * a future patch desyncs the two maps (a noun family without verbs, or
 * vice versa, would silently collapse all matches → 0 events).
 */
export function assertKeywordMapsConsistent(): void {
  const nounKeys = Object.keys(CATALYST_KEYWORDS).sort();
  const verbKeys = Object.keys(CATALYST_VERB_GATE).sort();
  if (nounKeys.length !== verbKeys.length ||
      nounKeys.some((k, i) => k !== verbKeys[i])) {
    throw new Error(
      `catalyst-keywords: noun/verb map key mismatch — nouns=[${nounKeys.join(',')}] verbs=[${verbKeys.join(',')}]`,
    );
  }
  for (const family of nounKeys) {
    const nouns = CATALYST_KEYWORDS[family as CatalystKeywordEventType];
    const verbs = CATALYST_VERB_GATE[family as CatalystKeywordEventType];
    if (nouns.length === 0 || verbs.length === 0) {
      throw new Error(
        `catalyst-keywords: family '${family}' has empty noun or verb list (nouns=${nouns.length}, verbs=${verbs.length}) — gate would silently drop all events`,
      );
    }
  }
}

/** Iteration helper so the classifier does not hard-code the family list. */
export const CATALYST_KEYWORD_FAMILIES: ReadonlyArray<CatalystKeywordEventType> =
  Object.freeze(Object.keys(CATALYST_KEYWORDS) as CatalystKeywordEventType[]);

// Fail fast at module load if a future patch desyncs the maps.
assertKeywordMapsConsistent();