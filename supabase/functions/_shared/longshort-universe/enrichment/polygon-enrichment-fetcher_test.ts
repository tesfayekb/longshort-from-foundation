// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { PolygonEnrichmentFetcher } from './polygon-enrichment-fetcher.ts';
import { ConstituentFetchError } from '../../longshort-universe-interfaces.ts';
import type { UniverseConstituent } from '../../longshort-universe-interfaces.ts';

const AS_OF = new Date('2026-05-25T14:30:00Z');

function jsonResp(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'ERR',
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function constituent(
  ticker: string,
  source: 'polygon' | 'ishares' | 'manual' = 'polygon',
): UniverseConstituent {
  return { index: 'sp500', ticker, name: ticker, source, fetched_at: AS_OF };
}

function aggBars(count: number, close: number, volume: number) {
  const bars = [];
  for (let i = 0; i < count; i++) {
    bars.push({ c: close, v: volume, t: AS_OF.getTime() - (count - i) * 86_400_000 });
  }
  return bars;
}

Deno.test('(1) constructor throws on missing apiKey', () => {
  let threw = false;
  try {
    new PolygonEnrichmentFetcher('');
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test('(2) happy-path: enriches with market_cap + share_price + avg_daily_dollar_volume + listing_date', async () => {
  const fetcher = new PolygonEnrichmentFetcher('test-key', async (url) => {
    if (url.includes('/v3/reference/tickers/')) {
      return jsonResp({
        results: {
          market_cap: 3_000_000_000_000,
          list_date: '1980-12-12',
          type: 'CS',
          sic_description: 'ELECTRONIC COMPUTERS',
        },
      });
    }
    return jsonResp({ results: aggBars(60, 200, 50_000_000) });
  });
  const { enriched: out, skipped } = await fetcher.enrich([constituent('AAPL')], AS_OF);
  assertEquals(out.length, 1);
  assertEquals(skipped.length, 0);
  assertEquals(out[0].market_cap, 3_000_000_000_000);
  assertEquals(out[0].listing_date, '1980-12-12');
  assertEquals(out[0].share_price, 200);
  assertEquals(out[0].avg_daily_dollar_volume, 200 * 50_000_000);
  assertEquals(out[0].is_adr, false);
  assertEquals(out[0].is_reit, false);
});

Deno.test('(3) missing market_cap → null (NOT silent zero)', async () => {
  const fetcher = new PolygonEnrichmentFetcher('test-key', async (url) => {
    if (url.includes('/v3/reference/tickers/')) {
      return jsonResp({ results: { list_date: '2020-01-01', type: 'CS' } });
    }
    return jsonResp({ results: aggBars(60, 10, 1_000_000) });
  });
  const { enriched: out } = await fetcher.enrich([constituent('XYZ')], AS_OF);
  assertEquals(out[0].market_cap, null);
  assertEquals(out[0].listing_date, '2020-01-01');
});

Deno.test('(4) ADR flag set from type=ADRC', async () => {
  const fetcher = new PolygonEnrichmentFetcher('test-key', async (url) => {
    if (url.includes('/v3/reference/tickers/')) {
      return jsonResp({
        results: { market_cap: 50_000_000_000, list_date: '2010-01-01', type: 'ADRC' },
      });
    }
    return jsonResp({ results: aggBars(60, 100, 1_000_000) });
  });
  const { enriched: out } = await fetcher.enrich([constituent('TSM')], AS_OF);
  assertEquals(out[0].is_adr, true);
});

Deno.test('(5) REIT flag set from sic_description containing REIT', async () => {
  const fetcher = new PolygonEnrichmentFetcher('test-key', async (url) => {
    if (url.includes('/v3/reference/tickers/')) {
      return jsonResp({
        results: {
          market_cap: 30_000_000_000,
          list_date: '2010-01-01',
          type: 'CS',
          sic_description: 'Real Estate Investment Trust',
        },
      });
    }
    return jsonResp({ results: aggBars(60, 100, 1_000_000) });
  });
  const { enriched: out } = await fetcher.enrich([constituent('SPG')], AS_OF);
  assertEquals(out[0].is_reit, true);
});

Deno.test('(6) insufficient aggregates (<60 bars) → avg_daily_dollar_volume null but share_price surfaced', async () => {
  const fetcher = new PolygonEnrichmentFetcher('test-key', async (url) => {
    if (url.includes('/v3/reference/tickers/')) {
      return jsonResp({ results: { market_cap: 1e10, list_date: '2026-04-01', type: 'CS' } });
    }
    return jsonResp({ results: aggBars(10, 42, 100_000) });
  });
  const { enriched: out } = await fetcher.enrich([constituent('NEW')], AS_OF);
  assertEquals(out[0].avg_daily_dollar_volume, null);
  assertEquals(out[0].share_price, 42);
});

Deno.test('(7) ticker-details 404 → row omitted + attributed in skipped (FP-008.4 #23)', async () => {
  const fetcher = new PolygonEnrichmentFetcher('test-key', async (url) => {
    if (url.includes('/v3/reference/tickers/')) {
      return jsonResp({}, false, 404);
    }
    return jsonResp({ results: aggBars(60, 1, 1) });
  });
  const { enriched, skipped } = await fetcher.enrich([constituent('GONE')], AS_OF);
  assertEquals(enriched.length, 0);
  assertEquals(skipped.length, 1);
  assertEquals(skipped[0].ticker, 'GONE');
  assertEquals(skipped[0].reason, 'not_in_polygon_404');
});

Deno.test('(8) HTTP 401 on ticker-details throws ConstituentFetchError', async () => {
  const fetcher = new PolygonEnrichmentFetcher('test-key', async () => jsonResp({}, false, 401));
  await assertRejects(
    () => fetcher.enrich([constituent('AAPL')], AS_OF),
    ConstituentFetchError,
    'HTTP 401',
  );
});

Deno.test('(9) iShares-sourced constituents are skipped + attributed (Guardrail 2; FP-008.4 #23)', async () => {
  let called = false;
  const fetcher = new PolygonEnrichmentFetcher('test-key', async () => {
    called = true;
    return jsonResp({});
  });
  const { enriched, skipped } = await fetcher.enrich([constituent('AAPL', 'ishares')], AS_OF);
  assertEquals(enriched.length, 0);
  assertEquals(skipped.length, 1);
  assertEquals(skipped[0].ticker, 'AAPL');
  assertEquals(skipped[0].reason, 'ishares_source');
  assertEquals(called, false);
});

Deno.test("(9a) source='manual' constituents are enriched (operator-seeded bootstrap path)", async () => {
  const fetcher = new PolygonEnrichmentFetcher('test-key', async (url) => {
    if (url.includes('/v3/reference/tickers/')) {
      return jsonResp({
        results: { market_cap: 1e9, list_date: '2010-01-01', type: 'CS', sic_description: 'SOFTWARE' },
      });
    }
    return jsonResp({ results: aggBars(60, 50, 1_000_000) });
  });
  const { enriched: out } = await fetcher.enrich([constituent('AAPL', 'manual')], AS_OF);
  assertEquals(out.length, 1);
  assertEquals(out[0].ticker, 'AAPL');
  assertEquals(out[0].source, 'manual');
  assertEquals(out[0].market_cap, 1e9);
});

Deno.test('(10) preserves fetched_at + index + ticker from input constituent', async () => {
  const fetcher = new PolygonEnrichmentFetcher('test-key', async (url) => {
    if (url.includes('/v3/reference/tickers/')) {
      return jsonResp({ results: { market_cap: 1e9, list_date: '2010-01-01', type: 'CS' } });
    }
    return jsonResp({ results: aggBars(60, 50, 1_000_000) });
  });
  const input = constituent('AAPL');
  const { enriched: out } = await fetcher.enrich([input], AS_OF);
  assertEquals(out[0].fetched_at.getTime(), AS_OF.getTime());
  assertEquals(out[0].index, 'sp500');
  assertEquals(out[0].ticker, 'AAPL');
  assertEquals(out[0].source, 'polygon');
});

Deno.test('(11) mixed batch (ok + 404 + iShares) → enriched=1, skipped=2 with correct reasons (FP-008.4 #23)', async () => {
  // Polygon ticker-details mock: AAPL ok, GONE returns 404; TSM (iShares) is
  // skipped before any HTTP call by the source guard. Aggregates only fired
  // for AAPL (the survivor).
  const fetcher = new PolygonEnrichmentFetcher('test-key', async (url) => {
    if (url.includes('/v3/reference/tickers/GONE')) return jsonResp({}, false, 404);
    if (url.includes('/v3/reference/tickers/AAPL')) {
      return jsonResp({
        results: { market_cap: 1e12, list_date: '1980-12-12', type: 'CS' },
      });
    }
    return jsonResp({ results: aggBars(60, 200, 1_000_000) });
  });
  const { enriched, skipped } = await fetcher.enrich(
    [
      constituent('AAPL', 'polygon'),
      constituent('GONE', 'polygon'),
      constituent('TSM', 'ishares'),
    ],
    AS_OF,
  );
  assertEquals(enriched.length, 1);
  assertEquals(enriched[0].ticker, 'AAPL');
  assertEquals(skipped.length, 2);
  // Reason map by ticker — input order is preserved but assert by identity.
  const reasonByTicker = Object.fromEntries(skipped.map((s) => [s.ticker, s.reason]));
  assertEquals(reasonByTicker['GONE'], 'not_in_polygon_404');
  assertEquals(reasonByTicker['TSM'], 'ishares_source');
});