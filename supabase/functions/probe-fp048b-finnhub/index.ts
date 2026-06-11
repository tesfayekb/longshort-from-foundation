/**
 * Transient probe for FP-048 Phase-0b — Finnhub news cross-probe.
 * Deleted same-PR per Phase-0 precedent. Bounded ≤15 calls.
 */
import { corsHeaders } from '../_shared/cors.ts';

const KEY = Deno.env.get('FINNHUB_API_KEY') ?? '';
const BASE = 'https://finnhub.io/api/v1';

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

async function get(path: string): Promise<{ status: number; bytes: number; json: unknown }> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE}${path}${sep}token=${encodeURIComponent(KEY)}`;
  const t0 = Date.now();
  const r = await fetch(url);
  const text = await r.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { json = text.slice(0, 400); }
  return { status: r.status, bytes: text.length, json } as const;
}

Deno.serve(async (_req) => {
  if (_req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const out: Record<string, unknown> = { key_present: KEY.length > 0, calls: 0 };
  const calls: string[] = [];

  const today = new Date();
  const back7 = new Date(today.getTime() - 7 * 86_400_000);
  const from = ymd(back7);
  const to = ymd(today);

  // (1) Entitlement + shape (AAPL)
  const aapl = await get(`/company-news?symbol=AAPL&from=${from}&to=${to}`);
  calls.push(`company-news AAPL ${aapl.status} ${aapl.bytes}B`);
  const aaplArr = Array.isArray(aapl.json) ? aapl.json as Record<string, unknown>[] : [];
  out.aapl_status = aapl.status;
  out.aapl_count = aaplArr.length;
  out.aapl_sample3 = aaplArr.slice(0, 3).map((x) => ({
    ...x,
    // redact nothing — public-news endpoint; keep as-is
  }));
  out.aapl_keys = aaplArr[0] ? Object.keys(aaplArr[0]) : [];
  out.aapl_has_sentiment_field = aaplArr[0]
    ? ['sentiment', 'sentiment_score', 'score'].some((k) => k in aaplArr[0])
    : null;

  // (2) Publisher pool across strata
  const symbols = ['AAPL', 'NVDA', 'JPM', 'CAT', 'NKE', 'MA'];
  const publisherCounts: Record<string, number> = {};
  const perSymbol: Record<string, number> = {};
  const datetimePrecisionSample: number[] = [];
  const idPerSymbol: Record<string, number[]> = {};
  const relatedSample: Array<{ id: number; related: unknown; symbol: string }> = [];

  for (const s of symbols) {
    const r = await get(`/company-news?symbol=${s}&from=${from}&to=${to}`);
    calls.push(`company-news ${s} ${r.status} ${r.bytes}B`);
    const arr = Array.isArray(r.json) ? r.json as Record<string, unknown>[] : [];
    perSymbol[s] = arr.length;
    idPerSymbol[s] = [];
    for (const a of arr) {
      const src = String(a.source ?? 'UNKNOWN');
      publisherCounts[src] = (publisherCounts[src] ?? 0) + 1;
      if (typeof a.datetime === 'number') datetimePrecisionSample.push(a.datetime);
      if (typeof a.id === 'number') idPerSymbol[s].push(a.id);
      if (relatedSample.length < 5 && a.related) {
        relatedSample.push({ id: Number(a.id), related: a.related, symbol: s });
      }
    }
  }
  out.per_symbol_counts = perSymbol;
  out.publisher_counts = publisherCounts;

  // Dedup check: same article id appearing under multiple symbols
  const idToSyms: Record<string, string[]> = {};
  for (const [s, ids] of Object.entries(idPerSymbol)) {
    for (const id of ids) {
      (idToSyms[id] = idToSyms[id] ?? []).push(s);
    }
  }
  const cross = Object.entries(idToSyms).filter(([, ss]) => ss.length > 1).slice(0, 10);
  out.cross_symbol_dedup_examples = cross;
  out.cross_symbol_dedup_count = Object.values(idToSyms).filter((ss) => ss.length > 1).length;
  out.related_field_samples = relatedSample;

  // Datetime precision: check if any sub-minute or just minute-level
  out.datetime_sample = datetimePrecisionSample.slice(0, 5);
  out.datetime_unix_seconds = datetimePrecisionSample.every((t) => t > 1_000_000_000 && t < 10_000_000_000);

  // (3) /news-sentiment AAPL
  const ns = await get(`/news-sentiment?symbol=AAPL`);
  calls.push(`news-sentiment AAPL ${ns.status} ${ns.bytes}B`);
  out.news_sentiment_status = ns.status;
  out.news_sentiment_body = ns.json;

  // (5) Press-release publishers — check for PR wires in pool
  const prWires = ['GlobeNewswire', 'Globe Newswire', 'Business Wire', 'BusinessWire', 'PR Newswire', 'PRNewswire', 'Accesswire', 'GlobeNewswire Inc.'];
  out.pr_wires_seen = prWires.filter((p) =>
    Object.keys(publisherCounts).some((src) => src.toLowerCase().includes(p.toLowerCase().split(' ')[0]))
  );

  out.calls = calls.length;
  out.call_log = calls;
  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});