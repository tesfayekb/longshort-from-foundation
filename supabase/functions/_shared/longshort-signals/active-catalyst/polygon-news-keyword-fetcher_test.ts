// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { PolygonNewsKeywordFetcher } from './polygon-news-keyword-fetcher.ts';

const WINDOW = {
  as_of: new Date('2026-06-10T20:00:00Z'),
  window_start_at: new Date('2026-06-05T00:00:00Z'),
};

function jsonResp(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return {
    ok,
    status,
    statusText,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

/**
 * Build a single-page Polygon-news fixture response. Each article has the
 * full vendor wire shape including `title` + `description` so the FP-048
 * normalizer populates the new optional fields and the keyword fetcher
 * can classify them.
 */
function newsPage(articles: Array<{
  id: string;
  tickers: string[];
  published_utc: string;
  title: string;
  description: string;
}>, opts: { next_url?: string } = {}) {
  return jsonResp({
    results: articles.map((a) => ({
      id: a.id,
      publisher: { name: 'Reuters' },
      published_utc: a.published_utc,
      tickers: a.tickers,
      insights: [{ ticker: a.tickers[0], sentiment: 'neutral' }],
      title: a.title,
      description: a.description,
    })),
    next_url: opts.next_url,
  });
}

/** Page-2 sentinel: empty `results` ends the walk (FP-048 mid-walk `end`). */
const ENDPAGE = jsonResp({ results: [] });

// ─── True-positives + verb-gate-blocked false-positives, all 4 families ───

Deno.test('(1) executive_change true-positive emits keyword row', async () => {
  let call = 0;
  const f = new PolygonNewsKeywordFetcher('k', async () => {
    call += 1;
    return call === 1
      ? newsPage([{
          id: 'a1',
          tickers: ['AAPL'],
          published_utc: '2026-06-09T14:00:00Z',
          title: 'Acme appoints new CEO',
          description: 'Board names industry veteran as chief executive.',
        }])
      : ENDPAGE;
  });
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].event_type, 'executive_change');
  assertEquals(out.rows[0].source, 'keyword');
  assertEquals(out.rows[0].vendor, 'polygon');
  assertEquals(out.rows[0].meta?.keyword_misclassification_risk, true);
  assertEquals(out.rows[0].meta?.keyword_family, 'executive_change');
  assertEquals(out.rows[0].meta?.article_id, 'a1');
});

Deno.test('(2) executive_change verb-gate-blocked false-positive (noun only, no verb)', async () => {
  let call = 0;
  const f = new PolygonNewsKeywordFetcher('k', async () => {
    call += 1;
    return call === 1
      ? newsPage([{
          id: 'a2',
          tickers: ['AAPL'],
          published_utc: '2026-06-09T14:00:00Z',
          title: 'CEO speaks at industry conference',
          description: 'Routine keynote remarks; no leadership change.',
        }])
      : ENDPAGE;
  });
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 0);
});

Deno.test('(3) guidance true-positive (noun + verb + numeric)', async () => {
  let call = 0;
  const f = new PolygonNewsKeywordFetcher('k', async () => {
    call += 1;
    return call === 1
      ? newsPage([{
          id: 'a3',
          tickers: ['NVDA'],
          published_utc: '2026-06-09T15:00:00Z',
          title: 'NVDA raises 2026 guidance',
          description: 'Outlook raised to $4.5B revenue.',
        }])
      : ENDPAGE;
  });
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].event_type, 'guidance');
});

Deno.test('(4) guidance verb-gate-blocked false-positive (noun only)', async () => {
  let call = 0;
  const f = new PolygonNewsKeywordFetcher('k', async () => {
    call += 1;
    return call === 1
      ? newsPage([{
          id: 'a4',
          tickers: ['NVDA'],
          published_utc: '2026-06-09T15:00:00Z',
          title: 'Company affirms long-term guidance plan',
          description: 'Reviewing analyst outlook on the sector.',
        }])
      : ENDPAGE;
  });
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 0);
});

Deno.test('(5) regulatory_action true-positive (SEC + verb)', async () => {
  let call = 0;
  const f = new PolygonNewsKeywordFetcher('k', async () => {
    call += 1;
    return call === 1
      ? newsPage([{
          id: 'a5',
          tickers: ['BAC'],
          published_utc: '2026-06-09T16:00:00Z',
          title: 'SEC charges firm with disclosure fraud',
          description: 'Enforcement action filed in district court.',
        }])
      : ENDPAGE;
  });
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].event_type, 'regulatory_action');
});

Deno.test('(6) regulatory_action verb-gate-blocked false-positive (routine filing, no verb)', async () => {
  let call = 0;
  const f = new PolygonNewsKeywordFetcher('k', async () => {
    call += 1;
    return call === 1
      ? newsPage([{
          id: 'a6',
          tickers: ['BAC'],
          published_utc: '2026-06-09T16:00:00Z',
          title: 'Firm files routine SEC 10-Q',
          description: 'Quarterly disclosure now available.',
        }])
      : ENDPAGE;
  });
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 0);
});

Deno.test('(7) partnership true-positive (noun + verb)', async () => {
  let call = 0;
  const f = new PolygonNewsKeywordFetcher('k', async () => {
    call += 1;
    return call === 1
      ? newsPage([{
          id: 'a7',
          tickers: ['MSFT'],
          published_utc: '2026-06-09T17:00:00Z',
          title: 'Acme announces strategic alliance with cloud vendor',
          description: 'Multi-year joint venture forms today.',
        }])
      : ENDPAGE;
  });
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].event_type, 'partnership');
});

Deno.test('(8) partnership verb-gate-blocked false-positive — "partners" substring of "partnership" must NOT pass', async () => {
  let call = 0;
  const f = new PolygonNewsKeywordFetcher('k', async () => {
    call += 1;
    return call === 1
      ? newsPage([{
          id: 'a8',
          tickers: ['MSFT'],
          published_utc: '2026-06-09T17:00:00Z',
          // The noun "partnership" contains the substring "partners" (a verb in
          // the §(b) verb-gate). Without word-boundary matching this would
          // silently pass the gate; with `\bpartners\b` it does not.
          title: 'Existing partnership continues into next quarter',
          description: 'No new agreement; routine continuation only.',
        }])
      : ENDPAGE;
  });
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 0);
});

// ─── Cross-cutting behavior ───

Deno.test('(9) multi-ticker article fans out one event per attributed ticker', async () => {
  let call = 0;
  const f = new PolygonNewsKeywordFetcher('k', async () => {
    call += 1;
    return call === 1
      ? newsPage([{
          id: 'a9',
          tickers: ['AAPL', 'GOOG', 'GOOGL'],
          published_utc: '2026-06-09T14:00:00Z',
          title: 'Apple appoints new CEO across alliance',
          description: 'Board names industry veteran as chief executive.',
        }])
      : ENDPAGE;
  });
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 3);
  assertEquals(new Set(out.rows.map((r) => r.ticker)), new Set(['AAPL', 'GOOG', 'GOOGL']));
  for (const r of out.rows) assertEquals(r.event_type, 'executive_change');
});

Deno.test('(10) §(d) look-ahead gate drops future-dated rows + counts them', async () => {
  let call = 0;
  const f = new PolygonNewsKeywordFetcher('k', async () => {
    call += 1;
    if (call === 1) {
      return newsPage([
        // In-window match
        {
          id: 'a10a',
          tickers: ['AAPL'],
          published_utc: '2026-06-09T14:00:00Z',
          title: 'AAPL raises 2026 guidance',
          description: 'Outlook raised to $4B revenue.',
        },
        // Future-dated (post-as_of) match
        {
          id: 'a10b',
          tickers: ['NVDA'],
          published_utc: '2026-06-11T14:00:00Z',
          title: 'NVDA raises 2026 guidance',
          description: 'Outlook raised to $5B revenue.',
        },
      ]);
    }
    return ENDPAGE;
  });
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  // FP-048 inner fetchOnePage already drops the future row before it
  // reaches us, so future_event_excluded counted here is 0 — the
  // counter remains the typed surface for the orchestrator either way.
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].ticker, 'AAPL');
});

Deno.test('(11) §(f) trading-day floor trims rows older than window_start_at (over-fetched 10-day window)', async () => {
  let call = 0;
  const f = new PolygonNewsKeywordFetcher('k', async () => {
    call += 1;
    if (call === 1) {
      return newsPage([
        // Inside 10-day calendar lookback but BEFORE the 5-trading-day
        // window_start_at — must be trimmed client-side here.
        {
          id: 'a11a',
          tickers: ['AAPL'],
          published_utc: '2026-06-04T14:00:00Z',
          title: 'AAPL raises 2026 guidance',
          description: 'Outlook raised to $4B revenue.',
        },
        {
          id: 'a11b',
          tickers: ['NVDA'],
          published_utc: '2026-06-06T14:00:00Z',
          title: 'NVDA raises 2026 guidance',
          description: 'Outlook raised to $5B revenue.',
        },
      ]);
    }
    return ENDPAGE;
  });
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].ticker, 'NVDA');
});

Deno.test('(12) HTTP 403 first page → subscription_gated', async () => {
  const f = new PolygonNewsKeywordFetcher('k', async () =>
    jsonResp({}, false, 403, 'Forbidden'),
  );
  const out = await f.fetch(WINDOW);
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(13) empty first page → data_unavailable', async () => {
  const f = new PolygonNewsKeywordFetcher('k', async () =>
    jsonResp({ results: [] }),
  );
  const out = await f.fetch(WINDOW);
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(14) rows with no title and no description are silently dropped (no fabricated text)', async () => {
  let call = 0;
  const f = new PolygonNewsKeywordFetcher('k', async () => {
    call += 1;
    if (call === 1) {
      // Wire row missing both `title` and `description` — the FP-048
      // normalizer leaves them `undefined`; composeText returns ''; the
      // matcher is never called; no row emitted.
      return jsonResp({
        results: [{
          id: 'a14',
          publisher: { name: 'Reuters' },
          published_utc: '2026-06-09T14:00:00Z',
          tickers: ['AAPL'],
          insights: [{ ticker: 'AAPL', sentiment: 'neutral' }],
        }],
      });
    }
    return ENDPAGE;
  });
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 0);
});

Deno.test('(15) constructor throws on missing apiKey', () => {
  let threw = false;
  try {
    new PolygonNewsKeywordFetcher('');
  } catch {
    threw = true;
  }
  assert(threw);
});

/*
 * (16) INC-75 regression — fetcher-stage gate-drop telemetry.
 *
 * Stage-mismatched instrumentation: gate-drop counters were previously
 * incremented only inside `classifyCatalystEvents`, which the news path
 * never reached (the fetcher pre-filters via `matchKeywordEvent`).
 * `catalyst_meta.{verb_gate_drops,numeric_gate_drops}` therefore read
 * STRUCTURALLY 0 — a clean-FPR mirage masquerading as healthy noise.
 *
 * Fixture: 5 articles → 2 matchable (1 executive_change true-positive +
 * 1 guidance true-positive with numeric) + 2 noun-only verb-gate
 * failures (executive_change + partnership where "partnership" contains
 * the substring "partners" but no verb is present) + 1 guidance
 * numeric-gate failure (noun + verb, no numeric token). Expected:
 *
 *   rows.length === 2 (the two true-positives)
 *   articles_scanned === 5
 *   verb_gate_drops === 2
 *   numeric_gate_drops === 1
 */
Deno.test('(16) INC-75 fetcher-stage gate-drop telemetry — drops + scanned surfaced', async () => {
  let call = 0;
  const f = new PolygonNewsKeywordFetcher('k', async () => {
    call += 1;
    if (call === 1) {
      return newsPage([
        // True-positive #1 — executive_change (noun + verb)
        {
          id: 'b1',
          tickers: ['AAPL'],
          published_utc: '2026-06-09T14:00:00Z',
          title: 'Acme appoints new CEO',
          description: 'Board names industry veteran as chief executive.',
        },
        // True-positive #2 — guidance (noun + verb + numeric)
        {
          id: 'b2',
          tickers: ['NVDA'],
          published_utc: '2026-06-09T15:00:00Z',
          title: 'NVDA raises 2026 guidance',
          description: 'Outlook raised to $4.5B revenue.',
        },
        // Verb-gate fail #1 — executive_change noun, no verb
        {
          id: 'b3',
          tickers: ['AAPL'],
          published_utc: '2026-06-09T15:30:00Z',
          title: 'CEO speaks at industry conference',
          description: 'Routine keynote remarks; no leadership change.',
        },
        // Verb-gate fail #2 — partnership noun, no verb (partners-substring trap)
        {
          id: 'b4',
          tickers: ['MSFT'],
          published_utc: '2026-06-09T16:00:00Z',
          title: 'Existing partnership continues into next quarter',
          description: 'No new agreement; routine continuation only.',
        },
        // Numeric-gate fail — guidance noun + verb, no numeric token
        {
          id: 'b5',
          tickers: ['TSLA'],
          published_utc: '2026-06-09T17:00:00Z',
          title: 'TSLA raises long-term guidance',
          description: 'Outlook raised qualitatively.',
        },
      ]);
    }
    return ENDPAGE;
  });
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 2);
  assertEquals(out.articles_scanned, 5);
  assertEquals(out.verb_gate_drops, 2);
  assertEquals(out.numeric_gate_drops, 1);
});