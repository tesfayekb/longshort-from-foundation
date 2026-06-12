// FP-049 Phase-0 vendor probe — Signal #9 (Active Catalyst Flag).
// Transient scaffolding — deployed for investigation only; deleted SAME PR.
// Reads existing FMP_API_KEY / POLYGON_API_KEY / FINNHUB_API_KEY secrets.
// No DB writes. No auth (intended for one-shot operator probe). Redacts keys.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const FMP = Deno.env.get('FMP_API_KEY') ?? '';
const POLY = Deno.env.get('POLYGON_API_KEY') ?? '';
const FINN = Deno.env.get('FINNHUB_API_KEY') ?? '';

type ProbeResult = {
  name: string;
  vendor: 'fmp' | 'polygon' | 'finnhub';
  url: string;
  status: number;
  wall_ms: number;
  bytes?: number;
  count?: number;
  keys?: string[];
  sample?: unknown;
  error?: string;
};

function redact(s: string): string {
  return s.replace(/apikey=[^&]+/gi, 'apikey=***').replace(/token=[^&]+/gi, 'token=***');
}

async function probe(name: string, vendor: ProbeResult['vendor'], url: string, headers: Record<string,string> = {}): Promise<ProbeResult> {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { headers });
    const wall_ms = Math.round(performance.now() - t0);
    const text = await r.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    const arr = Array.isArray(json) ? json : (json && typeof json === 'object' && 'results' in json && Array.isArray((json as Record<string, unknown>).results) ? (json as Record<string, unknown>).results as unknown[] : null);
    const out: ProbeResult = { name, vendor, url: redact(url), status: r.status, wall_ms, bytes: text.length };
    if (arr) {
      out.count = arr.length;
      const first = arr[0];
      if (first && typeof first === 'object') {
        out.keys = Object.keys(first as Record<string, unknown>);
        out.sample = first;
      }
    } else if (json && typeof json === 'object') {
      out.keys = Object.keys(json as Record<string, unknown>);
      out.sample = json;
    } else {
      out.sample = text.slice(0, 400);
    }
    return out;
  } catch (e) {
    return { name, vendor, url: redact(url), status: 0, wall_ms: Math.round(performance.now() - t0), error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);
  const which = url.searchParams.get('w') ?? 'all';

  // Trailing 7 calendar days window for general probes; today ± 30d for earnings calendars.
  const today = new Date().toISOString().slice(0, 10);
  const d7 = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const d30fwd = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  const results: ProbeResult[] = [];

  // ── FMP probes (≤40) ──
  if (which === 'all' || which === 'fmp') {
    const fmp = (p: string) => `https://financialmodelingprep.com${p}${p.includes('?') ? '&' : '?'}apikey=${FMP}`;
    // (1-2) Earnings calendar — backward 7d AND forward 30d (occurred vs upcoming question)
    results.push(await probe('fmp.earning-calendar.past7d', 'fmp', fmp(`/stable/earnings-calendar?from=${d7}&to=${today}`)));
    results.push(await probe('fmp.earning-calendar.fwd30d', 'fmp', fmp(`/stable/earnings-calendar?from=${today}&to=${d30fwd}`)));
    // (3) Earnings confirmed (if endpoint exists)
    results.push(await probe('fmp.earnings-confirmed', 'fmp', fmp(`/stable/earnings-confirmed?from=${d7}&to=${today}`)));
    // (4-5) M&A — try two known shapes
    results.push(await probe('fmp.ma-rss', 'fmp', fmp(`/stable/mergers-acquisitions-latest?page=0`)));
    results.push(await probe('fmp.ma-search', 'fmp', fmp(`/stable/mergers-acquisitions?symbol=AAPL`)));
    // (6) Grades feed (Signal #1 plumbing overlap)
    results.push(await probe('fmp.grades-latest', 'fmp', fmp(`/stable/grades-latest-news?page=0&limit=10`)));
    // (7) Dividends calendar
    results.push(await probe('fmp.dividends-calendar', 'fmp', fmp(`/stable/dividends-calendar?from=${d7}&to=${d30fwd}`)));
    // (8) Splits calendar
    results.push(await probe('fmp.splits-calendar', 'fmp', fmp(`/stable/splits-calendar?from=${d7}&to=${d30fwd}`)));
    // (9) IPO calendar
    results.push(await probe('fmp.ipo-calendar', 'fmp', fmp(`/stable/ipos-calendar?from=${d7}&to=${d30fwd}`)));
    // (10) Press releases (per-symbol)
    results.push(await probe('fmp.press-releases.AAPL', 'fmp', fmp(`/stable/press-releases?symbol=AAPL&page=0&limit=10`)));
    // (11) Press releases latest
    results.push(await probe('fmp.press-releases-latest', 'fmp', fmp(`/stable/news/press-releases-latest?page=0&limit=10`)));
    // (12) Executive changes / key executives — try executive compensation as proxy + general news
    results.push(await probe('fmp.key-executives.AAPL', 'fmp', fmp(`/stable/key-executives?symbol=AAPL`)));
    // (13) FDA calendar — does FMP have it?
    results.push(await probe('fmp.fda-calendar', 'fmp', fmp(`/stable/fda-calendar?from=${d7}&to=${d30fwd}`)));
    // (14) Earnings call transcript dates (proxy for conferences)
    results.push(await probe('fmp.earning-call-transcripts.AAPL', 'fmp', fmp(`/stable/earning-call-transcripts?symbol=AAPL`)));
    // (15) Stock news (general)
    results.push(await probe('fmp.stock-news.AAPL', 'fmp', fmp(`/stable/news/stock?symbols=AAPL&page=0&limit=10`)));
    // (16) Stock dividend (announce-date vs ex-date question)
    results.push(await probe('fmp.dividends.AAPL', 'fmp', fmp(`/stable/dividends?symbol=AAPL&limit=5`)));
    // (17-21) Coverage sample — last 7d earnings calendar count per 5 names (we already have one fetched; this is per-symbol probe)
    for (const t of ['NVDA','MSFT','JPM','JNJ','KO']) {
      results.push(await probe(`fmp.earnings.${t}`, 'fmp', fmp(`/stable/earnings?symbol=${t}&limit=5`)));
    }
    // (22) Insider transactions (Signal #4 overlap)
    results.push(await probe('fmp.insider-trading.AAPL', 'fmp', fmp(`/stable/insider-trading?symbol=AAPL&page=0&limit=10`)));
    // (23) Senate / house trades — long-tail "regulatory" proxy probe; skip if not relevant
    // (24) Stock buyback (treasury stock changes / share repurchase)
    results.push(await probe('fmp.share-repurchases.AAPL', 'fmp', fmp(`/stable/stock-repurchases?symbol=AAPL`)));
    // (25) Filter-honesty for earnings-calendar
    results.push(await probe('fmp.earning-calendar.filter-honesty', 'fmp', fmp(`/stable/earnings-calendar?from=2099-01-01&to=2099-01-02`)));
  }

  // ── Polygon probes (≤10) ──
  if (which === 'all' || which === 'poly') {
    const poly = (p: string) => `https://api.polygon.io${p}${p.includes('?') ? '&' : '?'}apiKey=${POLY}`;
    // (1) ticker events endpoint (corporate actions: splits, dividends, mergers, ticker_change)
    results.push(await probe('poly.ticker-events.AAPL', 'polygon', poly(`/vX/reference/tickers/AAPL/events?types=ticker_change,name_change`)));
    // (2) splits
    results.push(await probe('poly.splits', 'polygon', poly(`/v3/reference/splits?execution_date.gte=${d7}&execution_date.lte=${d30fwd}&limit=50`)));
    // (3) dividends
    results.push(await probe('poly.dividends', 'polygon', poly(`/v3/reference/dividends?ex_dividend_date.gte=${d7}&ex_dividend_date.lte=${d30fwd}&limit=50`)));
    // (4) news with insights+keywords for AAPL trailing 7d
    results.push(await probe('poly.news.AAPL.keywords', 'polygon', poly(`/v2/reference/news?ticker=AAPL&published_utc.gte=${d7}&limit=50&order=desc&sort=published_utc`)));
    // (5) news global with insights[] trailing 24h (catalyst proximity check)
    results.push(await probe('poly.news.global.1d', 'polygon', poly(`/v2/reference/news?published_utc.gte=${today}&limit=100`)));
    // (6) earnings — Polygon doesn't ship earnings endpoint at our entitlement; probe to confirm
    results.push(await probe('poly.financials.AAPL', 'polygon', poly(`/vX/reference/financials?ticker=AAPL&limit=5`)));
    // (7) IPOs
    results.push(await probe('poly.ipos', 'polygon', poly(`/vX/reference/ipos?listing_date.gte=${d7}&listing_date.lte=${d30fwd}&limit=20`)));
    // (8) ticker types — sanity
    results.push(await probe('poly.news.keywords-sample.MA', 'polygon', poly(`/v2/reference/news?ticker=MA&published_utc.gte=${d7}&limit=20`)));
    // (9) news for biotech catalyst (FDA) — Pfizer trailing 7d
    results.push(await probe('poly.news.PFE.fda', 'polygon', poly(`/v2/reference/news?ticker=PFE&published_utc.gte=${d7}&limit=20`)));
    // (10) news for CEO change canary — DIS or BA
    results.push(await probe('poly.news.BA.exec', 'polygon', poly(`/v2/reference/news?ticker=BA&published_utc.gte=${d7}&limit=20`)));
  }

  // ── Finnhub probes (≤10) ──
  if (which === 'all' || which === 'finn') {
    const finn = (p: string) => `https://finnhub.io/api/v1${p}${p.includes('?') ? '&' : '?'}token=${FINN}`;
    // (1) earnings-calendar
    results.push(await probe('finn.earnings-calendar.7d', 'finnhub', finn(`/calendar/earnings?from=${d7}&to=${today}`)));
    // (2) earnings-calendar fwd
    results.push(await probe('finn.earnings-calendar.fwd30d', 'finnhub', finn(`/calendar/earnings?from=${today}&to=${d30fwd}`)));
    // (3) ipo-calendar
    results.push(await probe('finn.ipo-calendar', 'finnhub', finn(`/calendar/ipo?from=${d7}&to=${d30fwd}`)));
    // (4) M&A
    results.push(await probe('finn.merger', 'finnhub', finn(`/stock/merger?symbol=AAPL`)));
    // (5) FDA calendar
    results.push(await probe('finn.fda-calendar', 'finnhub', finn(`/fda-advisory-committee-calendar`)));
    // (6) company-news with categories
    results.push(await probe('finn.company-news.AAPL', 'finnhub', finn(`/company-news?symbol=AAPL&from=${d7}&to=${today}`)));
    // (7) press releases
    results.push(await probe('finn.press-releases.AAPL', 'finnhub', finn(`/press-releases?symbol=AAPL&from=${d7}&to=${today}`)));
    // (8) dividends
    results.push(await probe('finn.dividends', 'finnhub', finn(`/stock/dividend?symbol=AAPL&from=${d7}&to=${d30fwd}`)));
    // (9) splits
    results.push(await probe('finn.splits', 'finnhub', finn(`/stock/split?symbol=AAPL&from=${d7}&to=${d30fwd}`)));
    // (10) executive — recommendation trends (analyst rating proxy)
    results.push(await probe('finn.recommendation.AAPL', 'finnhub', finn(`/stock/recommendation?symbol=AAPL`)));
  }

  return new Response(JSON.stringify({ today, d7, d30fwd, results }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});