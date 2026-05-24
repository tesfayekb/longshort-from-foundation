# replay_storage/

Compressed JSONL replay fixtures per CROSSWIND §11.10.2.

## Format

Each fixture is a `.jsonl.zst` file:

- **First line:** `ReplayFixtureEnvelope` JSON (metadata: format_version, replay_day_id, source_seed, event_count, symbols, time_range)
- **Subsequent lines:** `ReplayFixtureEvent` JSON objects, one per line, in ascending `ts` order

## Filename convention

`<replay_day_id>.jsonl.zst` — e.g., `l2-synthetic-day-1.jsonl.zst`

## What lives in this directory

- `.gitkeep` — anchor file (tracked)
- `README.md` — this file (tracked)
- `*.jsonl.zst` fixtures — **NOT tracked** (per `.gitignore`); generated artifacts

## Retention

Per §11.10.2: indefinite for Phase 0B Day 1 + at least 12 weeks rolling for Phase 7+ captured days. Rotation/archival to S3 is later-phase work.

## Sub-step inventory

- **6.5a (current):** envelope + event types + directory contract (this README)
- **6.5b:** deterministic replay engine consuming fixtures
- **6.5c:** L2 synthetic Day 1 fixture emitted here (`l2-synthetic-day-1.jsonl.zst`)
- **6.5d:** AI-loop verification surface + `longshort.reconciliation_replay_chain` job activation (MIG-046 via ADR-004 §22.5.2 split-execution)