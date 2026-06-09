/**
 * longshort-options-flow-worker — chunk worker for the FP-043 chunked
 * coordinator/worker architecture (Phase 3 / Signal #3).
 *
 * Receives a slice of the universe + per-worker pacing target from the
 * coordinator, fetches each ticker's Tradier expirations + chain through
 * a token-bucket-paced HttpFetch, computes the per-ticker raw signal,
 * and returns `{ ok: true, values, skips }`. Z-scoring and persistence
 * stay at the coordinator level (cross-chunk concerns).
 *
 * Auth: cron-secret only. Both the cron coordinator and the manual
 * coordinator authenticate operator intent and then call this worker
 * with `X-Cron-Secret`. The worker is NOT a public surface.
 *
 * Anti-phantom: a ticker that fails to fetch returns a typed `SignalSkip`
 * — never a fabricated zero value.
 *
 * Owner: longshort (FP-043 — Signal #3 / Phase 3)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { TradierOptionsChainFetcher } from '../_shared/longshort-signals/shared/tradier-options-chain-fetcher.ts';
import { TokenBucket, pacedHttpFetch } from '../_shared/longshort-signals/options-flow/token-bucket.ts';
import {
  runOptionsFlowChunk,
  type ChunkInputTicker,
} from '../_shared/longshort-signals/options-flow/options-flow-chunk-runner.ts';
import type { HttpFetch } from '../_shared/longshort-universe-interfaces.ts';

interface ParsedBody {
  chunk: ChunkInputTicker[];
  as_of: Date;
  rate_per_sec: number;
  correlation_id: string;
}

function parseBody(raw: unknown): { ok: true; body: ParsedBody } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'body_not_object' };
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.chunk)) return { ok: false, reason: 'chunk_not_array' };
  const chunk: ChunkInputTicker[] = [];
  for (const c of o.chunk) {
    if (typeof c !== 'object' || c === null) return { ok: false, reason: 'chunk_item_not_object' };
    const ci = c as Record<string, unknown>;
    if (typeof ci.ticker !== 'string' || ci.ticker.length === 0) {
      return { ok: false, reason: 'chunk_item_ticker_invalid' };
    }
    const gs = ci.gics_sector;
    if (gs !== null && typeof gs !== 'string') {
      return { ok: false, reason: 'chunk_item_gics_sector_invalid' };
    }
    chunk.push({ ticker: ci.ticker, gics_sector: gs });
  }
  if (typeof o.as_of !== 'string') return { ok: false, reason: 'as_of_not_string' };
  const asOfMs = Date.parse(o.as_of);
  if (!Number.isFinite(asOfMs)) return { ok: false, reason: 'as_of_invalid' };
  if (typeof o.rate_per_sec !== 'number' || !Number.isFinite(o.rate_per_sec) || o.rate_per_sec <= 0) {
    return { ok: false, reason: 'rate_per_sec_invalid' };
  }
  if (typeof o.correlation_id !== 'string' || o.correlation_id.length === 0) {
    return { ok: false, reason: 'correlation_id_invalid' };
  }
  return {
    ok: true,
    body: {
      chunk,
      as_of: new Date(asOfMs),
      rate_per_sec: o.rate_per_sec,
      correlation_id: o.correlation_id,
    },
  };
}

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const correlationId = crypto.randomUUID();

  let rawBody: unknown;
  try { rawBody = await req.json(); }
  catch { return apiError(400, 'invalid_json_body', { correlationId }); }

  const parsed = parseBody(rawBody);
  if (!parsed.ok) {
    return apiError(400, `worker_body_${parsed.reason}`, { correlationId });
  }
  const { chunk, as_of, rate_per_sec, correlation_id } = parsed.body;

  const tradierApiKey = Deno.env.get('TRADIER_API_KEY');
  if (!tradierApiKey) {
    return apiError(500, 'tradier_api_key_unset', { correlationId: correlation_id });
  }

  const bucket = new TokenBucket({ ratePerSec: rate_per_sec });
  const paced = pacedHttpFetch(bucket, fetch as unknown as HttpFetch);
  const tradier = new TradierOptionsChainFetcher(tradierApiKey, paced);

  try {
    const result = await runOptionsFlowChunk({ tradier }, chunk, as_of);
    return apiSuccess({
      ok: true,
      correlation_id,
      chunk_size: chunk.length,
      values: result.values,
      skips: result.skips,
    });
  } catch (e) {
    console.error('[options-flow-worker] unhandled error', {
      correlation_id,
      message: e instanceof Error ? e.message : String(e),
    });
    return apiError(500, 'worker_unhandled_error', { correlationId: correlation_id });
  }
}));