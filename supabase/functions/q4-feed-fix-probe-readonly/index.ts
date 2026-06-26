/**
 * q4-feed-fix-probe-readonly — TEMPORARY STEP-C re-measurement.
 *
 * Proof-the-feed-works evidence for the AlpacaQuoteFetcher → PolygonQuoteFetcher
 * swap. Two corroborating signals over the live broker book:
 *
 *   (A) Polygon-vs-Polygon-different-endpoint divergence: /v2/last/nbbo
 *       (the new feed) cross-checked against /v2/snapshot/locale/us/markets/
 *       stocks/tickers/{ticker} (independent Polygon endpoint, same SIP
 *       source — measures intra-feed consistency; should be near-zero).
 *   (B) Stale-skip rate: fraction of symbols where the freshness gate
 *       (max_age_s = 5) would CLASSIFY 'failure_handled' vs the IEX-feed
 *       baseline. Expect a substantial drop = corroborating health signal.
 *
 * READ-ONLY. No DB writes, no order submission, no audit emission.
 * Operator-gated CRON_SECRET. Deleted after run.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { PolygonQuoteFetcher } from '../_shared/longshort-broker/polygon-quote-fetcher.ts';
import { AlpacaPaperClient } from '../_shared/longshort-broker/alpaca-paper-client.ts';
import { AlpacaPositionFetcher } from '../_shared/longshort-broker/alpaca-position-fetcher.ts';

const POLYGON_BASE_URL = 'https://api.polygon.io';

interface ProbeRow {
  symbol: string;
  nbbo_bid: number; nbbo_ask: number; nbbo_mid: number;
  nbbo_ts_iso: string; nbbo_age_s: number;
  snap_bid: number | null; snap_ask: number | null; snap_mid: number | null;
  divergence_bp: number | null;
  stale_per_freshness_gate: boolean;
  notes: string | null;
}

async function fetchSnapshot(apiKey: string, symbol: string) {
  const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}?apiKey=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url);
  if (!resp.ok) { await resp.text().catch(() => ''); return null; }
  const body = await resp.json().catch(() => null) as any;
  const lq = body?.ticker?.lastQuote;
  if (!lq || typeof lq.p !== 'number' || typeof lq.P !== 'number') return null;
  return { bid: lq.p as number, ask: lq.P as number };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const polyKey = Deno.env.get('POLYGON_API_KEY');
  if (!polyKey) return new Response(JSON.stringify({ error: 'POLYGON_API_KEY unset' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const callTs = new Date();
  const callTsMs = callTs.getTime();

  // Pull the live book from Alpaca paper. Falls back to a default symbol list.
  let symbols: string[] = [];
  try {
    const client = new AlpacaPaperClient({});
    const positions = await new AlpacaPositionFetcher(client).listOpenPositions(callTs);
    symbols = positions.map(p => p.symbol);
  } catch (_e) { /* fall through to default */ }
  if (symbols.length === 0) {
    symbols = ['SPY','AAPL','MSFT','NVDA','ENSG','SOFI','RIVN','PLUG','GME','TSLA'];
  }

  const fetcher = new PolygonQuoteFetcher(polyKey);
  const rows: ProbeRow[] = [];

  for (const symbol of symbols) {
    try {
      const q = await fetcher.fetchQuote(symbol, callTs);
      const nbboMid = (q.bid + q.ask) / 2;
      const ageS = Math.max(0, (callTsMs - q.ts.getTime()) / 1000);
      const snap = await fetchSnapshot(polyKey, symbol);
      const snapMid = snap ? (snap.bid + snap.ask) / 2 : null;
      const divBp = snap && snapMid && snapMid > 0
        ? Math.abs((nbboMid - snapMid) / snapMid) * 10_000
        : null;
      rows.push({
        symbol,
        nbbo_bid: q.bid, nbbo_ask: q.ask, nbbo_mid: nbboMid,
        nbbo_ts_iso: q.ts.toISOString(), nbbo_age_s: Number(ageS.toFixed(2)),
        snap_bid: snap?.bid ?? null, snap_ask: snap?.ask ?? null, snap_mid: snapMid,
        divergence_bp: divBp === null ? null : Number(divBp.toFixed(2)),
        stale_per_freshness_gate: ageS > 5,
        notes: snap ? null : 'snapshot_unavailable',
      });
    } catch (e) {
      rows.push({
        symbol, nbbo_bid: NaN, nbbo_ask: NaN, nbbo_mid: NaN,
        nbbo_ts_iso: '', nbbo_age_s: NaN, snap_bid: null, snap_ask: null, snap_mid: null,
        divergence_bp: null, stale_per_freshness_gate: true,
        notes: `fetch_error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const valid = rows.filter(r => r.divergence_bp !== null && !isNaN(r.divergence_bp));
  const divs = valid.map(r => r.divergence_bp as number).sort((a, b) => a - b);
  const pct = (p: number) => divs.length === 0 ? null : divs[Math.min(divs.length - 1, Math.floor(divs.length * p))];
  const stale = rows.filter(r => r.stale_per_freshness_gate).length;

  return new Response(JSON.stringify({
    correlation_id: crypto.randomUUID(),
    call_ts_iso: callTs.toISOString(),
    symbols_probed: symbols.length,
    valid_pairs: valid.length,
    nbbo_vs_snapshot_divergence_bp: {
      median: divs.length ? Number((divs[Math.floor(divs.length / 2)]).toFixed(2)) : null,
      p95: pct(0.95) === null ? null : Number((pct(0.95) as number).toFixed(2)),
      max: divs.length ? Number(divs[divs.length - 1].toFixed(2)) : null,
    },
    stale_skip_rate: {
      count_stale: stale,
      count_total: rows.length,
      pct: rows.length ? Number(((stale / rows.length) * 100).toFixed(1)) : null,
      max_age_s_gate: 5,
      baseline_note: 'Q4 IEX-feed baseline was high-divergence/feed-fabricated; STEP-C expects a substantial drop.',
    },
    rows,
  }, null, 2), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});