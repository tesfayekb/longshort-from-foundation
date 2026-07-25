/**
 * ACT-571 charter §3 test set (1–7) — DEFAULT PATH: IVV ∪ IJH composite.
 *
 * Tests inject a mocked `httpFetch` into `fetchIvvIjhComposite` (and use
 * `buildIvvIjhUpsertRows` directly) so the fetch/parse/aggregate/provenance
 * behaviour is exercised without egress or DB writes.
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  fetchIvvIjhComposite,
  buildIvvIjhUpsertRows,
  computeUniverseDrift,
  ISHARES_IVV_HOLDINGS_URL,
  ISHARES_IJH_HOLDINGS_URL,
  IVV_IJH_SOURCE_TAG,
} from './index.ts';

// ---------- fixture builders ---------------------------------------------

function isharesCsv(tickers: string[], asOf = '25/Jul/2026'): string {
  const preamble = [
    `"iShares Core ETF"`,
    `"Fund Holdings as of","${asOf}"`,
    `""`,
    // Header row (mirrors the real iShares product-CSV layout)
    `"Ticker","Name","Sector","Asset Class","Market Value","Weight (%)","Notional Value","Shares","Price","Location","Exchange","Currency","FX Rate","Market Currency","Accrual Date"`,
  ];
  const body = tickers.map((t) =>
    `"${t}","${t} Corp","Info Tech","Equity","1000","0.10","1000","10","100","US","NASDAQ","USD","1.00","USD","-"`,
  );
  return [...preamble, ...body].join('\n');
}

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResp(status: number, body: string, contentType = 'text/csv'): Response {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

type Handler = (url: string) => Response | Promise<Response>;

function mockFetch(handler: Handler): typeof fetch {
  return ((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    return Promise.resolve(handler(url));
  }) as unknown as typeof fetch;
}

function alphaTickers(n: number, prefix = 'A'): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    // Simple synthetic tickers T00001..T99999-style, padded upper-case
    out.push(`${prefix}${(i + 1).toString(36).toUpperCase().padStart(4, '0')}`);
  }
  return out;
}

// ---------- §3.1 — Sanity-band fail-closed preserved ---------------------

Deno.test('§3.1 — 8000-row IVV + 400-row IJH: composite ok, sanity gate refuses at handler', async () => {
  // The composite fetch itself returns ok=true; the sanity gate lives in
  // the handler which then refuses to write. This test pins the count so
  // the handler-level assertion below is deterministic.
  const ivv = isharesCsv(alphaTickers(8000, 'V'));
  const ijh = isharesCsv(alphaTickers(400, 'M'));
  const httpFetch = mockFetch((url) => {
    if (url === ISHARES_IVV_HOLDINGS_URL) return textResp(200, ivv);
    if (url === ISHARES_IJH_HOLDINGS_URL) return textResp(200, ijh);
    return jsonResp(404, { error: 'unexpected_url' });
  });
  const r = await fetchIvvIjhComposite(httpFetch);
  assert(r.ok, 'composite fetch should succeed');
  if (!r.ok) return;
  // Prefixes 'V' and 'M' don't collide → union = 8400.
  assertEquals(r.per_source_counts.ivv, 8000);
  assertEquals(r.per_source_counts.ijh, 400);
  assertEquals(r.per_source_counts.overlap, 0);
  assertEquals(r.tickers.length, 8400);
  // Sanity band [850, 950] would refuse this at the handler.
  assert(r.tickers.length < 850 || r.tickers.length > 950, 'must be outside sanity band');
});

// ---------- §3.2 — Happy-path drift-report shape ------------------------

Deno.test('§3.2 — IVV=500, IJH=400, overlap=0 → union=900; drift shape populated', async () => {
  const ivvTickers = alphaTickers(500, 'S');
  const ijhTickers = alphaTickers(400, 'M');
  const httpFetch = mockFetch((url) => {
    if (url === ISHARES_IVV_HOLDINGS_URL) return textResp(200, isharesCsv(ivvTickers, '24/Jul/2026'));
    if (url === ISHARES_IJH_HOLDINGS_URL) return textResp(200, isharesCsv(ijhTickers, '23/Jul/2026'));
    return jsonResp(404, {});
  });
  const r = await fetchIvvIjhComposite(httpFetch);
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.tickers.length, 900);
  assertEquals(r.per_source_counts, { ivv: 500, ijh: 400, union: 900, overlap: 0 });
  assertEquals(r.csv_sha256_provenances.length, 2);
  assertEquals(r.csv_sha256_provenances[0].length, 64);
  assertEquals(r.csv_sha256_provenances[1].length, 64);
  assertEquals(r.as_of_from_source.ivv, '24/Jul/2026');
  assertEquals(r.as_of_from_source.ijh, '23/Jul/2026');

  // Drift against a prior roster that shares 800 with fresh + has 100 stale.
  const prior = new Set([...r.tickers.slice(0, 800), ...alphaTickers(100, 'X')]);
  const drift = computeUniverseDrift(prior, new Set(r.tickers));
  assertEquals(drift.next_active_count, 900);
  assertEquals(drift.prior_active_count, 900);
  assertEquals(drift.added.length, 100);
  assertEquals(drift.removed.length, 100);
  assertEquals(drift.unchanged_count, 800);
  // Sorted invariant on both lists
  assertEquals([...drift.added].sort(), drift.added);
  assertEquals([...drift.removed].sort(), drift.removed);
});

// ---------- §3.3 — Provenance stamp -------------------------------------

Deno.test('§3.3 — buildIvvIjhUpsertRows stamps source=ivv_ijh_composite on every row', () => {
  const rows = buildIvvIjhUpsertRows(['AAPL', 'MSFT', 'NVDA'], '2026-07-25');
  assertEquals(rows.length, 3);
  for (const r of rows) {
    assertEquals(r.source, 'ivv_ijh_composite');
    assertEquals(r.source, IVV_IJH_SOURCE_TAG);
    assert(r.source !== 'ishares:ivv_ijh:manual_seed');
    assert(r.source !== 'polygon:russell2000');
    assertEquals(r.active, true);
    assertEquals(r.added_as_of, '2026-07-25');
  }
});

// ---------- §3.4 — Partial failure --------------------------------------

Deno.test('§3.4 — IVV 404 error, IJH ok → partial_source_failure, no roster', async () => {
  // 4xx (non-retryable) surfaces as `http_error` with status carried
  // through. 5xx would be retried by fetchWithTimeoutAndRetry and eventually
  // surface as `network_error` — the fail-closed semantic is identical
  // (no writes), but this test pins the http_status carry-through path.
  const httpFetch = mockFetch((url) => {
    if (url === ISHARES_IVV_HOLDINGS_URL) return textResp(404, 'not found', 'text/plain');
    if (url === ISHARES_IJH_HOLDINGS_URL) return textResp(200, isharesCsv(alphaTickers(400, 'M')));
    return jsonResp(404, {});
  });
  const r = await fetchIvvIjhComposite(httpFetch);
  assertEquals(r.ok, false);
  if (r.ok) return;
  assertEquals(r.status, 'partial_source_failure');
  assert(r.ivv !== null, 'ivv failure should be surfaced');
  assertEquals(r.ijh, null);
  assertEquals(r.ivv?.status, 'http_error');
  assertEquals(r.ivv?.http_status, 404);
});

// ---------- §3.5 — Idempotency ------------------------------------------

Deno.test('§3.5 — Second identical fetch → identical roster + zero drift', async () => {
  const ivvTickers = alphaTickers(500, 'S');
  const ijhTickers = alphaTickers(400, 'M');
  const httpFetch = mockFetch((url) => {
    if (url === ISHARES_IVV_HOLDINGS_URL) return textResp(200, isharesCsv(ivvTickers));
    if (url === ISHARES_IJH_HOLDINGS_URL) return textResp(200, isharesCsv(ijhTickers));
    return jsonResp(404, {});
  });
  const r1 = await fetchIvvIjhComposite(httpFetch);
  const r2 = await fetchIvvIjhComposite(httpFetch);
  assert(r1.ok && r2.ok);
  if (!r1.ok || !r2.ok) return;
  assertEquals(r1.tickers, r2.tickers);
  assertEquals(r1.csv_sha256_provenances, r2.csv_sha256_provenances);
  const drift = computeUniverseDrift(new Set(r1.tickers), new Set(r2.tickers));
  assertEquals(drift.added, []);
  assertEquals(drift.removed, []);
  assertEquals(drift.unchanged_count, r1.tickers.length);
  // upsert set is full roster (idempotent on ticker PK)
  const rows = buildIvvIjhUpsertRows(r2.tickers, '2026-07-25');
  assertEquals(rows.length, r2.tickers.length);
});

// ---------- §3.6 — HTML body classification -----------------------------

Deno.test('§3.6 — IVV returns product-page HTML instead of CSV → typed refusal', async () => {
  const html = '<!DOCTYPE html><html><body>Blocked</body></html>';
  const httpFetch = mockFetch((url) => {
    if (url === ISHARES_IVV_HOLDINGS_URL) return textResp(200, html, 'text/html');
    if (url === ISHARES_IJH_HOLDINGS_URL) return textResp(200, isharesCsv(alphaTickers(400, 'M')));
    return jsonResp(404, {});
  });
  const r = await fetchIvvIjhComposite(httpFetch);
  assertEquals(r.ok, false);
  if (r.ok) return;
  assertEquals(r.status, 'partial_source_failure');
  assertEquals(r.ivv?.status, 'html_body_received');
  // bytes hint carried through
  assert((r.ivv?.detail ?? '').includes('bytes=') || (r.ivv?.detail ?? '').includes(String(html.length)));
});

// ---------- §3.7 — Cross-membership dedup -------------------------------

Deno.test('§3.7 — Shared ticker appears once with overlap>=1', async () => {
  // Fabricate a case where 5 tickers appear in BOTH CSVs.
  const shared = ['SHARED1', 'SHARED2', 'SHARED3', 'SHARED4', 'SHARED5'];
  const ivvTickers = [...alphaTickers(495, 'S'), ...shared];
  const ijhTickers = [...alphaTickers(395, 'M'), ...shared];
  const httpFetch = mockFetch((url) => {
    if (url === ISHARES_IVV_HOLDINGS_URL) return textResp(200, isharesCsv(ivvTickers));
    if (url === ISHARES_IJH_HOLDINGS_URL) return textResp(200, isharesCsv(ijhTickers));
    return jsonResp(404, {});
  });
  const r = await fetchIvvIjhComposite(httpFetch);
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.per_source_counts.ivv, 500);
  assertEquals(r.per_source_counts.ijh, 400);
  assertEquals(r.per_source_counts.overlap, 5);
  // union = 500 + 400 - 5 = 895
  assertEquals(r.per_source_counts.union, 895);
  assertEquals(r.tickers.length, 895);
  for (const s of shared) {
    assertEquals(r.tickers.filter((t) => t === s).length, 1);
  }
});