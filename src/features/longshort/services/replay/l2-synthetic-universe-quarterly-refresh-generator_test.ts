import { assertEquals, assert, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildL2SyntheticUniverseQuarterlyRefresh,
  serializeL2SyntheticUniverseQuarterlyRefreshToJsonl,
  parseUniverseQuarterlyRefreshFixture,
  L2_SYNTHETIC_UNIVERSE_QUARTERLY_REFRESH_ID,
  FIXTURE_AS_OF_DATE,
  FIXTURE_AS_OF_TS,
} from './l2-synthetic-universe-quarterly-refresh-generator.ts';

Deno.test('(1) envelope shape matches §11.10.2 contract', () => {
  const fixture = buildL2SyntheticUniverseQuarterlyRefresh();
  assertEquals(fixture.envelope.envelope_marker, 'crosswind_replay_fixture_v1');
  assertEquals(fixture.envelope.format_version, 1);
  assertEquals(fixture.envelope.replay_day_id, L2_SYNTHETIC_UNIVERSE_QUARTERLY_REFRESH_ID);
  assertEquals(fixture.envelope.event_count, fixture.events.length);
  assertEquals(fixture.envelope.time_range.start, FIXTURE_AS_OF_TS);
  assertEquals(fixture.envelope.time_range.end, FIXTURE_AS_OF_TS);
});

Deno.test('(2) fixture contains 10 ticker snapshot events with expected eligibility distribution', () => {
  const fixture = buildL2SyntheticUniverseQuarterlyRefresh();
  assertEquals(fixture.events.length, 10);

  const longShortCount = fixture.events.filter((e) => e.long_eligible && e.short_eligible).length;
  const longOnlyCount = fixture.events.filter((e) => e.long_eligible && !e.short_eligible).length;
  const materially = fixture.events.filter((e) => e.observed_excluded &&
    e.observed_exclusion_reasons.some((r) => r === 'in_ma' || r === 'halted_5d_plus')).length;

  // 5 both-book + 2 fully-excluded materially-excluded rows that retain both eligibility flags
  // = 7 long+short eligible. 3 long-only.
  assertEquals(longShortCount, 7);
  assertEquals(longOnlyCount, 3);
  assertEquals(materially, 2);
});

Deno.test('(3) all events share the same as_of_date + ts (point-in-time snapshot)', () => {
  const fixture = buildL2SyntheticUniverseQuarterlyRefresh();
  for (const ev of fixture.events) {
    assertEquals(ev.as_of_date, FIXTURE_AS_OF_DATE);
    assertEquals(ev.ts, FIXTURE_AS_OF_TS);
    assertEquals(ev.stream, 'universe_membership_snapshot');
  }
});

Deno.test('(4) AC-22 evidence — fixture is deterministic; two builds produce byte-identical JSONL', () => {
  const jsonl1 = serializeL2SyntheticUniverseQuarterlyRefreshToJsonl(
    buildL2SyntheticUniverseQuarterlyRefresh(),
  );
  const jsonl2 = serializeL2SyntheticUniverseQuarterlyRefreshToJsonl(
    buildL2SyntheticUniverseQuarterlyRefresh(),
  );
  assertEquals(jsonl1, jsonl2);
});

Deno.test('(5) AC-21 evidence — round-trip parse reproduces the in-memory fixture', () => {
  const original = buildL2SyntheticUniverseQuarterlyRefresh();
  const jsonl = serializeL2SyntheticUniverseQuarterlyRefreshToJsonl(original);
  const parsed = parseUniverseQuarterlyRefreshFixture(jsonl);
  assertEquals(JSON.stringify(parsed.envelope), JSON.stringify(original.envelope));
  assertEquals(JSON.stringify(parsed.events), JSON.stringify(original.events));
});

Deno.test('(6) parser rejects unknown stream type (snapshot extension is strict)', () => {
  const fixture = buildL2SyntheticUniverseQuarterlyRefresh();
  const lines = serializeL2SyntheticUniverseQuarterlyRefreshToJsonl(fixture).split('\n');
  // Mutate event 1 to wrong stream
  const mutated = JSON.parse(lines[1]);
  mutated.stream = 'signal_quote';
  lines[1] = JSON.stringify(mutated);
  assertThrows(() => parseUniverseQuarterlyRefreshFixture(lines.join('\n')));
});

Deno.test('(7) parser rejects event_count mismatch', () => {
  const fixture = buildL2SyntheticUniverseQuarterlyRefresh();
  const lines = serializeL2SyntheticUniverseQuarterlyRefreshToJsonl(fixture).split('\n');
  const env = JSON.parse(lines[0]);
  env.event_count = 999;
  lines[0] = JSON.stringify(env);
  assertThrows(() => parseUniverseQuarterlyRefreshFixture(lines.join('\n')));
});

Deno.test('(8) banned-pattern compliance — generator source contains no Date.now / new Date()', async () => {
  const src = await Deno.readTextFile(
    new URL('./l2-synthetic-universe-quarterly-refresh-generator.ts', import.meta.url),
  );
  assert(!/\bDate\.now\(\)/.test(src), 'generator must not call Date.now()');
  assert(!/new\s+Date\(\s*\)/.test(src), 'generator must not call new Date() with no args');
  assert(!/\?\?\s*0\b/.test(src), 'generator must not use ?? 0 sentinel fallback');
});