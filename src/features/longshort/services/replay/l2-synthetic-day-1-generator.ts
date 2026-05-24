/**
 * l2-synthetic-day-1-generator — deterministic minimal Day 1 fixture per §11.10 + 6.5a v1 spec.
 *
 * "L2 synthetic" means: laboratory-grade, hand-constructed, not captured from live markets.
 * The fixture is the smallest one that exercises verify_quote end-to-end through reconcile():
 *   - 1 symbol (AAPL)
 *   - 3 ticks (14:30, 14:31, 14:32 UTC)
 *   - Each tick: signal_quote + reconciliation_quote + broker_quote events for AAPL
 *   - Quotes intentionally include one tick with within-tolerance divergence
 *     (5 bps actual, ≤5 bps threshold per §11.0.9) → false_positive_within_tolerance outcome
 *     and one tick with above-tolerance divergence (10 bps) → failure_handled outcome
 *
 * Determinism: this generator produces byte-identical output across runs. No Date.now,
 * no random; all values are literal.
 */

import type { ReplayFixtureEvent, ReplayTimestamp } from '../../types/replay-fixture.ts';
import type { ReplayFixtureEnvelope } from '../../types/replay-storage.ts';
import { REPLAY_FIXTURE_FORMAT_VERSION } from '../../types/replay-fixture.ts';

export const L2_SYNTHETIC_DAY_1_ID = 'l2-synthetic-day-1' as const;

export interface L2SyntheticDay1Fixture {
  envelope: ReplayFixtureEnvelope;
  events: ReplayFixtureEvent[];
}

/**
 * Build the L2 synthetic Day 1 fixture in-memory. Pure function; deterministic.
 *
 * Tick 1 (14:30:00 UTC): all 3 quotes within 1bp — false_positive_within_tolerance
 * Tick 2 (14:31:00 UTC): signal vs recon = 5bp, 0.5¢ — within tolerance (1¢ floor not exceeded) → false_positive_within_tolerance
 * Tick 3 (14:32:00 UTC): signal vs recon = 10bp, 1.5¢ — exceeds both thresholds → failure_handled
 */
export function buildL2SyntheticDay1(): L2SyntheticDay1Fixture {
  const SYMBOL = 'AAPL';

  // Tick 1 — quotes near 150.00, all three within 1bp
  const tick1: ReplayFixtureEvent[] = [
    { stream: 'signal_quote',          ts: '2026-01-02T14:30:00.000Z', symbol: SYMBOL, bid: 149.99, ask: 150.01, last: 150.00, source: 'polygon' },
    { stream: 'reconciliation_quote',  ts: '2026-01-02T14:30:00.000Z', symbol: SYMBOL, bid: 149.99, ask: 150.01, last: 150.00, source: 'tradier' },
    { stream: 'broker_quote',          ts: '2026-01-02T14:30:00.000Z', symbol: SYMBOL, bid: 149.99, ask: 150.01, last: 150.00, source: 'alpaca'  },
  ];

  // Tick 2 — signal 150.00, recon 150.075 → 5 bps, 0.075¢ (within abs_cents 1.0 floor) — within tolerance
  // signal vs recon: (150.075 - 150.00) / 150.00 * 10000 = 5 bps ; |delta| = 0.075¢ < 1.0 floor → no firing
  const tick2: ReplayFixtureEvent[] = [
    { stream: 'signal_quote',          ts: '2026-01-02T14:31:00.000Z', symbol: SYMBOL, bid: 149.99, ask: 150.01, last: 150.000, source: 'polygon' },
    { stream: 'reconciliation_quote',  ts: '2026-01-02T14:31:00.000Z', symbol: SYMBOL, bid: 150.065, ask: 150.085, last: 150.075, source: 'tradier' },
    { stream: 'broker_quote',          ts: '2026-01-02T14:31:00.000Z', symbol: SYMBOL, bid: 149.99, ask: 150.01, last: 150.000, source: 'alpaca'  },
  ];

  // Tick 3 — signal 150.00, recon 150.15 → 10 bps, 15¢ — exceeds BOTH thresholds → failure_handled
  // max_pairwise_bps = 10 bps < 100 bps → not failure_escalated
  const tick3: ReplayFixtureEvent[] = [
    { stream: 'signal_quote',          ts: '2026-01-02T14:32:00.000Z', symbol: SYMBOL, bid: 149.99, ask: 150.01, last: 150.000, source: 'polygon' },
    { stream: 'reconciliation_quote',  ts: '2026-01-02T14:32:00.000Z', symbol: SYMBOL, bid: 150.14,  ask: 150.16,  last: 150.150, source: 'tradier' },
    { stream: 'broker_quote',          ts: '2026-01-02T14:32:00.000Z', symbol: SYMBOL, bid: 149.99, ask: 150.01, last: 150.000, source: 'alpaca'  },
  ];

  const events = [...tick1, ...tick2, ...tick3];

  const envelope: ReplayFixtureEnvelope = {
    envelope_marker: 'crosswind_replay_fixture_v1',
    format_version: REPLAY_FIXTURE_FORMAT_VERSION,
    replay_day_id: L2_SYNTHETIC_DAY_1_ID,
    captured_at: '2026-05-24T00:00:00.000Z',
    source_seed: 'l2synth001',
    event_count: events.length,
    symbols: [SYMBOL],
    time_range: {
      start: '2026-01-02T14:30:00.000Z' as ReplayTimestamp,
      end: '2026-01-02T14:32:00.000Z' as ReplayTimestamp,
    },
  };

  return { envelope, events };
}

/**
 * Serialize the fixture to JSONL (uncompressed) for in-memory engine consumption.
 *
 * The CLI generator script (replay-pass.ts) does the zstd-compression + filesystem write.
 * In-memory tests skip compression and pass the JSONL string directly into the engine.
 */
export function serializeL2SyntheticDay1ToJsonl(fixture: L2SyntheticDay1Fixture): string {
  return [
    JSON.stringify(fixture.envelope),
    ...fixture.events.map((e) => JSON.stringify(e)),
  ].join('\n');
}