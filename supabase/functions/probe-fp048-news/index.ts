// Transient FP-048 Phase 0 probe — Polygon news endpoint vendor-shape audit.
// Investigation-only; not wired to any production code path. Deletable post-probe.
Deno.serve(async (req) => {
  const key = Deno.env.get("POLYGON_API_KEY") ?? "";
  const url = new URL(req.url);
  const qs = url.searchParams.get("qs") ?? "ticker=AAPL&limit=10";
  const target = `https://api.polygon.io/v2/reference/news?${qs}&apiKey=${key}`;
  const t0 = Date.now();
  const resp = await fetch(target);
  const body = await resp.text();
  return new Response(JSON.stringify({
    status: resp.status,
    elapsed_ms: Date.now() - t0,
    key_len: key.length,
    body: body.slice(0, 80000),
  }), { headers: { "content-type": "application/json" } });
});