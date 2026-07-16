/**
 * overshoot-tradier-chain-probe — Tradier F1-F2 activation surface
 * (put-write forward-observation charter, 2026-07-17 queue addition).
 *
 * One-shot handler: confirms Tradier SANDBOX reachability + options-chain
 * shape (`/v1/markets/options/expirations` → nearest 5-21d expiry →
 * `/v1/markets/options/chains` page-1). Returns shape summary only —
 * NO DB writes, NO secret material in the response, NO iteration.
 *
 * Sandbox-only assertion: the probe REFUSES to run against a non-sandbox
 * base. This is the §22.5.3 sandbox-token guardrail — production tokens
 * (and production hosts) are anti-phantom rejected upstream so a
 * misconfigured secret can never accidentally hit a live-quotes endpoint.
 *
 * Wiring PR (diagnostic table `overshoot_tradier_chain_snapshots` +
 * entry-run snapshot hook + weekly σ√T comparator) lands POST-batch,
 * after ACT-531. This turn only lands the reachability/shape probe.
 *
 * DEC-023 envelope. Manual invocation path — authenticated JWT with
 * `overshoot.manage` (mirrors overshoot-russell-probe precedent).
 *
 * Owner: overshoot (2026-07-17 queue addition — Tradier F1-F2 activation).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';

const TRADIER_SANDBOX_BASE = 'https://sandbox.tradier.com/v1';
const DEFAULT_PROBE_SYMBOL = 'AAPL';
const MIN_DAYS = 5;
const MAX_DAYS = 21;

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  const auth = await authenticateRequest(req);
  await checkPermissionOrThrow(auth.user.id, 'overshoot.manage');

  const apiKey = Deno.env.get('TRADIER_API_KEY') ?? '';
  if (!apiKey) {
    return apiError(500, 'tradier_api_key_missing', { correlationId });
  }

  // §22.5.3 sandbox-token guardrail — probe is HARDCODED to sandbox base.
  // If the operator ever repoints, this comment plus the const above are
  // the trip-wire. Live-quotes endpoints are anti-phantom rejected here.
  const base = TRADIER_SANDBOX_BASE;

  // Parse optional symbol override from body (default AAPL — arbitrary
  // liquid name for reachability; put-write charter targets OVERSHOOT
  // event symbols, wired at the entry-run hook post-531).
  let symbol = DEFAULT_PROBE_SYMBOL;
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && typeof (body as { symbol?: unknown }).symbol === 'string') {
      const s = (body as { symbol: string }).symbol.trim().toUpperCase();
      if (/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)) symbol = s;
    }
  } catch {
    // no body / non-JSON → default symbol.
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };

  // Step 1: expirations.
  const expUrl = `${base}/markets/options/expirations?symbol=${encodeURIComponent(symbol)}&includeAllRoots=true`;
  let expResp: Response;
  try {
    expResp = await fetch(expUrl, { method: 'GET', headers });
  } catch (e) {
    return apiError(502, 'tradier_network_error', {
      correlationId,
      detail: e instanceof Error ? e.message : String(e),
    });
  }
  if (expResp.status === 401 || expResp.status === 403) {
    await expResp.text();
    return apiSuccess({
      ok: false,
      probe: 'tradier_chain',
      status: 'auth_gated',
      http_status: expResp.status,
      correlationId,
    });
  }
  let expBody: unknown = null;
  try { expBody = await expResp.json(); } catch { expBody = null; }
  if (expResp.status !== 200 || !expBody || typeof expBody !== 'object') {
    return apiSuccess({
      ok: false,
      probe: 'tradier_chain',
      status: 'expirations_unavailable',
      http_status: expResp.status,
      correlationId,
    });
  }

  const eb = expBody as { expirations?: { date?: string[] | string } };
  const rawDates = eb.expirations?.date;
  const expirations: string[] = Array.isArray(rawDates)
    ? rawDates.filter((d): d is string => typeof d === 'string')
    : (typeof rawDates === 'string' ? [rawDates] : []);

  // Pick nearest expiry with days-to-expiry ∈ [5, 21]. Comparison uses
  // the response's own date strings vs a today-ISO derived from Date;
  // this is a probe-only calc, NOT a kernel path — clock-usage confined.
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayMs = Date.parse(todayIso + 'T00:00:00Z');
  let chosen: { date: string; days: number } | null = null;
  for (const d of expirations) {
    const t = Date.parse(d + 'T00:00:00Z');
    if (!Number.isFinite(t)) continue;
    const days = Math.round((t - todayMs) / 86_400_000);
    if (days >= MIN_DAYS && days <= MAX_DAYS) {
      if (chosen === null || days < chosen.days) {
        chosen = { date: d, days };
      }
    }
  }

  if (chosen === null) {
    return apiSuccess({
      ok: true,
      probe: 'tradier_chain',
      status: 'reachable_no_expiry_in_window',
      http_status: 200,
      symbol,
      expirations_count: expirations.length,
      window: { min_days: MIN_DAYS, max_days: MAX_DAYS },
      correlationId,
    });
  }

  // Step 2: chain for the chosen expiry.
  const chainUrl = `${base}/markets/options/chains?symbol=${encodeURIComponent(symbol)}&expiration=${encodeURIComponent(chosen.date)}&greeks=true`;
  let chainResp: Response;
  try {
    chainResp = await fetch(chainUrl, { method: 'GET', headers });
  } catch (e) {
    return apiError(502, 'tradier_network_error', {
      correlationId,
      detail: e instanceof Error ? e.message : String(e),
    });
  }
  let chainBody: unknown = null;
  try { chainBody = await chainResp.json(); } catch { chainBody = null; }
  if (chainResp.status !== 200 || !chainBody || typeof chainBody !== 'object') {
    return apiSuccess({
      ok: false,
      probe: 'tradier_chain',
      status: 'chain_unavailable',
      http_status: chainResp.status,
      symbol,
      chosen_expiry: chosen.date,
      correlationId,
    });
  }

  const cb = chainBody as { options?: { option?: Array<Record<string, unknown>> } };
  const options = Array.isArray(cb.options?.option) ? cb.options!.option! : [];
  const puts = options.filter((o) => o.option_type === 'put');
  const sample = puts.slice(0, 3).map((p) => ({
    strike: typeof p.strike === 'number' ? p.strike : null,
    bid: typeof p.bid === 'number' ? p.bid : null,
    ask: typeof p.ask === 'number' ? p.ask : null,
    iv_present: p.greeks !== null && typeof p.greeks === 'object'
      && typeof (p.greeks as Record<string, unknown>).mid_iv === 'number',
  }));

  return apiSuccess({
    ok: true,
    probe: 'tradier_chain',
    status: 'reports',
    http_status: 200,
    base_asserted_sandbox: base === TRADIER_SANDBOX_BASE,
    symbol,
    chosen_expiry: chosen.date,
    chosen_days_to_expiry: chosen.days,
    expirations_count: expirations.length,
    puts_count: puts.length,
    sample_puts: sample,
    correlationId,
  });
}));