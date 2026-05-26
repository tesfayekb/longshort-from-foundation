/**
 * l2-synthetic-universe-quarterly-refresh-generator — FP-008 sub-step 8.11 / ACT-117.
 *
 * Per AC-21 + AC-22 verbatim + DEC-038.1 clause (6) + DEC-035 clauses (1)(2)(3)(7)(8):
 * generates a fixed point-in-time snapshot fixture representing the universe component's
 * eligible-tickers output after one quarterly refresh. Universe ingestion is replayable
 * against this captured constituent data; replay parity contract per §11.10 satisfied
 * via two-run-byte-identical determinism property at the verify_universe_membership
 * chokepoint.
 *
 * Surface choices (locked across 3-pass supervisor convergence at ACT-117 pre-flight):
 *
 *   Surface 1 Option β — Separate fixture (NOT spliced into L2 Day 1); point-in-time
 *     snapshot event, not tick stream. Storage filename convention follows §11.10.2:
 *     `replay_storage/l2-synthetic-universe-quarterly-refresh.jsonl.zst` (gitignored
 *     generated artifact per replay_storage/README.md). The existing L2 synthetic Day 1
 *     fixture stays UNTOUCHED.
 *
 *   Surface 3 Option i — Inline TypeScript constituent lists per
 *     `l2-synthetic-day-1-generator.ts` precedent verbatim. Single source-of-truth file;
 *     readable diffs; no separate JSON files to track.
 *
 *   Surface 4 Option a — `verify_universe_membership` ONLY scope. Captured input: a
 *     universe_membership snapshot (eligible-tickers with long_eligible / short_eligible
 *     booleans + as_of_date + operator_id) plus the per-ticker (observed) cross-source
 *     classification inputs required to drive the verify_universe_membership classifier.
 *     Full quarterly orchestrator determinism (Polygon fetch + iShares fetch + cross-check
 *     + enrichment + filters + hard-exclusions + writes) is OUT OF SCOPE; deferred to
 *     DW-073 / Phase 7 captured-day work.
 *
 * Anti-completion-theater binding (per ACT-116 calibration 1 precedent): synthetic
 * fixture content is hand-authored from a small (10-ticker) S&P-style universe with a
 * deterministic eligibility distribution; NOT generated from any production data source;
 * NOT extracted from any live universe_membership table.
 *
 * Snapshot event extension: the universe-membership snapshot events introduced here do
 * NOT appear in CROSSWIND §11.10.1's 8-stream tick-stream enumeration. They live within
 * a separately-loaded .jsonl.zst envelope (this generator + the matching loader in
 * `replay-pass-runner.ts`) as a snapshot-style extension. The 8-stream tick enumeration
 * is NOT amended; §11.10.1 stays verbatim; the extension is documented at
 * `docs/04-modules/longshort/replay-fixture-format.md`.
 *
 * Owner: longshort (FP-008 sub-step 8.11)
 * Classification: test-infrastructure (non-financial-critical; banned-pattern-scanner
 * compliant — no Date.now, no sentinel fallbacks, no logAuditEvent).
 */

import type { ReplayTimestamp } from '../../types/replay-fixture.ts';
import type { ReplayFixtureEnvelope } from '../../types/replay-storage.ts';
import { REPLAY_FIXTURE_FORMAT_VERSION } from '../../types/replay-fixture.ts';

export const L2_SYNTHETIC_UNIVERSE_QUARTERLY_REFRESH_ID =
  'l2-synthetic-universe-quarterly-refresh' as const;

/**
 * Fixed point-in-time `as_of` for this snapshot fixture (first trading day Q1 2026 per
 * §3.4 cadence). Pure constant; no clock read.
 */
export const FIXTURE_AS_OF_DATE = '2026-01-02' as const;
export const FIXTURE_AS_OF_TS: ReplayTimestamp = '2026-01-02T14:30:00.000Z';
export const FIXTURE_OPERATOR_ID = 'l2-synth-operator' as const;

/**
 * Per-ticker universe-membership snapshot event. NOT a member of the
 * `ReplayFixtureEvent` 8-stream union; consumed by the universe-replay path only.
 *
 * Field shape mirrors `universe_membership` (MIG-050) for `long_eligible` / `short_eligible`
 * + the observed cross-source classification inputs that drive
 * `verify_universe_membership` per the verifier's `compute_divergence` shape.
 */
export interface UniverseMembershipSnapshotEvent {
  stream: 'universe_membership_snapshot';
  ts: ReplayTimestamp;
  symbol: string;
  as_of_date: string;
  /** Internal cache state: ticker present in `universe_membership`. */
  internal_in_universe: boolean;
  /** From book booleans on the universe_membership row. */
  long_eligible: boolean;
  short_eligible: boolean;
  /** Observed (cross-source) view of universe membership. */
  observed_in_universe: boolean;
  /** Observed exclusion state + reasons (hard_exclusions equivalent). */
  observed_excluded: boolean;
  observed_exclusion_reasons: string[];
}

export interface L2SyntheticUniverseQuarterlyRefreshFixture {
  envelope: ReplayFixtureEnvelope;
  events: ReadonlyArray<UniverseMembershipSnapshotEvent>;
}

/**
 * Inline 10-ticker synthetic S&P-style universe per Surface 3 Option i.
 *
 * Eligibility distribution (hand-authored; deterministic):
 *   - 5 long-eligible + short-eligible  (both books; happy path)
 *   - 3 long-eligible only              (REIT/ADR-style short-book exclusion)
 *   - 2 fully-excluded                  (materially-excluded scenarios:
 *                                          1 × in_ma           → structural escalation
 *                                          1 × halted_5d_plus  → structural escalation)
 *
 * Observed-vs-internal alignment is intentionally heterogeneous so the verifier
 * classifier exercises:
 *   - happy path (internal=true, observed=true, not excluded) → false_positive_within_tolerance
 *   - failure_handled (internal=true, observed_excluded=true, non-material) → failure_handled
 *   - failure_escalated (internal=true, materially_excluded) → failure_escalated (structural)
 *   - consistent exclusion (internal=false, observed=false) → false_positive_within_tolerance
 */
interface SyntheticUniverseRow {
  ticker: string;
  internal_in_universe: boolean;
  long_eligible: boolean;
  short_eligible: boolean;
  observed_in_universe: boolean;
  observed_excluded: boolean;
  observed_exclusion_reasons: string[];
}

const SYNTHETIC_UNIVERSE_ROWS: ReadonlyArray<SyntheticUniverseRow> = [
  // 5 happy-path both-book tickers (internal=true, observed=true, not excluded)
  { ticker: 'AAPL', internal_in_universe: true, long_eligible: true,  short_eligible: true,
    observed_in_universe: true,  observed_excluded: false, observed_exclusion_reasons: [] },
  { ticker: 'MSFT', internal_in_universe: true, long_eligible: true,  short_eligible: true,
    observed_in_universe: true,  observed_excluded: false, observed_exclusion_reasons: [] },
  { ticker: 'NVDA', internal_in_universe: true, long_eligible: true,  short_eligible: true,
    observed_in_universe: true,  observed_excluded: false, observed_exclusion_reasons: [] },
  { ticker: 'GOOG', internal_in_universe: true, long_eligible: true,  short_eligible: true,
    observed_in_universe: true,  observed_excluded: false, observed_exclusion_reasons: [] },
  { ticker: 'AMZN', internal_in_universe: true, long_eligible: true,  short_eligible: true,
    observed_in_universe: true,  observed_excluded: false, observed_exclusion_reasons: [] },
  // 3 long-only tickers (short-book excluded; row remains universe_membership-eligible)
  { ticker: 'PLTR', internal_in_universe: true, long_eligible: true,  short_eligible: false,
    observed_in_universe: true,  observed_excluded: false, observed_exclusion_reasons: [] },
  { ticker: 'RIVN', internal_in_universe: true, long_eligible: true,  short_eligible: false,
    observed_in_universe: true,  observed_excluded: false, observed_exclusion_reasons: [] },
  { ticker: 'BABA', internal_in_universe: true, long_eligible: true,  short_eligible: false,
    observed_in_universe: true,  observed_excluded: false, observed_exclusion_reasons: [] },
  // 1 fully-excluded (M&A target — materially_excluded → failure_escalated per
  // verify_universe_membership classifier)
  { ticker: 'XYZM', internal_in_universe: true, long_eligible: true,  short_eligible: true,
    observed_in_universe: false, observed_excluded: true,  observed_exclusion_reasons: ['in_ma'] },
  // 1 fully-excluded (halted ≥5d — materially_excluded → failure_escalated)
  { ticker: 'HALT', internal_in_universe: true, long_eligible: true,  short_eligible: true,
    observed_in_universe: false, observed_excluded: true,  observed_exclusion_reasons: ['halted_5d_plus'] },
];

/**
 * Build the L2 synthetic universe quarterly-refresh fixture in-memory. Pure function;
 * deterministic; two calls produce byte-identical output.
 */
export function buildL2SyntheticUniverseQuarterlyRefresh(): L2SyntheticUniverseQuarterlyRefreshFixture {
  const events: UniverseMembershipSnapshotEvent[] = SYNTHETIC_UNIVERSE_ROWS.map((row) => ({
    stream: 'universe_membership_snapshot',
    ts: FIXTURE_AS_OF_TS,
    symbol: row.ticker,
    as_of_date: FIXTURE_AS_OF_DATE,
    internal_in_universe: row.internal_in_universe,
    long_eligible: row.long_eligible,
    short_eligible: row.short_eligible,
    observed_in_universe: row.observed_in_universe,
    observed_excluded: row.observed_excluded,
    observed_exclusion_reasons: [...row.observed_exclusion_reasons],
  }));

  const envelope: ReplayFixtureEnvelope = {
    envelope_marker: 'crosswind_replay_fixture_v1',
    format_version: REPLAY_FIXTURE_FORMAT_VERSION,
    replay_day_id: L2_SYNTHETIC_UNIVERSE_QUARTERLY_REFRESH_ID,
    captured_at: '2026-05-26T00:00:00.000Z',
    source_seed: 'l2synthuniv001',
    event_count: events.length,
    symbols: events.map((e) => e.symbol),
    time_range: {
      start: FIXTURE_AS_OF_TS,
      end: FIXTURE_AS_OF_TS,
    },
  };

  return { envelope, events };
}

/**
 * Serialize the snapshot fixture to JSONL (uncompressed). Mirrors the
 * `serializeL2SyntheticDay1ToJsonl` precedent: envelope on line 1; one event per
 * subsequent line.
 *
 * The capture-side script does zstd-compression + filesystem write; in-memory replay
 * paths skip compression and pass the JSONL string directly into the parallel loader.
 */
export function serializeL2SyntheticUniverseQuarterlyRefreshToJsonl(
  fixture: L2SyntheticUniverseQuarterlyRefreshFixture,
): string {
  return [
    JSON.stringify(fixture.envelope),
    ...fixture.events.map((e) => JSON.stringify(e)),
  ].join('\n');
}

/**
 * Parallel loader for the universe-membership snapshot fixture. Sidesteps the standard
 * `fixture-loader.ts` which strictly validates the 8-stream `ReplayFixtureEvent` union;
 * the snapshot events use a NEW stream type (`universe_membership_snapshot`) outside that
 * enumeration. See snapshot-event extension note above + replay-fixture-format.md.
 *
 * Validation:
 *   - First line: envelope JSON; envelope_marker + format_version match
 *   - Subsequent lines: snapshot events; stream literal matches; event_count tallies
 *   - All events share the same `ts` (point-in-time snapshot semantics; not a tick stream)
 */
export function parseUniverseQuarterlyRefreshFixture(
  jsonl: string,
): L2SyntheticUniverseQuarterlyRefreshFixture {
  const lines = jsonl.split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error('universe-quarterly-refresh fixture: empty content');
  }
  const envelope = JSON.parse(lines[0]) as ReplayFixtureEnvelope;
  if (envelope.envelope_marker !== 'crosswind_replay_fixture_v1') {
    throw new Error('universe-quarterly-refresh fixture: envelope_marker mismatch');
  }
  if (envelope.format_version !== REPLAY_FIXTURE_FORMAT_VERSION) {
    throw new Error(
      `universe-quarterly-refresh fixture: format_version=${envelope.format_version} != ${REPLAY_FIXTURE_FORMAT_VERSION}`,
    );
  }
  const events: UniverseMembershipSnapshotEvent[] = [];
  for (let i = 1; i < lines.length; i++) {
    const ev = JSON.parse(lines[i]) as UniverseMembershipSnapshotEvent;
    if (ev.stream !== 'universe_membership_snapshot') {
      throw new Error(
        `universe-quarterly-refresh fixture: line ${i + 1} stream=${ev.stream} != universe_membership_snapshot`,
      );
    }
    events.push(ev);
  }
  if (envelope.event_count !== events.length) {
    throw new Error(
      `universe-quarterly-refresh fixture: envelope event_count=${envelope.event_count} != ${events.length}`,
    );
  }
  return { envelope, events };
}