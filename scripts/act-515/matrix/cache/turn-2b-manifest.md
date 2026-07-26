# Turn-2B Manifest — ACT-515 Matrix Lane

**Ruling basis:** DEV-V V-β-SCOPED (2026-07-26) — kernel-basis parity;
SHORT rows pre-qualified inside the compaction against the certified
reconstructor (signed excess_at_argmax ≤ -0.08 AND geometry ∈
SHORT_GEOMETRY_MATRIX).

**Edge function:** `overshoot-matrix-export` at
`source_version=matrix-export-v2-devv`. One-shot token RIPPED
(auth surface = triad only).

## Displacement (V-α REJECTION receipt)

| Metric | Value |
|---|---|
| Old SHORT top-25 rows (polluted) | 25,150 |
| New SHORT top-25 rows (kernel-qualified) | 9,366 |
| Pollution SHORT evicted | 20,922 (byte-match to prior `key_mismatch` count) |
| Displacement SHORT rescued (was `r_old>25`, now `r_new≤25`) | 5,138 |
| LONG top-25 unchanged | 25,150 ≡ 25,150 |

## Sealed artifacts (SHA-256, byte-verified)

| File | Rows | SHA-256 |
|---|---|---|
| slate-2022.jsonl | 4,859 | `2aeb7ef6…e637ec6` |
| slate-2023.jsonl | 7,912 | `34ac18c1…c5c1ad` |
| slate-2024.jsonl | 7,946 | `d8db8c82…9b3cc` |
| slate-2025.jsonl | 8,752 | `7b623b2f…cbe14` |
| slate-2026.jsonl | 5,047 | `2520ec70…64c4e18` |
| **slate total** | **34,516** | (LONG 25,150 + SHORT 9,366) |
| bars-pairs.jsonl | 54,778 | `653ff93f…65b7c` (49,640 Turn-1 + 5,138 V-β delta) |
| bars-windows-2022.jsonl | 11,899 | `beba049a…3b8a031` |
| bars-windows-2023.jsonl | 21,690 | `f1fe0a08…34a17` |
| bars-windows-2024.jsonl | 22,415 | `d43610b3…7c945` |
| bars-windows-2025.jsonl | 23,163 | `0b1e8e42…f5bb5a` |
| bars-windows-2026.jsonl | 12,516 | `1d94f989…8ed9845` |
| **bars-windows total** | **91,683** | across admitted lot windows |
| spy.jsonl | 1,143 | `6a98eec8…5b613e` |
| calendar.jsonl | 1,011 | `bf0857fe…4b73fc5` (untouched) |
| cellmap.jsonl | 6,000 | `67360457…6f93152` (untouched) |
| universe.jsonl | 906 | `4c439ba2…1129bd4c` (untouched) |

## Admit + Parity (DEV-U contract, full)

- Partitions processed: **1,970**
- Rows processed: **34,516**
- Admits: **9,187** (LONG 5,030 / SHORT 4,157)
- **STOPs: 0**
- Typed skips (by class): all **0**
  - entry_price_missing: 0
  - no_cell_or_rank_null: 0
  - position_already_open: 0
  - allocation_cap_reached: 0
  - short_daily_budget_reached: 0
- Parity table: **88 partitions sampled** (every 25th + Fixture-II window),
  all **PASSED**; `allGreen: true`.

**SHORT count movement vs Turn-2B provisional (2,872 → 4,157) = +1,285
SHORT lots admitted after pollution eviction and displacement rescue.**

## Stage-A / Stage-B network stats

- Stage-A slate re-fetch: 5 calls (year slices), 34,516 rows total.
- Stage-A pairs delta fetch: 2 calls (batches under 5,000-cap), 5,138 rows.
- Stage-B bars_windows: 19 batches (500 windows / ~7,000 days each), 91,683 rows.
- SPY: 1 call, 1,143 rows.
- **Total network calls: 27.**

## Rip-probe receipts

- Probe A (old token only): `HTTP 401 {"error":"unauthorized","reason":"no_valid_credential"}` ✓
- Probe B (no credentials):  `HTTP 401 {"error":"unauthorized","reason":"no_valid_credential"}` ✓
- Triad (bearer(service_role) / x-cron-secret / x-backfill-secret) preserved
  in `authorize()` — one-shot path removed in source (`MATRIX_EXPORT_ONESHOT_TOKEN = null`).

## Next: R1 RECEIPT turn

`runR1` over the sealed five-file set with the frozen columns / standing
grammar. Terminal identity to the cent.