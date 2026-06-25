// READ-ONLY investigation probe (ACT-326 / corr bb3810bf). Lists recent
// Alpaca paper orders to determine whether the 13:38 GMT spot_check fire
// placed a real order before the reconciliation_events insert threw.
// Superadmin-gated; GET only; performs no writes.
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { apiError } from '../_shared/api-error.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'GET') return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  const auth = await authenticateRequest(req);
  await checkPermissionOrThrow(auth.user.id, 'longshort.execute');
  const key = Deno.env.get('ALPACA_PAPER_KEY')!;
  const secret = Deno.env.get('ALPACA_PAPER_SECRET')!;
  const after = '2026-06-25T13:30:00Z';
  const url = `https://paper-api.alpaca.markets/v2/orders?status=all&after=${encodeURIComponent(after)}&direction=desc&limit=50`;
  const r = await fetch(url, { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret, 'Accept': 'application/json' } });
  const body = await r.text();
  return apiSuccess({ alpaca_status: r.status, orders: JSON.parse(body) });
}));