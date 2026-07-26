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
export const MATRIX_EXPORT_FN_VERSION = 'matrix-export-v2-devv' as const;

/**
 * DEV-V RULING (V-β-SCOPED, 2026-07-26) — SUPERSESSION of Turn-1 slate SHAs.
 * SHORT rows in the compacted top-25 must pass the certified kernel
 * qualification (signed excess_at_argmax <= -0.08 AND geometry ∈
 * SHORT_GEOMETRY_MATRIX) INSIDE the compaction. Turn-1 slate SHAs are
 * SUPERSEDED (retained in git history for audit). LONG side untouched.
 * cellmap/universe/calendar untouched by this defect (not re-fetched).
 *
 * Displacement measurement (from DB, verified against admit run):
 *   old_short_top25          = 25,150 (with pollution)
 *   new_short_top25          =  9,366 (kernel-qualified)
 *   pollution_short_evicted  = 20,922 (exact match to prior key_mismatch tally)
 *   displacement_short_rescued = 5,138 (qualifying shorts previously below cut)
 *   long_top25 unchanged     = 25,150 ≡ 25,150
 *   admitted lots: 5,030 LONG / 4,157 SHORT (prev provisional: 5,030 / 2,872)
 */

/** Byte-exact SHA-256 (hex) of the pinned cache files. */
export const CACHE_SHAS = Object.freeze({
  'cellmap.jsonl':      '6736045788843203d1b0fc6f99a41a8478efc3fc683f52616e1762ea36f93152',
  'universe.jsonl':     '4c439ba21f5d92b455b0f21256b8eb7f7ce88df6bbe1774f8331a85e1129bd4c',
  // Slate SHAs — DEV-V V-β-SCOPED re-fetch (supersedes Turn-1).
  'slate-2022.jsonl':   '2aeb7ef6a08cf4959ec3a572c735da35ec8a4051b13bae8f0a83298a2e637ec6',
  'slate-2023.jsonl':   '34ac18c1fbf49ecd4a24777ab7a2f5d03e90b1eeaaf51ac04be8440ee8c5c1ad',
  'slate-2024.jsonl':   'd8db8c824038b598706a18bb01ee48639fcb19e943b5699334d9578a3869b3cc',
  'slate-2025.jsonl':   '7b623b2ffb9b097d614803c12406bcb1bc7c6b28be9fabf37b7adbecd5bcbe14',
  'slate-2026.jsonl':   '2520ec70efaee1d82ffdd2c9421ae20dd85caec74c3743764d3f8b1ee64c4e18',
  // Turn-2A T-1: calendar sourced from overshoot-matrix-export?mode=calendar
  // — DISTINCT trade_date from overshoot_daily_bars WHERE ticker='SPY'.
  'calendar.jsonl':     'bf0857fe9e9f5c1eb9a57a9b2f81409e7fee451198fddb4ba03d5170a4b73fc5',
  // Turn-2B Stage-A: bar rows for unique (ticker, entrySession) pairs.
  // 49,640 rows (Turn-1 basis) + 5,138 delta append (V-β re-fetch).
  'bars-pairs.jsonl':   '653ff93fac42662ee7273e1e172d6443cceda603f0aa2b0eb194afcfc7a65b7c',
  // Turn-2B Stage-B: bar rows for admitted lot windows
  // ([entryDate .. exitAnchor + maxCarry=5]). Year-split (10MB/file cap).
  'bars-windows-2022.jsonl': 'beba049ae323eaf8732ff7fa96282ebe487ddb054586a1883e2a1bac93b8a031',
  'bars-windows-2023.jsonl': 'f1fe0a0865f8cb0f3da3dc5b0ac7c886190d6f49f6d8881244d51abdf7134a17',
  'bars-windows-2024.jsonl': 'd43610b3b490bb0e3849c2dca3c99f2449b0266879bb7b884c4e29c628c7c945',
  'bars-windows-2025.jsonl': '0b1e8e420a572390cfe64be7775e071f799de3ce6f716a362f333e49f3a5bb5a',
  'bars-windows-2026.jsonl': '1d94f98910af3f0f608c56f8b963dfdc162f4b49944faab213f71f2468ed9845',
  // SPY full-window benchmark for config (d) SPY-BH baseline.
  'spy.jsonl':          '6a98eec8084682f7bb86ed05f1de3eecfde1a70bad4906261253b140fa9b613e',
} as const);

/** Row counts (audited via `wc -l`). */
export const CACHE_ROW_COUNTS = Object.freeze({
  'cellmap.jsonl':      6000,
  'universe.jsonl':      906, // 905 active rows + 1 trailer line
  // DEV-V V-β-SCOPED slate row counts (SHORT pruned to kernel-qualified).
  'slate-2022.jsonl':   4859,
  'slate-2023.jsonl':   7912,
  'slate-2024.jsonl':   7946,
  'slate-2025.jsonl':   8752,
  'slate-2026.jsonl':   5047,
  'calendar.jsonl':     1011,
  'bars-pairs.jsonl':      54778,
  'bars-windows-2022.jsonl': 11899,
  'bars-windows-2023.jsonl': 21690,
  'bars-windows-2024.jsonl': 22415,
  'bars-windows-2025.jsonl': 23163,
  'bars-windows-2026.jsonl': 12516,
  'spy.jsonl':          1143,
} as const);

/** Slate total across yearly slices (excludes universe trailer). */
export const SLATE_ROW_TOTAL = 4859 + 7912 + 7946 + 8752 + 5047; // 34,516 (DEV-V)

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