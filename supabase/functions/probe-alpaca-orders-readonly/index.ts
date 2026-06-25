// READ-ONLY investigation probe (ACT-326 / corr bb3810bf). Lists recent
// Alpaca paper orders to determine whether the 13:38 GMT spot_check fire
// placed a real order before the reconciliation_events insert threw.
// Superadmin-gated; GET only; performs no writes.
Deno.serve(async (req: Request) => {
  const provided = req.headers.get('x-cron-secret');
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  const key = Deno.env.get('ALPACA_PAPER_KEY')!;
  const secret = Deno.env.get('ALPACA_PAPER_SECRET')!;
  const after = '2026-06-25T13:30:00Z';
  const url = `https://paper-api.alpaca.markets/v2/orders?status=all&after=${encodeURIComponent(after)}&direction=desc&limit=50`;
  const r = await fetch(url, { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret, 'Accept': 'application/json' } });
  const body = await r.text();
  return new Response(JSON.stringify({ status: r.status, body: JSON.parse(body) }), { status: 200, headers: { 'content-type': 'application/json' } });
});