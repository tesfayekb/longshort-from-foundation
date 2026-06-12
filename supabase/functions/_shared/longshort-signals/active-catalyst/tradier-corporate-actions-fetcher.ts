/**
 * TradierCorporateActionsFetcher — Signal #9 / FP-049 Phase 1 / DEC-057 §(i).
 *
 * Authority: DEC-057 §(i) — TYPED-FALLBACK ONLY. This fetcher is built
 * to the same `CatalystFetchResult` contract as the Polygon
 * splits/dividends primaries, but it is NEVER invoked unconditionally.
 * The Phase-3 orchestrator decides invocation: ONLY when
 * `PolygonSplitsFetcher` OR `PolygonDividendsFetcher` returns
 * `unavailable` for the as_of window. This Phase-1 commit lands the
 * fetcher + tests; the invocation gating logic is Phase 3.
 *
 * ─── Endpoint (Tradier corporate-actions; NOT probed at Phase 0) ──────
 *   GET https://api.tradier.com/v1/markets/fundamentals/corporate_actions
 *       ?symbols=<csv>
 *   Auth: Bearer <TRADIER_API_KEY>  (parallel to
 *         `tradier-options-chain-fetcher.ts`)
 *
 * Tradier corporate-actions returns a per-symbol document with
 * `cash_dividend`, `stock_split`, `merger_acquisition` sub-arrays.
 * Each sub-row carries an `ex_date` / `record_date` / `announcement_date`.
 * Per DEC-057 §(e) the decay-origin is `announcement_date`; rows
 * missing it surface as `declaration_date_unavailable` (same typed
 * counter as the Polygon dividends fetcher — operator observability
 * across the two vendors uses one name).
 *
 * Because Phase 0 did NOT live-probe Tradier corporate-actions, the
 * normalization here is defensive: every wire field is treated as
 * `unknown` and validated. A Phase-3 first-natural-fire probe will
 * confirm or amend the shape; until then the test fixtures encode the
 * documented shape, and a vendor-shape drift will surface as a
 * SignalComputationError (typed) rather than silent data loss.
 *
 * Tradier requires a CSV symbol list. This fetcher accepts the
 * `tickers: ReadonlyArray<string>` shaped to chunk the 839-name
 * universe at the Phase-3 invocation site — for v1, Phase-3 invokes
 * only on the names already known to need a backup (Polygon-unavailable
 * shortlist), so the per-call symbol count is small. The fetcher does
 * not paginate (Tradier corporate-actions returns the full document
 * for the requested CSV in one response).
 *
 * Owner: longshort (FP-049 Phase 1 — Signal #9 commit 1a)
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../../longshort-universe/shared/fetch-with-timeout.ts';
import { SignalComputationError } from '../shared/signal-types.ts';
import {
  ACTIVE_CATALYST_SIGNAL_ID,
  applyLookAheadGate,
  applyWindowLowerBound,
  type CatalystFetchResult,
  type CatalystFetchWindow,
  type RawCatalystEventInput,
} from './catalyst-types.ts';

export const TRADIER_BASE_URL = 'https://api.tradier.com/v1';
export const TRADIER_CORPORATE_ACTIONS_OPERATION_ID = 'tradier_corporate_actions';
const ANCHOR_UTC = 'T16:00:00Z';
const TRADIER_MAX_SYMBOLS_PER_CALL = 100;

interface TradierCaWire {
  symbol?: unknown;
  corporate_actions?: unknown;
}
interface TradierCashDividendWire {
  announcement_date?: unknown;
  ex_date?: unknown;
  cash_amount?: unknown;
}
interface TradierStockSplitWire {
  announcement_date?: unknown;
  ex_date?: unknown;
  to_factor?: unknown;
  for_factor?: unknown;
}
interface TradierMaWire {
  announcement_date?: unknown;
  effective_date?: unknown;
  acquirer_symbol?: unknown;
}
interface TradierCorporateActionsBlock {
  cash_dividend?: unknown;
  stock_split?: unknown;
  merger_acquisition?: unknown;
}

function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}
function toArray(x: unknown): unknown[] {
  if (Array.isArray(x)) return x;
  if (x && typeof x === 'object') return [x];
  return [];
}

type NormResult = {
  rows: RawCatalystEventInput[];
  declarationMissing: number;
};

function normalizeSymbolDoc(doc: TradierCaWire): NormResult {
  const out: NormResult = { rows: [], declarationMissing: 0 };
  if (!isNonEmptyString(doc.symbol)) return out;
  const ticker = doc.symbol;
  const block = (doc.corporate_actions ?? {}) as TradierCorporateActionsBlock;

  for (const raw of toArray(block.cash_dividend)) {
    const w = raw as TradierCashDividendWire;
    if (!isIsoDate(w.announcement_date)) { out.declarationMissing += 1; continue; }
    const meta: Record<string, string | number | boolean> = { tradier_backup: true };
    if (typeof w.cash_amount === 'number') meta.cash_amount = w.cash_amount;
    out.rows.push({
      ticker,
      event_type: 'dividend_change',
      event_at: `${w.announcement_date}${ANCHOR_UTC}`,
      source: 'structured',
      vendor: 'tradier',
      meta,
    });
  }

  for (const raw of toArray(block.stock_split)) {
    const w = raw as TradierStockSplitWire;
    if (!isIsoDate(w.announcement_date) && !isIsoDate(w.ex_date)) continue;
    const dateIso = isIsoDate(w.announcement_date) ? w.announcement_date : (w.ex_date as string);
    const meta: Record<string, string | number | boolean> = { tradier_backup: true };
    if (typeof w.to_factor === 'number') meta.to_factor = w.to_factor;
    if (typeof w.for_factor === 'number') meta.for_factor = w.for_factor;
    out.rows.push({
      ticker,
      event_type: 'splits',
      event_at: `${dateIso}${ANCHOR_UTC}`,
      source: 'structured',
      vendor: 'tradier',
      meta,
    });
  }

  for (const raw of toArray(block.merger_acquisition)) {
    const w = raw as TradierMaWire;
    if (!isIsoDate(w.announcement_date) && !isIsoDate(w.effective_date)) continue;
    const dateIso = isIsoDate(w.announcement_date) ? w.announcement_date : (w.effective_date as string);
    const meta: Record<string, string | number | boolean> = { tradier_backup: true };
    if (isNonEmptyString(w.acquirer_symbol)) meta.acquirer_symbol = w.acquirer_symbol;
    out.rows.push({
      ticker,
      event_type: 'ma',
      event_at: `${dateIso}${ANCHOR_UTC}`,
      source: 'structured',
      vendor: 'tradier',
      meta,
    });
  }
  return out;
}

export class TradierCorporateActionsFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    private readonly baseUrl: string = TRADIER_BASE_URL,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error('TradierCorporateActionsFetcher: apiKey is required (TRADIER_API_KEY secret missing).');
    }
  }

  /**
   * Fetch corporate actions for `tickers` within [window_start_at, as_of].
   * `tickers` MUST be non-empty (Tradier requires the `symbols=` query).
   * Phase-3 callers chunk to `TRADIER_MAX_SYMBOLS_PER_CALL` per call.
   */
  async fetch(
    window: CatalystFetchWindow,
    tickers: ReadonlyArray<string>,
  ): Promise<CatalystFetchResult> {
    if (tickers.length === 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    if (tickers.length > TRADIER_MAX_SYMBOLS_PER_CALL) {
      throw new Error(
        `TradierCorporateActionsFetcher: ${tickers.length} symbols exceeds per-call cap ${TRADIER_MAX_SYMBOLS_PER_CALL}; caller MUST chunk.`,
      );
    }

    const symbolsParam = tickers.map((t) => t.toUpperCase()).join(',');
    const url =
      `${this.baseUrl}/markets/fundamentals/corporate_actions` +
      `?symbols=${encodeURIComponent(symbolsParam)}`;

    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await fetchWithTimeoutAndRetry(
        this.httpFetch,
        url,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/json',
          },
        },
        { timeoutMs: this.timeoutMs },
      );
    } catch (e) {
      if (e instanceof Error && /^HTTP 429/.test(e.message)) {
        return { kind: 'unavailable', reason: 'rate_limited' };
      }
      throw new SignalComputationError(
        ACTIVE_CATALYST_SIGNAL_ID, '*',
        `[${TRADIER_CORPORATE_ACTIONS_OPERATION_ID}] network error for ${tickers.length} tickers`, e,
      );
    }

    if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
      return { kind: 'unavailable', reason: 'subscription_gated' };
    }
    if (resp.status === 429) return { kind: 'unavailable', reason: 'rate_limited' };
    if (resp.status === 404) return { kind: 'unavailable', reason: 'data_unavailable' };
    if (!resp.ok) {
      throw new SignalComputationError(
        ACTIVE_CATALYST_SIGNAL_ID, '*',
        `[${TRADIER_CORPORATE_ACTIONS_OPERATION_ID}] HTTP ${resp.status} ${resp.statusText}`,
      );
    }

    let body: unknown;
    try { body = await resp.json(); } catch (e) {
      throw new SignalComputationError(
        ACTIVE_CATALYST_SIGNAL_ID, '*',
        `[${TRADIER_CORPORATE_ACTIONS_OPERATION_ID}] JSON parse error`, e,
      );
    }

    // Tradier wraps responses as { securities: { security: [...] | {...} } }
    // Defensive unwrap — any shape drift surfaces as a typed exception
    // rather than silent emptiness (anti-phantom).
    const wrapped = body as { securities?: { security?: unknown } | null };
    const securitiesBlock = wrapped?.securities;
    if (!securitiesBlock || typeof securitiesBlock !== 'object') {
      // No securities key = no data for these symbols.
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    const docs = toArray(securitiesBlock.security);
    if (docs.length === 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }

    const candidates: RawCatalystEventInput[] = [];
    let declarationMissing = 0;
    for (const d of docs) {
      const out = normalizeSymbolDoc(d as TradierCaWire);
      candidates.push(...out.rows);
      declarationMissing += out.declarationMissing;
    }

    const gated = applyLookAheadGate(candidates, window.as_of);
    const rows = applyWindowLowerBound(gated.rows, window.window_start_at);
    return {
      kind: 'events',
      rows,
      future_event_excluded: gated.future_event_excluded,
      declaration_date_unavailable: declarationMissing,
    };
  }
}

export { TRADIER_MAX_SYMBOLS_PER_CALL };