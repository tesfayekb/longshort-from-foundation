/**
 * longshort-portfolio-history-readonly — FP-068 W3 (ACT-442).
 *
 * READ-ONLY operator equity-curve surface. Returns:
 *   - broker: Alpaca /v2/account/portfolio/history via the shared
 *     AlpacaPaperClient + AlpacaPortfolioHistoryFetcher. The BROKER-TRUTH
 *     total equity curve (the paper account's own equity), distinct from
 *     the internal MIG-121 snapshot the chart already renders.
 *   - spy (optional): daily adjusted closes via PolygonPriceHistoryFetcher,
 *     when ?include_spy=true. Raw closes — the client normalizes to the
 *     first broker-equity sample so it renders as a relative-return line.
 *
 * MONEY-PATH INVARIANT: GET-only Alpaca endpoint under the paper-only
 * allow-list + read-only Polygon call. ZERO writes, ZERO money-path calls
 * (no submit/plan/execute/lot-writer/snapshot-writer). Adding a write here
 * violates the FP-068 W3 charter.
 *
 * Least-privilege gate: `longshort.view` (same as W1 positions surface).
 *
 * Injected clock per DEC-034 (4): fetched_at sourced from
 * productionClock.getWallClockTs() — NEVER raw `new Date()`. The wall-clock
 * scanner (scripts/check-wall-clock.ts) covers supabase/functions/longshort-*.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { apiError } from '../_shared/api-error.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { AlpacaPaperClient } from '../_shared/longshort-broker/alpaca-paper-client.ts';
import {
  AlpacaPortfolioHistoryFetcher,
  type PortfolioHistoryParams,
} from '../_shared/longshort-broker/alpaca-portfolio-history-fetcher.ts';
import { PolygonPriceHistoryFetcher } from '../_shared/longshort-signals/shared/polygon-price-history-fetcher.ts';
import { productionClock } from '../_shared/longshort-clock.ts';

type RangeKey = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

/** Range → Alpaca (period, timeframe) + SPY lookback (calendar days). */
const RANGE_TABLE: Record<RangeKey, { params: PortfolioHistoryParams; spyLookbackDays: number }> = {
  '1D':  { params: { period: '1D',  timeframe: '5Min' }, spyLookbackDays: 7   },
  '1W':  { params: { period: '7D',  timeframe: '1H'   }, spyLookbackDays: 14  },
  '1M':  { params: { period: '1M',  timeframe: '1D'   }, spyLookbackDays: 45  },
  '3M':  { params: { period: '3M',  timeframe: '1D'   }, spyLookbackDays: 100 },
  '6M':  { params: { period: '6M',  timeframe: '1D'   }, spyLookbackDays: 200 },
  '1Y':  { params: { period: '1A',  timeframe: '1D'   }, spyLookbackDays: 400 },
  'ALL': { params: { period: 'all', timeframe: '1D'   }, spyLookbackDays: 400 },
};

function parseRange(v: string | null): RangeKey {
  if (v === '1D' || v === '1W' || v === '1M' || v === '3M' || v === '6M' || v === '1Y' || v === 'ALL') return v;
  return '1M';
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'GET') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  const auth = await authenticateRequest(req);
  await checkPermissionOrThrow(auth.user.id, 'longshort.view');

  const url = new URL(req.url);
  const range = parseRange(url.searchParams.get('range'));
  const includeSpy = url.searchParams.get('include_spy') === 'true';

  const ts = productionClock.getWallClockTs();
  const cfg = RANGE_TABLE[range];

  // ── Broker: Alpaca portfolio/history. Paper-only guard is at client ctor.
  const client = new AlpacaPaperClient();
  const historyFetcher = new AlpacaPortfolioHistoryFetcher(client);
  const broker = await historyFetcher.fetch(cfg.params);

  // ── SPY (optional). typed-absence: if key missing OR fetch fails, return
  //    spy=null rather than fabricating a flat line. Client renders no SPY
  //    line when null; the toggle is off by default anyway.
  let spy: { bars: { ts_ms: number; close: number }[] } | null = null;
  if (includeSpy) {
    const polygonKey = Deno.env.get('POLYGON_API_KEY');
    if (polygonKey && polygonKey.length > 0) {
      try {
        const spyFetcher = new PolygonPriceHistoryFetcher(polygonKey);
        const bars = await spyFetcher.fetchPriceHistory('SPY', ts, cfg.spyLookbackDays);
        if (bars && bars.length > 0) {
          spy = {
            bars: bars.map((b) => ({
              // isoDate is YYYY-MM-DD; treat as UTC midnight for chart alignment
              ts_ms: Date.parse(`${b.ts}T00:00:00Z`),
              close: b.close,
            })),
          };
        } else {
          spy = { bars: [] };
        }
      } catch (_e) {
        // Typed-absence — surface `spy=null`; do not throw and hide the broker curve.
        spy = null;
      }
    }
  }

  return apiSuccess({
    correlation_id: correlationId,
    fetched_at: ts.toISOString(),
    range,
    broker: {
      base_value: broker.base_value,
      timeframe: broker.timeframe,
      points: broker.points,
    },
    spy,
  });
}));