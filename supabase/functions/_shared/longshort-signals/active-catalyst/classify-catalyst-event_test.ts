// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classifyCatalystEvents,
  matchKeywordEvent,
  type CatalystNewsInput,
} from './classify-catalyst-event.ts';
import type { RawCatalystEventInput } from './catalyst-types.ts';

const WINDOW_START = new Date('2026-06-05T00:00:00Z');
const AS_OF = new Date('2026-06-10T20:00:00Z');

function news(
  ticker: string,
  text: string,
  published_utc: string,
  vendor: 'fmp' | 'polygon' = 'polygon',
): CatalystNewsInput {
  return { ticker, text, published_utc, vendor };
}

Deno.test('(1) matchKeywordEvent: guidance requires noun + verb + numeric', () => {
  assertEquals(matchKeywordEvent('Acme raises 2026 guidance').family, 'guidance');
  // noun + verb, no numeric → numeric_gate drop
  assertEquals(matchKeywordEvent('Acme raises guidance').drop_reason, 'numeric_gate');
  // noun only → verb_gate drop
  assertEquals(matchKeywordEvent('Company affirms long-term guidance plan').drop_reason, 'verb_gate');
  // no noun → no drop counter (null/null)
  assertEquals(matchKeywordEvent('weather report sunny'), { family: null, drop_reason: null });
});

Deno.test('(2) executive_change: noun + verb gate', () => {
  assertEquals(matchKeywordEvent('Board appoints new CEO').family, 'executive_change');
  assertEquals(matchKeywordEvent('CEO presents at conference').drop_reason, 'verb_gate');
});

Deno.test('(3) regulatory_action: SEC + verb required', () => {
  assertEquals(matchKeywordEvent('SEC charges firm with fraud').family, 'regulatory_action');
  assertEquals(matchKeywordEvent('Firm files routine SEC 10-Q').drop_reason, 'verb_gate');
});

Deno.test('(4) partnership: noun + verb', () => {
  assertEquals(matchKeywordEvent('Acme announces strategic alliance').family, 'partnership');
  assertEquals(matchKeywordEvent('Existing partnership continues').drop_reason, 'verb_gate');
});

Deno.test('(5) classifyCatalystEvents counts verb_gate and numeric_gate drops separately', () => {
  const out = classifyCatalystEvents(
    [],
    [
      news('AAA', 'Acme raises 2026 guidance', '2026-06-09T14:00:00Z'),
      news('BBB', 'Acme raises guidance', '2026-06-09T14:00:00Z'), // numeric drop
      news('CCC', 'CEO speaks publicly', '2026-06-09T14:00:00Z'), // verb drop
      news('DDD', 'no keywords here', '2026-06-09T14:00:00Z'), // no-match, no counter
    ],
    { as_of: AS_OF, window_start_at: WINDOW_START },
  );
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].event_type, 'guidance');
  assertEquals(out.rows[0].source, 'keyword');
  assertEquals(out.verb_gate_drops, 1);
  assertEquals(out.numeric_gate_drops, 1);
});

Deno.test('(6) §(d) look-ahead gate excludes future-dated keyword rows', () => {
  const out = classifyCatalystEvents(
    [],
    [
      news('AAA', 'Acme raises 2026 guidance', '2026-06-11T14:00:00Z'), // future
      news('BBB', 'Acme raises 2026 guidance', '2026-06-09T14:00:00Z'),
    ],
    { as_of: AS_OF, window_start_at: WINDOW_START },
  );
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].ticker, 'BBB');
  assertEquals(out.future_event_excluded, 1);
});

Deno.test('(7) window lower bound drops rows older than window_start_at', () => {
  const out = classifyCatalystEvents(
    [],
    [
      news('AAA', 'Acme raises 2026 guidance', '2026-06-04T14:00:00Z'), // pre-window
      news('BBB', 'Acme raises 2026 guidance', '2026-06-06T14:00:00Z'),
    ],
    { as_of: AS_OF, window_start_at: WINDOW_START },
  );
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].ticker, 'BBB');
});

Deno.test('(8) §(h) dedup: structured > keyword (vendor precedence on same 1h bucket)', () => {
  const structured: RawCatalystEventInput = {
    ticker: 'AAPL',
    event_type: 'guidance',
    event_at: '2026-06-09T14:15:00Z',
    source: 'structured',
    vendor: 'fmp',
  };
  const out = classifyCatalystEvents(
    [structured],
    [news('AAPL', 'Apple raises 2026 guidance', '2026-06-09T14:45:00Z')], // same hour bucket
    { as_of: AS_OF, window_start_at: WINDOW_START },
  );
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].source, 'structured');
  assertEquals(out.cross_vendor_duplicates_dropped, 1);
});

Deno.test('(9) §(h) dedup: same-source first-occurrence-wins (no replacement within tier)', () => {
  const first: RawCatalystEventInput = {
    ticker: 'AAPL',
    event_type: 'splits',
    event_at: '2026-06-09T14:05:00Z',
    source: 'structured',
    vendor: 'polygon',
  };
  const second: RawCatalystEventInput = {
    ticker: 'AAPL',
    event_type: 'splits',
    event_at: '2026-06-09T14:55:00Z', // same hour bucket
    source: 'structured',
    vendor: 'fmp',
  };
  const out = classifyCatalystEvents([first, second], [], {
    as_of: AS_OF,
    window_start_at: WINDOW_START,
  });
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].vendor, 'polygon'); // first wins
  assertEquals(out.cross_vendor_duplicates_dropped, 1);
});

Deno.test('(10) different hour buckets → both events retained (1h bucket boundary precision)', () => {
  const out = classifyCatalystEvents(
    [],
    [
      news('AAA', 'Acme raises 2026 guidance', '2026-06-09T13:59:00Z'),
      news('AAA', 'Acme raises 2026 guidance', '2026-06-09T14:00:00Z'), // next hour bucket
    ],
    { as_of: AS_OF, window_start_at: WINDOW_START },
  );
  assertEquals(out.rows.length, 2);
  assertEquals(out.cross_vendor_duplicates_dropped, 0);
});

Deno.test('(11) keyword rows carry source:keyword + misclassification-risk meta', () => {
  const out = classifyCatalystEvents(
    [],
    [news('AAPL', 'Apple raises 2026 guidance', '2026-06-09T14:00:00Z')],
    { as_of: AS_OF, window_start_at: WINDOW_START },
  );
  assertEquals(out.rows[0].source, 'keyword');
  assertEquals(out.rows[0].meta?.keyword_misclassification_risk, true);
  assertEquals(out.rows[0].meta?.keyword_family, 'guidance');
});

Deno.test('(12) empty + degenerate inputs do not throw (typed-absence path)', () => {
  const out = classifyCatalystEvents(
    [],
    [
      news('', 'Acme raises 2026 guidance', '2026-06-09T14:00:00Z'), // empty ticker
      // @ts-ignore
      news('AAA', '', '2026-06-09T14:00:00Z'), // empty text
    ],
    { as_of: AS_OF, window_start_at: WINDOW_START },
  );
  assertEquals(out.rows.length, 0);
  assertEquals(out.verb_gate_drops, 0);
  assertEquals(out.numeric_gate_drops, 0);
});