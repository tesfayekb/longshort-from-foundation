/**
 * overshoot-russell-probe — ACT-538 scoped probe (ACT-511 U2 authoritative
 * roster prerequisite; INC-109 fix path data-source verification).
 *
 * One-shot handler: confirms whether the currently-scoped POLYGON_API_KEY
 * can list Russell 2000 membership via `/v3/reference/tickers`. Returns
 * page-1 shape only ({count, sample_first_10, next_url_seen}) — NO DB
 * writes, NO secret material in the response, NO iteration over next_url.
 *
 * Wired disarmed at authoring (job_registry id='overshoot.russell_probe',
 * enabled=false, schedule='manual'). Operator invokes via POST after
 * arming the row. Cron does NOT execute this fn.
 *
 * DEC-023 envelope. Cron-secret path unused (schedule='manual'); manual
 * path requires an authenticated JWT with `overshoot.manage` (mirrors
 * overshoot-backfill-*-manual precedent).
 *
 * Owner: overshoot (ACT-538 sub-turn).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';

const POLYGON_BASE_URL = 'https://api.polygon.io';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth.response;
  await checkPermissionOrThrow(auth.userId, 'overshoot.manage');

  const apiKey = Deno.env.get('POLYGON_API_KEY') ?? '';
  if (!apiKey) {
    return apiError(500, 'polygon_api_key_missing', { correlationId });
  }

  // Per ACT-538 charter §Path(a): `/v3/reference/tickers?index=russell2000&active=true&limit=1000`.
  // Page 1 only — the probe answers a boolean question (does the currently-
  // scoped key list this index? and how many on the first page?). Full
  // pagination is the refresh handler's job, not the probe's.
  const url =
    `${POLYGON_BASE_URL}/v3/reference/tickers` +
    `?index=russell2000&active=true&limit=1000` +
    `&apiKey=${encodeURIComponent(apiKey)}`;

  let resp: Response;
  try {
    resp = await fetch(url, { method: 'GET' });
  } catch (e) {
    return apiError(502, 'polygon_network_error', {
      correlationId,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  const status = resp.status;
  let body: unknown = null;
  try {
    body = await resp.json();
  } catch {
    body = null;
  }

  if (status === 403 || status === 401) {
    return apiSuccess({
      ok: false,
      probe: 'russell2000',
      status: 'subscription_gated',
      http_status: status,
      correlationId,
    });
  }
  if (status !== 200 || body === null || typeof body !== 'object') {
    return apiSuccess({
      ok: false,
      probe: 'russell2000',
      status: 'data_unavailable',
      http_status: status,
      correlationId,
    });
  }

  const b = body as { results?: Array<{ ticker?: string }>; count?: number; next_url?: string };
  const results = Array.isArray(b.results) ? b.results : [];
  const sample_first_10 = results
    .slice(0, 10)
    .map((r) => (typeof r.ticker === 'string' ? r.ticker : null))
    .filter((t): t is string => t !== null);

  return apiSuccess({
    ok: true,
    probe: 'russell2000',
    status: 'reports',
    http_status: status,
    page1_result_count: results.length,
    polygon_reported_count: typeof b.count === 'number' ? b.count : null,
    sample_first_10,
    next_url_seen: typeof b.next_url === 'string' && b.next_url.length > 0,
    correlationId,
  });
}));