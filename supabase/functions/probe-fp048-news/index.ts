// Transient FP-048 Phase 0 probe — Polygon news endpoint vendor-shape audit.
// Investigation-only; not wired to any production code path. Deletable post-probe.
type Mode = "raw" | "summary" | "items" | "publishers" | "coverage";

Deno.serve(async (req) => {
  const key = Deno.env.get("POLYGON_API_KEY") ?? "";
  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") ?? "summary") as Mode;
  const qs = url.searchParams.get("qs") ?? "ticker=AAPL&limit=10";

  async function call(qs: string) {
    const target = `https://api.polygon.io/v2/reference/news?${qs}&apiKey=${key}`;
    const t0 = Date.now();
    const resp = await fetch(target);
    const body = await resp.json().catch(() => ({}));
    return { status: resp.status, elapsed_ms: Date.now() - t0, body };
  }

  if (mode === "raw") {
    const r = await call(qs);
    // Trim each result's fields to keep payload small.
    const results = (r.body?.results ?? []).slice(0, 3).map((x: any) => ({
      id: x.id, title: x.title, author: x.author, publisher: x.publisher,
      published_utc: x.published_utc, tickers: x.tickers, keywords: x.keywords,
      insights: x.insights, description: (x.description ?? "").slice(0, 200),
    }));
    return j({ status: r.status, elapsed_ms: r.elapsed_ms, count: r.body?.results?.length, next_url: !!r.body?.next_url, results });
  }

  if (mode === "items") {
    const r = await call(qs);
    const items = (r.body?.results ?? []).map((x: any) => ({
      publisher: x.publisher?.name, published_utc: x.published_utc,
      tickers: x.tickers, has_insights: Array.isArray(x.insights), insights: x.insights,
    }));
    return j({ status: r.status, count: items.length, next_url: r.body?.next_url ? true : false, items });
  }

  if (mode === "publishers") {
    // Global feed: ?qs=published_utc.gte=YYYY-MM-DD&limit=1000
    const r = await call(qs);
    const results = r.body?.results ?? [];
    const pubCounts: Record<string, number> = {};
    let withInsights = 0;
    const sentimentVals = new Set<string>();
    for (const x of results) {
      const p = x.publisher?.name ?? "<unknown>";
      pubCounts[p] = (pubCounts[p] ?? 0) + 1;
      if (Array.isArray(x.insights) && x.insights.length > 0) {
        withInsights++;
        for (const ins of x.insights) sentimentVals.add(String(ins.sentiment));
      }
    }
    return j({
      status: r.status, elapsed_ms: r.elapsed_ms, count: results.length,
      next_url_present: !!r.body?.next_url,
      with_insights: withInsights,
      sentiment_values_seen: [...sentimentVals],
      publishers: Object.entries(pubCounts).sort((a, b) => b[1] - a[1]),
    });
  }

  if (mode === "coverage") {
    // qs is a comma-separated ticker list; for each: count items in trailing 7d
    const tickers = (url.searchParams.get("tickers") ?? "AAPL,MSFT,NVDA").split(",");
    const gte = url.searchParams.get("gte") ?? new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const out: Array<{ t: string; count: number; with_insights: number; status: number }> = [];
    for (const t of tickers) {
      const r = await call(`ticker=${t}&published_utc.gte=${gte}&limit=1000`);
      const res = r.body?.results ?? [];
      const wi = res.filter((x: any) => Array.isArray(x.insights) && x.insights.length > 0).length;
      out.push({ t, count: res.length, with_insights: wi, status: r.status });
    }
    return j({ gte, results: out });
  }

  // default summary
  const r = await call(qs);
  return j({ status: r.status, elapsed_ms: r.elapsed_ms, count: r.body?.results?.length, next_url_present: !!r.body?.next_url });
});

function j(o: unknown) {
  return new Response(JSON.stringify(o, null, 2), { headers: { "content-type": "application/json" } });
}