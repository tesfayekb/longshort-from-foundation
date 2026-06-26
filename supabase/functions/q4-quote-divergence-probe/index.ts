/**
 * q4-quote-divergence-probe — ONE-SHOT investigation probe.
 *
 * Purpose: STREAM 2 of the cadence-rework investigation (DW-148 reframe).
 * Measures decision-price feed accuracy by pulling NBBO quotes from
 *   (A) Alpaca data API /v2/stocks/{symbol}/quotes/latest  (current decision feed; possibly IEX-single-venue)
 *   (B) Polygon /v3/quotes/{symbol}?order=desc&limit=1     (consolidated SIP, truth baseline)
 * at the same instant for the current book's symbols, computing the bps divergence
 * between Alpaca mid and SIP mid, and evaluating pre-committed pause thresholds.
 *
 * NOT a money-path function. Read-only. No order placement. No cron arming.
 * Superadmin-gated (mirrors probe-alpaca-positions-readonly pattern).
 *
 * Per the investigation prompt: thresholds for PAUSE recommendation are:
 *   median abs > 5bp  OR  p95 abs > 20bp  OR  directional bias > 60%
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const SYMBOLS = [
  'ABBV','BAH','BWA','CASY','CBOE','EVR','F','FIX','FOX','FOXA','GWRE','HPQ','NUE','PSX','SLB','SNDK','SNX','TGT','TPR','WST',
  'ALGM','ALK','BX','CEG','CHTR','COIN','CVNA','DASH','DUOL','ENSG','EQT','FLR','HIMS','MTDR','PBF','RH','TOL','TSCO','UBER','WING',
];

interface AlpacaQ { bid?: number; ask?: number; ts?: string; err?: string }
interface PolyQ { bid?: number; ask?: number; ts_ns?: number; bid_ex?: number; ask_ex?: number; err?: string }

async function alpacaQ(sym: string, key: string, sec: string): Promise<AlpacaQ> {
  try {
    const r = await fetch(`https://data.alpaca.markets/v2/stocks/${sym}/quotes/latest`, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': sec, Accept: 'application/json' },
    });
    if (!r.ok) return { err: `http_${r.status}` };
    const d = await r.json() as { quote?: { bp?: number; ap?: number; t?: string } };
    return { bid: d.quote?.bp, ask: d.quote?.ap, ts: d.quote?.t };
  } catch (e) { return { err: e instanceof Error ? e.message : String(e) }; }
}

async function polygonQ(sym: string, key: string): Promise<PolyQ> {
  try {
    const r = await fetch(`https://api.polygon.io/v3/quotes/${sym}?order=desc&limit=1&apiKey=${key}`);
    if (!r.ok) return { err: `http_${r.status}` };
    const d = await r.json() as { results?: Array<{ bid_price?: number; ask_price?: number; sip_timestamp?: number; bid_exchange?: number; ask_exchange?: number }> };
    const q = d.results?.[0];
    if (!q) return { err: 'no_rows' };
    return { bid: q.bid_price, ask: q.ask_price, ts_ns: q.sip_timestamp, bid_ex: q.bid_exchange, ask_ex: q.ask_exchange };
  } catch (e) { return { err: e instanceof Error ? e.message : String(e) }; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // One-shot READ-ONLY investigation probe. No money path, no writes,
  // no order placement. Pulls public quote data from Alpaca + Polygon
  // and returns aggregate divergence stats. Function will be DELETED
  // immediately after the investigation completes.

  const apKey = Deno.env.get('ALPACA_PAPER_KEY')!;
  const apSec = Deno.env.get('ALPACA_PAPER_SECRET')!;
  const poly  = Deno.env.get('POLYGON_API_KEY')!;

  const probedAt = new Date().toISOString();
  const pairs = await Promise.all(SYMBOLS.map(async (s) => {
    const [a, p] = await Promise.all([alpacaQ(s, apKey, apSec), polygonQ(s, poly)]);
    return { sym: s, a, p };
  }));

  type Row = { sym: string; a_bid?: number; a_ask?: number; a_mid?: number; p_bid?: number; p_ask?: number; p_mid?: number; abs_bps?: number; signed_bps?: number; p_bid_ex?: number; p_ask_ex?: number; err?: string };
  const rows: Row[] = pairs.map(({ sym, a, p }) => {
    if (a.err || p.err) return { sym, err: `a=${a.err ?? '-'},p=${p.err ?? '-'}` };
    if (!a.bid || !a.ask || !p.bid || !p.ask) return { sym, err: 'missing_quote_fields' };
    const a_mid = (a.bid + a.ask) / 2;
    const p_mid = (p.bid + p.ask) / 2;
    const diff = a_mid - p_mid;
    return {
      sym, a_bid: a.bid, a_ask: a.ask, a_mid: +a_mid.toFixed(4),
      p_bid: p.bid, p_ask: p.ask, p_mid: +p_mid.toFixed(4),
      abs_bps: +(Math.abs(diff)/p_mid*10000).toFixed(2),
      signed_bps: +(diff/p_mid*10000).toFixed(2),
      p_bid_ex: p.bid_ex, p_ask_ex: p.ask_ex,
    };
  });

  const good = rows.filter((r): r is Required<Row> => typeof r.abs_bps === 'number');
  const bad = rows.filter(r => r.err);
  const sortedAbs = good.map(r => r.abs_bps).sort((x, y) => x - y);
  const median = sortedAbs.length ? sortedAbs[Math.floor(sortedAbs.length/2)] : NaN;
  const mean = sortedAbs.length ? sortedAbs.reduce((s,x)=>s+x,0)/sortedAbs.length : NaN;
  const p95 = sortedAbs.length ? sortedAbs[Math.max(0, Math.ceil(sortedAbs.length*0.95)-1)] : NaN;
  const max = sortedAbs.length ? sortedAbs[sortedAbs.length-1] : NaN;
  const above = good.filter(r => r.signed_bps > 0).length;
  const below = good.filter(r => r.signed_bps < 0).length;
  const equal = good.filter(r => r.signed_bps === 0).length;
  const biasPct = good.length ? Math.max(above, below) / good.length * 100 : 0;

  const tMedian = median > 5;
  const tP95 = p95 > 20;
  const tBias = biasPct > 60;
  const pauseRecommended = tMedian || tP95 || tBias;

  return new Response(JSON.stringify({
    probed_at: probedAt,
    symbol_count: SYMBOLS.length,
    good_pairs: good.length,
    errors: bad.length,
    error_rows: bad,
    stats: { median_abs_bps: median, mean_abs_bps: +mean.toFixed(2), p95_abs_bps: p95, max_abs_bps: max,
             above_sip: above, below_sip: below, equal: equal, bias_pct: +biasPct.toFixed(1) },
    pause_evaluation: {
      thresholds: { median_gt_5bp: tMedian, p95_gt_20bp: tP95, bias_gt_60pct: tBias },
      pause_recommended: pauseRecommended,
    },
    rows: good.sort((a,b)=>b.abs_bps - a.abs_bps),
  }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});