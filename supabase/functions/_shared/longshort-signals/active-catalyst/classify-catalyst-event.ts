/**
 * classify-catalyst-event — Signal #9 / FP-049 Phase 1 commit 1b.
 *
 * Authority: DEC-057 §(b) keyword-derivation + action-verb gate;
 * §(d) look-ahead gate (OCCURRED-ONLY); §(h) 1h-bucket cross-vendor
 * dedup (FIRST-OCCURRENCE-WINS, vendor precedence: structured > keyword).
 *
 * Inputs: (1) a per-row news-text contract (`CatalystNewsInput` —
 * Phase-3 orchestrator adapts Polygon news + FMP press-releases into
 * this shape; the classifier is decoupled from any specific vendor
 * surface), (2) the structured-fetcher rows already in
 * `RawCatalystEventInput` shape.
 *
 * Output: deduped `RawCatalystEventInput[]` carrying both source flavors
 * + the dedup counter so the Phase-2 compute + Phase-3 orchestrator can
 * surface `keyword_event_emitted` / `cross_vendor_duplicates_dropped` in
 * `signal_compute_log.metadata` per the §(h) discipline.
 *
 * NO wall-clock; NO cross-vendor enrichment per row; typed-absence only.
 *
 * Owner: longshort (FP-049 Phase 1 — Signal #9 commit 1b)
 */
import {
  applyLookAheadGate,
  applyWindowLowerBound,
  type RawCatalystEventInput,
} from './catalyst-types.ts';
import {
  CATALYST_KEYWORDS,
  CATALYST_KEYWORD_FAMILIES,
  CATALYST_VERB_GATE,
  GUIDANCE_NUMERIC_PATTERN,
  type CatalystKeywordEventType,
} from './catalyst-keywords.ts';

/**
 * News-row contract for the classifier. Vendor-agnostic by design —
 * Phase-3 orchestrator maps Polygon `/v2/reference/news` rows + FMP
 * `/stable/press-releases-latest` rows into this shape (and may concat
 * title + description into `text`). The classifier MUST NOT reach back
 * into vendor-specific fields.
 */
export interface CatalystNewsInput {
  /** Ticker the news row is attributed to. Universe-wide rows: '*'. */
  ticker: string;
  /** ISO-8601 UTC publish timestamp; used as the event_at for keyword rows. */
  published_utc: string;
  /** Concatenated title + description (or PR body excerpt); lower-casing internal. */
  text: string;
  /** Vendor that produced the row — used for §(h) dedup-vendor precedence. */
  vendor: 'fmp' | 'polygon';
}

export interface ClassifyOptions {
  /** §(d) look-ahead upper bound (event_at <= as_of). */
  as_of: Date;
  /** §4.4.9 trailing-5-trading-day lower bound. */
  window_start_at: Date;
}

export interface ClassifyResult {
  rows: RawCatalystEventInput[];
  /** §(b) noun-only matches dropped by the action-verb gate. */
  verb_gate_drops: number;
  /** §(b) guidance: noun+verb match dropped by the numeric-token gate. */
  numeric_gate_drops: number;
  /** §(h) cross-vendor dedup drops (1h bucket, first-wins). */
  cross_vendor_duplicates_dropped: number;
  /** §(d) look-ahead drops (combined across structured + keyword). */
  future_event_excluded: number;
}

/**
 * Word-boundary substring match. Required (NOT substring) because the
 * verb "partners" is a substring of the noun "partnership" — a plain
 * `String#includes` test would let every "partnership" text trivially
 * pass the verb gate. Multi-word phrases ("chief executive", "strategic
 * alliance") match naturally because `\b` anchors only at the outer
 * edges of the phrase. Terms are escaped to avoid regex-meta surprises.
 */
const RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;
function containsAny(haystackLower: string, needles: ReadonlyArray<string>): boolean {
  for (const n of needles) {
    const escaped = n.replace(RE_ESCAPE, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`);
    if (re.test(haystackLower)) return true;
  }
  return false;
}

/**
 * One-hour bucket for §(h) dedup. We round DOWN to the hour in UTC so two
 * events 59 minutes apart on either side of an hour boundary still
 * collapse correctly when they share the same hour-floor. The §(h) text
 * specifies "1-hour bucket" without prescribing rounding direction;
 * floor-to-hour is the conservative reading (collapses MORE, not fewer,
 * within-hour duplicates).
 */
function hourBucket(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso; // preserve as-is; will be excluded by gate
  return new Date(Math.floor(t / 3_600_000) * 3_600_000).toISOString();
}

function dedupKey(r: RawCatalystEventInput): string {
  return `${r.ticker}|${r.event_type}|${hourBucket(r.event_at)}`;
}

/** Vendor precedence per §(b)/(h): structured wins over keyword; within a tier, first-occurrence wins. */
function shouldReplace(existing: RawCatalystEventInput, candidate: RawCatalystEventInput): boolean {
  if (existing.source === candidate.source) return false; // first-occurrence-wins
  // existing is keyword, candidate is structured → upgrade.
  return existing.source === 'keyword' && candidate.source === 'structured';
}

/**
 * Apply the §(b) keyword + verb gate to a single news row, returning
 * the matched event family (or null) plus the gate-drop reason (for
 * counter telemetry). Numeric gate only applies to `guidance`.
 */
export interface KeywordMatch {
  family: CatalystKeywordEventType | null;
  /** When family is null, names which gate dropped the row (if any noun matched). */
  drop_reason: 'verb_gate' | 'numeric_gate' | null;
}

export function matchKeywordEvent(text: string): KeywordMatch {
  const lower = text.toLowerCase();
  for (const family of CATALYST_KEYWORD_FAMILIES) {
    const nouns = CATALYST_KEYWORDS[family];
    if (!containsAny(lower, nouns)) continue;
    const verbs = CATALYST_VERB_GATE[family];
    if (!containsAny(lower, verbs)) {
      return { family: null, drop_reason: 'verb_gate' };
    }
    if (family === 'guidance' && !GUIDANCE_NUMERIC_PATTERN.test(lower)) {
      return { family: null, drop_reason: 'numeric_gate' };
    }
    return { family, drop_reason: null };
  }
  return { family: null, drop_reason: null };
}

/**
 * Classify a batch of news rows + merge with structured-fetcher rows.
 * Returns deduped events + per-gate counters. Caller (Phase-3 orchestrator)
 * forwards counters into `signal_compute_log.metadata`.
 */
export function classifyCatalystEvents(
  structured: ReadonlyArray<RawCatalystEventInput>,
  news: ReadonlyArray<CatalystNewsInput>,
  opts: ClassifyOptions,
): ClassifyResult {
  let verb_gate_drops = 0;
  let numeric_gate_drops = 0;

  // 1) Promote each news row to a keyword RawCatalystEventInput when gated through.
  const keywordCandidates: RawCatalystEventInput[] = [];
  for (const n of news) {
    if (typeof n.text !== 'string' || n.text.length === 0) continue;
    if (typeof n.ticker !== 'string' || n.ticker.length === 0) continue;
    const m = matchKeywordEvent(n.text);
    if (m.family === null) {
      if (m.drop_reason === 'verb_gate') verb_gate_drops += 1;
      else if (m.drop_reason === 'numeric_gate') numeric_gate_drops += 1;
      continue;
    }
    keywordCandidates.push({
      ticker: n.ticker,
      event_type: m.family,
      event_at: n.published_utc,
      source: 'keyword',
      vendor: n.vendor,
      meta: { keyword_family: m.family, keyword_misclassification_risk: true },
    });
  }

  // 2) Apply §(d) look-ahead gate + window lower bound to the COMBINED stream.
  const combined = [...structured, ...keywordCandidates];
  const gated = applyLookAheadGate(combined, opts.as_of);
  const windowed = applyWindowLowerBound(gated.rows, opts.window_start_at);

  // 3) §(h) cross-vendor dedup with vendor-precedence (structured > keyword).
  const winners = new Map<string, RawCatalystEventInput>();
  let cross_vendor_duplicates_dropped = 0;
  for (const r of windowed) {
    const k = dedupKey(r);
    const existing = winners.get(k);
    if (existing === undefined) {
      winners.set(k, r);
      continue;
    }
    cross_vendor_duplicates_dropped += 1;
    if (shouldReplace(existing, r)) {
      winners.set(k, r);
    }
  }

  return {
    rows: Array.from(winners.values()),
    verb_gate_drops,
    numeric_gate_drops,
    cross_vendor_duplicates_dropped,
    future_event_excluded: gated.future_event_excluded,
  };
}