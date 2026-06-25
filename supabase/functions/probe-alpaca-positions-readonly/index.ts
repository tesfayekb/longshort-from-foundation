// READ-ONLY investigation probe (ACT-334 / state-truth check post corr ee1cbcce).
// Lists current Alpaca paper positions to verify flat-state before arming the
// autonomous cron. Mirrors probe-alpaca-orders-readonly exactly: same gate,
// same auth path, same paper-only URL guard (INC-77). GET only; performs no
// writes. NO POST/PUT/DELETE; NO money-path touch.
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
  // Paper-only URL guard (INC-77): hardcoded paper-api host; no live-api fallback.
  const url = 'https://paper-api.alpaca.markets/v2/positions';
  const r = await fetch(url, { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret, 'Accept': 'application/json' } });
  const body = await r.text();
  return apiSuccess({ alpaca_status: r.status, positions: JSON.parse(body) });
}));