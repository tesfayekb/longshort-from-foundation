# Replay Fixture Format — v1

**Status:** Normative
**Source:** CROSSWIND §11.10.1 + §11.10.2; ADR-005 (Deno-native replay runtime)
**Sub-step authority:** FP-006 sub-step 6.5a (ACT-086)
**Type definitions:** `src/features/longshort/types/replay-fixture.ts` + `replay-storage.ts`

## Purpose

Defines the wire format for replay fixtures consumed by the §11.10 replay framework. Sub-step 6.5b's deterministic replay engine consumes this format; sub-step 6.5c's L2 synthetic Day 1 capture emits this format; sub-step 6.5d's AI-loop verification surface validates two replay runs produce identical outputs against fixtures in this format.

## Container

- **Encoding:** JSONL (JSON Lines) — one JSON object per line, LF line endings, UTF-8
- **Compression:** zstd (`.zst` suffix) — chosen for streaming decode + high compression ratio
- **File extension:** `.jsonl.zst`
- **Storage location:** `replay_storage/`
- **Filename convention:** `<replay_day_id>.jsonl.zst` where `replay_day_id` is `<source>-day-<NN>` (e.g., `l2-synthetic-day-1.jsonl.zst`, `polygon-day-12.jsonl.zst`)

## Envelope (first line)

Every fixture's first line is a `ReplayFixtureEnvelope` JSON object:

```json
{
  "envelope_marker": "crosswind_replay_fixture_v1",
  "format_version": 1,
  "replay_day_id": "l2-synthetic-day-1",
  "captured_at": "2026-05-24T00:00:00Z",
  "source_seed": "deadbeefcafebabe",
  "event_count": 12345,
  "symbols": ["AAPL", "MSFT", "GOOGL"],
  "time_range": {
    "start": "2026-01-01T14:30:00Z",
    "end": "2026-01-01T21:00:00Z"
  }
}
```

**Fields:**
- `envelope_marker` — literal string `"crosswind_replay_fixture_v1"`; magic-string identifier
- `format_version` — `1` for this spec version; increments on breaking changes
- `replay_day_id` — canonical day identifier; must match filename stem
- `captured_at` — when the capture was performed (ISO-8601 UTC); informational
- `source_seed` — hex-encoded seed for any signal-generation randomness; required for §11.10.3 deterministic replay
- `event_count` — total events in this fixture (excluding envelope); informational sanity-check
- `symbols` — all symbols referenced in any event; informational; for index-building
- `time_range.start` / `time_range.end` — earliest/latest `ts` across all events; informational

**Validation:** sub-step 6.5b engine validates envelope via `isValidEnvelope()` before consuming events; malformed envelope = STOP.

## Events (subsequent lines)

Each subsequent line is a `ReplayFixtureEvent` JSON object — discriminated union by `stream` field. Eight stream types per §11.10.1:

### 1. `broker_state`

```json
{ "stream": "broker_state", "ts": "2026-01-01T14:30:00Z", "kind": "position_snapshot", "payload": { "symbol": "AAPL", "qty": 100, "avg_entry_price": 150.50 } }
```

`kind` ∈ `position_snapshot | order_submitted | order_filled | order_rejected | order_canceled | borrow_status | account_snapshot`

### 2-4. Quote streams (`signal_quote` / `reconciliation_quote` / `broker_quote`)

```json
{ "stream": "signal_quote", "ts": "2026-01-01T14:30:00Z", "symbol": "AAPL", "bid": 150.45, "ask": 150.55, "last": 150.50, "volume": 1000, "source": "polygon" }
```

Source-specific identifier in `source` field: `polygon` / `tradier` / `yahoo` / `alpaca`.

### 5. `halt_feed`

```json
{ "stream": "halt_feed", "ts": "2026-01-01T14:35:00Z", "symbol": "AAPL", "halted": true, "halt_code": "LUDP", "reason": "Volatility" }
```

### 6. `locate_feed`

```json
{ "stream": "locate_feed", "ts": "2026-01-01T14:30:00Z", "symbol": "AAPL", "locate_id": "loc_abc123", "available": true, "qty_available": 50000, "ttl_seconds": 3600 }
```

### 7. `corporate_actions`

```json
{ "stream": "corporate_actions", "ts": "2026-01-01T14:30:00Z", "symbol": "AAPL", "action_type": "split", "ex_date": "2026-01-05T00:00:00Z", "payload": { "ratio": "4:1" } }
```

`action_type` ∈ `split | dividend | merger | spinoff | ticker_change | other`

### 8. `combiner_io`

Per §11.10.1 verbatim — at every ranking event, full inputs + outputs:

```json
{
  "stream": "combiner_io",
  "ts": "2026-01-01T14:30:00Z",
  "inputs": [
    { "symbol": "AAPL", "signal_id": "momentum_5d", "value": 0.85, "is_present": true, "ts": "2026-01-01T14:29:55Z" },
    { "symbol": "MSFT", "signal_id": "momentum_5d", "value": null, "is_present": false, "ts": "2026-01-01T14:29:55Z" }
  ],
  "outputs": [
    { "symbol": "AAPL", "rank": 1, "score": 2.34, "shap_attribution": { "momentum_5d": 1.8, "value_yield": 0.54 } }
  ]
}
```

## Ordering invariant

Events within a fixture MUST be sorted by `ts` ascending. Sub-step 6.5b engine consumes events in file order; non-monotonic `ts` is a STOP-class defect.

For events with identical `ts`, ordering between them is **not** semantically meaningful; engine treats them as a single instant.

## Time semantics

- All `ts` fields are ISO-8601 UTC strings (e.g., `"2026-01-01T14:30:00Z"` or `"2026-01-01T14:30:00.123Z"`).
- Per DEC-034 clause (4) + §11.9: no `Date.now()` / `new Date()` in business logic; fixtures use captured wall-clock timestamps; replay engine injects them.
- Replay determinism (§11.10.3) requires identical `ts` sequences across runs.

## Versioning

`format_version` increments on **breaking** changes only (new required envelope field; semantic change to an existing event schema; reordering invariant change). Additive changes (new optional event field; new `kind` enum value) do NOT bump version.

Current version: **1**.

## Sub-step traceability

- **6.5a (this spec):** v1 spec frozen
- **6.5b:** engine consumes v1
- **6.5c:** L2 synthetic Day 1 emits v1
- **6.5d:** AI-loop verification surface validates v1 fixtures + activates `longshort.reconciliation_replay_chain` job (MIG-046 via ADR-004 §22.5.2 split-execution per pre-emptive operator flag)

## References

- CROSSWIND §11.10.1 (capture scope) + §11.10.2 (storage/retention)
- ADR-005 (Deno-native replay runtime)
- ADR-001 (reconciliation architecture; replay is independent verification surface)
- DEC-034 clause (4) (no Date.now in business logic)
- §11.9 (datetime.now ban)