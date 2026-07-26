/**
 * cache-shas.ts — Fetch-Cache Turn-1 manifest for ACT-515 matrix lane.
 *
 * Frozen artifacts (SHA-256 hex) produced by `overshoot-matrix-export`
 * (edge fn, deployed 2026-07-26). One line per cell/slate/universe row,
 * NDJSON. These SHAs are the pinned inputs the R1 receipt turn consumes;
 * any drift = receipt invalidated.
 *
 * DEV-P PINS (all ratified 2026-07-26):
 *   P.1 SLATE RANK BASIS: rankScore = cell.mean_fwd_return_5d × sideSign,
 *       from join tuple (side, band, window_days, momentum_quintile,
 *       drawdown_bucket, exclusion_width_days=5). Events with no cell hit
 *       excluded (rank_null_skip, pre-authorized).
 *   P.2 TIE-BREAK (in-partition): tier ASC, rankScore DESC, ticker ASC,
 *       event_id ASC (final stabilizer).
 *   P.3 CELLMAP RUN: 1888e113-f9b3-43f5-856c-d91666a3c121 (K-1 ratified;
 *       corrects stale O-4 echo of '045d2dfc'). 1:1 pair with corpus run.
 *       Column pins from information_schema probe:
 *         side (text), band (text), window_days (integer),
 *         momentum_quintile (smallint), drawdown_bucket (smallint),
 *         exclusion_width_days (integer), arrival_count (integer),
 *         mean_fwd_return_1d/5d/20d (numeric), median_fwd_return_5d (numeric),
 *         hit_rate_5d (numeric).
 *
 * TOP-N = 25 per (session, side).
 */

export const CORPUS_RUN_ID   = '1888e113-f9b3-43f5-856c-d91666a3c121' as const;
export const CELLMAP_RUN_ID  = '1888e113-f9b3-43f5-856c-d91666a3c121' as const;
export const MATRIX_EXPORT_FN_VERSION = 'matrix-export-v1' as const;

/** Byte-exact SHA-256 (hex) of the pinned cache files. */
export const CACHE_SHAS = Object.freeze({
  'cellmap.jsonl':      '6736045788843203d1b0fc6f99a41a8478efc3fc683f52616e1762ea36f93152',
  'universe.jsonl':     '4c439ba21f5d92b455b0f21256b8eb7f7ce88df6bbe1774f8331a85e1129bd4c',
  'slate-2022.jsonl':   '84e18562f337eb5f52288f3adc931f833c4654e75154822f1ff3c7ec7b4f878a',
  'slate-2023.jsonl':   '5e45b137ed75552aef25917e6dd4df7e5a713fe0137f1995a507577d5e301027',
  'slate-2024.jsonl':   '0054c47aa13ab8fb546bb033ff0bbbadf567c4f794707204c45ba0065bbcc4fa',
  'slate-2025.jsonl':   'ad0fe800a2b1cb55f35082bd66f2a60cd0511803d266579ab065b3e52d36afe3',
  'slate-2026.jsonl':   'e500e6b04acf1fa4fc99f5f114ed15859fc494828fd3b2f1c3359725fcbb734f',
} as const);

/** Row counts (audited via `wc -l`). */
export const CACHE_ROW_COUNTS = Object.freeze({
  'cellmap.jsonl':      6000,
  'universe.jsonl':      906, // 905 active rows + 1 trailer line
  'slate-2022.jsonl':   6450,
  'slate-2023.jsonl':  12500,
  'slate-2024.jsonl':  12600,
  'slate-2025.jsonl':  12500,
  'slate-2026.jsonl':   6250,
} as const);

/** Slate total across yearly slices (excludes universe trailer). */
export const SLATE_ROW_TOTAL = 6450 + 12500 + 12600 + 12500 + 6250; // 50,300

/**
 * Universe intersection/bound aggregate (trailer line of universe.jsonl).
 * Locked here for reproducibility of the survivorship bound reported in
 * R1's §7 caveat block.
 */
export const UNIVERSE_BOUND = Object.freeze({
  active_count:         905,
  corpus_ticker_count:  839,
  intersection_count:   824,
  corpus_only_count:     15, // in-corpus but no longer active
  active_only_count:     81, // active today but never appeared in corpus
});

/**
 * Parity gate: SNDK-class S_10_INF was requested but SNDK's live-book short
 * admits are all after corpus max (2026-07-02) — so no SNDK S_10_INF row
 * exists in the slate. Ratified substitute parity spot (same band):
 *   slate row  — session=2022-06-29, side=short, ticker=GME, event_id=221011,
 *                rank=6, band=S_10_INF, w=4, mq=1, dd=5
 *   cell match — side=short, band=S_10_INF, w=4, mq=1, dd=5, ew=5
 *                mean_fwd_return_5d = -0.02822532503676849842
 *   rank_score = -(mean_fwd_return_5d) = 0.02822532503676849842
 * Verified byte-exact in-turn (grep against cache/*.jsonl).
 */
export const PARITY_SPOT = Object.freeze({
  side: 'short' as const,
  band: 'S_10_INF' as const,
  session: '2022-06-29' as const,
  ticker: 'GME' as const,
  event_id: 221011,
  window_days: 4,
  momentum_quintile: 1,
  drawdown_bucket: 5,
  mean_fwd_return_5d: '-0.02822532503676849842' as const,
  rank_score: '0.02822532503676849842' as const,
});