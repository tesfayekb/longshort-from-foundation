/**
 * TradierOptionsChainFetcher — options NBBO/chain fetch for the Phase 2.7
 * signal (FP-043 / Signal #3: Options Flow Imbalance, §4.4.7).
 *
 * Sibling to `polygon-short-interest-fetcher.ts` and the rest of the
 * vendor fetchers under this directory. This is the FIRST Tradier-sourced
 * fetcher in the signal stack — Tradier is the §4.4.7 spec-named backup,
 * promoted to primary for v1 per DEC-045 because Polygon's Options
 * Developer tier does NOT surface NBBO (bid/ask) on the options-chain
 * endpoint (INC-71). The direction-classifier the spec requires
 * (buy-at-ask / sell-at-bid) cannot be computed without NBBO; Tradier
 * carries bid/ask/last/volume/open_interest + full greeks on a single
 * endpoint call (ACT-157 production re-probe: 92/92 contracts populated).
 *
 * Endpoints used (read-only market-data only — never the /v1/accounts/...
 * order endpoints; T9 / DEC-036 / DEC-045 — Tradier is a market-data
 * source ONLY, not a brokerage execution surface):
 *
 *   - GET /v1/markets/options/expirations?symbol=<T>&includeAllRoots=true
 *       → list of expiration ISO dates for the symbol.
 *
 *   - GET /v1/markets/options/chains?symbol=<T>&expiration=<YYYY-MM-DD>
 *           &greeks=true
 *       → list of option contracts (calls + puts) at every strike for
 *         that expiration, each carrying `bid`, `ask`, `last`, `volume`,
 *         `open_interest`, `bid_date`, `ask_date`, `trade_date`, and a
 *         `greeks` object with `delta` (used by the §4.4.7
 *         OTM/ATM smart-money strike filter).
 *
 * Entitlement awareness (parallel to PolygonShortInterestFetcher):
 *   - HTTP 401 / 403 → `{ kind: 'unavailable', reason: 'subscription_gated' }`.
 *     Tradier production market-data is a $10/mo add-on; without it the
 *     production host (api.tradier.com) returns 401. Never throws — the
 *     orchestrator carries this to a typed-absence skip.
 *   - HTTP 404 / empty-payload → `{ kind: 'unavailable', reason: 'data_unavailable' }`.
 *     A symbol with no listed options chain (typical for many low-AUM names)
 *     returns either 404 or a payload with `expirations: null` / `options: null`.
 *   - All other non-2xx (5xx, network error, parse failure, timeout after
 *     retries) → throws `SignalComputationError` preserving ticker context
 *     per INC-24. NEVER fabricates a default value.
 *
 * Wall-clock discipline (DEC-034 clause 4): `as_of` is NOT consumed by
 * Tradier's endpoint (the chain snapshot is by definition point-in-time
 * "now") — but the orchestrator MUST derive age/decay from the per-
 * contract `bid_date` / `ask_date` / `trade_date` timestamps Tradier
 * returns, NOT from `Date.now()`. This fetcher therefore returns those
 * timestamps verbatim and the orchestrator is responsible for the
 * `as_of`-relative arithmetic.
 *
 * Tradier response-shape quirk: when a query has a single result, Tradier
 * returns a bare object instead of a one-element array — e.g.
 * `{ expirations: { date: "2026-06-17" } }` vs the multi-result
 * `{ expirations: { date: ["2026-06-17", "2026-06-24"] } }`. Same for
 * `options.option`. The internal `normalizeArray` helper normalizes both
 * shapes; failing to handle the single-result case is a documented
 * historical pitfall for Tradier integrations and would silently drop
 * single-expiration / single-contract tickers.
 *
 * Dual-axis verify (per `_pattern-vendor-fetcher-filter-honesty.md` — the
 * INC-70 + INC-71 discipline). Two dev-probe helpers exported as static
 * methods (NOT invoked in the production hot path):
 *
 *   - `verifyFilterHonored(...)` — confirms the symbol filter is honored
 *     by sampling the contract OCC symbols and asserting every returned
 *     contract's underlying-prefix matches the requested symbol (INC-70
 *     lesson: filter-bleed firehose). Returns a typed diagnostic.
 *
 *   - `verifyFieldsPresent(...)` — confirms the fields the §4.4.7
 *     direction classifier needs (bid, ask, volume, open_interest, greeks)
 *     actually populate on a real production chain (INC-71 lesson: fields
 *     missing on the deployed tier). Returns a per-field populated-count.
 *
 * Both helpers consume an already-fetched chain payload to keep them
 * cheap and isolated from network concerns. The probe edge function
 * (operator-driven, not in this commit) is the place to wire them — the
 * production orchestrator does not gate on them per-run (Tradier's
 * production entitlement is operator-confirmed at ACT-157).
 *
 * Secret: TRADIER_API_KEY (production access token from
 * dash.tradier.com → Settings → API Access; requires the $10/mo
 * Market Data add-on for production options chains with bid/ask + greeks).
 *
 * Owner: longshort (FP-043 — Signal #3 / Phase 2.7)
 * Classification: shared infrastructure — first Tradier-sourced fetcher.
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../../longshort-universe/shared/fetch-with-timeout.ts';
import { SignalComputationError } from './signal-types.ts';

const TRADIER_PRODUCTION_BASE_URL = 'https://api.tradier.com/v1';

/** Operation ids surfaced in `SignalComputationError.signal_id` when the
 *  fetcher throws — distinct per endpoint so the orchestrator skip ledger
 *  can attribute failures correctly. */
export const TRADIER_EXPIRATIONS_OPERATION_ID = 'tradier_options_expirations';
export const TRADIER_CHAIN_OPERATION_ID = 'tradier_options_chain';

/**
 * Raw greeks payload from Tradier (the subset of fields §4.4.7 actually
 * consumes — `delta` is the OTM/ATM strike filter input). Tradier also
 * returns gamma/theta/vega/rho/phi/bid_iv/mid_iv/ask_iv/smv_vol/updated_at;
 * we keep them as an opaque pass-through (`Record<string, unknown>` is
 * intentionally not used — typed-shape avoids `any`).
 */
export interface RawOptionGreeks {
  delta: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
  rho?: number | null;
  phi?: number | null;
  bid_iv?: number | null;
  mid_iv?: number | null;
  ask_iv?: number | null;
  smv_vol?: number | null;
  updated_at?: string | null;
}

/**
 * A single normalized option contract returned by the chain endpoint.
 * Field set is the minimum §4.4.7 needs plus the per-contract timestamps
 * the orchestrator uses for age/decay (NOT wall-clock).
 *
 * `option_type` is the spec's call/put discriminator; the direction-
 * classifier formula's sign table keys off it.
 *
 * Numeric fields are typed `number | null`: null = upstream explicitly
 * reported no value (NOT a fabricated zero). Per anti-phantom discipline
 * the orchestrator MUST treat null as typed-absence, not as 0.
 */
export interface RawOptionContract {
  symbol: string;            // OCC symbol, e.g. "AAPL260617C00230000"
  underlying: string;        // requested symbol, echoed for filter-honesty check
  expiration_date: string;   // ISO YYYY-MM-DD
  strike: number;
  option_type: 'call' | 'put';
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume: number | null;
  open_interest: number | null;
  /** Epoch-millis of the latest bid update (NBBO timestamp). null if absent. */
  bid_date: number | null;
  /** Epoch-millis of the latest ask update (NBBO timestamp). null if absent. */
  ask_date: number | null;
  /** Epoch-millis of the latest trade. 0 = no trades yet (Tradier convention);
   *  normalized to null here to keep "no data" representation uniform. */
  trade_date: number | null;
  greeks: RawOptionGreeks | null;
}

export type OptionExpirationsResult =
  | { kind: 'expirations'; expirations: string[] } // ASC-sorted ISO dates
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' };

export type OptionChainResult =
  | { kind: 'chain'; contracts: RawOptionContract[] }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' };

// ─── Tradier wire-shape types (private) ──────────────────────────────────

interface TradierExpirationsResponse {
  expirations?: {
    // Single result: string. Multi-result: string[]. Empty: null/missing.
    date?: string | string[] | null;
  } | null;
}

interface TradierGreeksWire {
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
  rho?: number | null;
  phi?: number | null;
  bid_iv?: number | null;
  mid_iv?: number | null;
  ask_iv?: number | null;
  smv_vol?: number | null;
  updated_at?: string | null;
}

interface TradierOptionWire {
  symbol?: string;
  underlying?: string;
  expiration_date?: string;
  strike?: number;
  option_type?: string;
  bid?: number | null;
  ask?: number | null;
  last?: number | null;
  volume?: number | null;
  open_interest?: number | null;
  bid_date?: number | null;
  ask_date?: number | null;
  trade_date?: number | null;
  greeks?: TradierGreeksWire | null;
}

interface TradierChainResponse {
  options?: {
    // Single result: object. Multi-result: object[]. Empty: null/missing.
    option?: TradierOptionWire | TradierOptionWire[] | null;
  } | null;
}

/**
 * Normalize Tradier's "single-result-is-bare-object, multi-result-is-array,
 * empty-is-null" wire idiom into a uniform array. Failing to handle the
 * single-result case is the documented historical Tradier-integration
 * pitfall — it silently drops single-expiration / single-contract names.
 */
function normalizeArray<T>(x: T | T[] | null | undefined): T[] {
  if (x === null || x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

function isFiniteNumberOrNull(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

/** Tradier reports `trade_date: 0` for never-traded strikes; normalize to
 *  null so "never traded" is uniformly typed-absent. */
function normalizeTradeEpoch(x: unknown): number | null {
  if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0) return null;
  return x;
}

function normalizeGreeks(g: TradierGreeksWire | null | undefined): RawOptionGreeks | null {
  if (g === null || g === undefined) return null;
  // Require delta to be a finite number; without delta the OTM/ATM strike
  // filter cannot run, so a contract with absent delta is treated as
  // typed-greeks-absent (orchestrator will skip it from the smart-money
  // pool — never defaulted to 0 delta which would silently mis-classify
  // every contract as ATM).
  const delta = isFiniteNumberOrNull(g.delta);
  if (delta === null) return null;
  return {
    delta,
    gamma: isFiniteNumberOrNull(g.gamma),
    theta: isFiniteNumberOrNull(g.theta),
    vega: isFiniteNumberOrNull(g.vega),
    rho: isFiniteNumberOrNull(g.rho),
    phi: isFiniteNumberOrNull(g.phi),
    bid_iv: isFiniteNumberOrNull(g.bid_iv),
    mid_iv: isFiniteNumberOrNull(g.mid_iv),
    ask_iv: isFiniteNumberOrNull(g.ask_iv),
    smv_vol: isFiniteNumberOrNull(g.smv_vol),
    updated_at: typeof g.updated_at === 'string' ? g.updated_at : null,
  };
}

function normalizeOption(
  o: TradierOptionWire,
  requestedSymbol: string,
): RawOptionContract | null {
  if (typeof o.symbol !== 'string' || o.symbol.length === 0) return null;
  if (typeof o.expiration_date !== 'string' || o.expiration_date.length < 10) return null;
  if (typeof o.strike !== 'number' || !Number.isFinite(o.strike) || o.strike <= 0) return null;
  if (o.option_type !== 'call' && o.option_type !== 'put') return null;
  // The `underlying` field is what `verifyFilterHonored` keys off — fall
  // back to the request's symbol if Tradier omits it (it normally doesn't,
  // but the dev-probe asserts on the actual returned value where present).
  const underlying = typeof o.underlying === 'string' && o.underlying.length > 0
    ? o.underlying
    : requestedSymbol;
  return {
    symbol: o.symbol,
    underlying,
    expiration_date: o.expiration_date.slice(0, 10),
    strike: o.strike,
    option_type: o.option_type,
    bid: isFiniteNumberOrNull(o.bid),
    ask: isFiniteNumberOrNull(o.ask),
    last: isFiniteNumberOrNull(o.last),
    volume: isFiniteNumberOrNull(o.volume),
    open_interest: isFiniteNumberOrNull(o.open_interest),
    bid_date: isFiniteNumberOrNull(o.bid_date),
    ask_date: isFiniteNumberOrNull(o.ask_date),
    trade_date: normalizeTradeEpoch(o.trade_date),
    greeks: normalizeGreeks(o.greeks ?? null),
  };
}

export class TradierOptionsChainFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    private readonly baseUrl: string = TRADIER_PRODUCTION_BASE_URL,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'TradierOptionsChainFetcher: apiKey is required (TRADIER_API_KEY secret missing).',
      );
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    };
  }

  /**
   * Fetch the list of expiration dates for `ticker` from Tradier. Returns:
   *   - `{ kind: 'expirations', expirations }` — ISO YYYY-MM-DD dates,
   *     ASC-sorted (oldest first). May be empty if the symbol has no
   *     listed options chain.
   *   - `{ kind: 'unavailable', reason: 'subscription_gated' }` — 401/403.
   *   - `{ kind: 'unavailable', reason: 'data_unavailable' }` — 404.
   *
   * Throws `SignalComputationError` on 5xx-after-retries / timeout-after-
   * retries / network-error / parse failure.
   */
  async fetchExpirations(ticker: string): Promise<OptionExpirationsResult> {
    const url =
      `${this.baseUrl}/markets/options/expirations` +
      `?symbol=${encodeURIComponent(ticker)}` +
      `&includeAllRoots=true`;
    const resp = await this.fetchOrThrow(
      TRADIER_EXPIRATIONS_OPERATION_ID,
      ticker,
      url,
    );
    if (resp.kind === 'unavailable') return resp;

    let body: TradierExpirationsResponse;
    try {
      body = (await resp.response.json()) as TradierExpirationsResponse;
    } catch (e) {
      throw new SignalComputationError(
        TRADIER_EXPIRATIONS_OPERATION_ID,
        ticker,
        `JSON parse error on expirations for ${ticker}`,
        e,
      );
    }

    const dates = normalizeArray<string>(body.expirations?.date ?? null)
      .filter((d): d is string => typeof d === 'string' && d.length >= 10)
      .map((d) => d.slice(0, 10));
    // Per anti-phantom: empty response is typed-absence, NOT a fabricated
    // expiration. Surfaced as data_unavailable so the orchestrator can
    // attribute the skip to "no options chain listed" vs "fetch failed".
    if (dates.length === 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    dates.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return { kind: 'expirations', expirations: dates };
  }

  /**
   * Fetch the option chain for `ticker` at the given ISO `expiration`
   * (YYYY-MM-DD), with greeks included. Returns normalized contracts
   * with bid/ask/last/volume/OI/greeks + per-contract NBBO timestamps.
   *
   * Same entitlement/availability/throw semantics as `fetchExpirations`.
   */
  async fetchChain(
    ticker: string,
    expiration: string,
  ): Promise<OptionChainResult> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration)) {
      // A malformed expiration is a caller bug, not a vendor condition —
      // throw rather than silently degrade so the orchestrator sees it.
      throw new SignalComputationError(
        TRADIER_CHAIN_OPERATION_ID,
        ticker,
        `invalid expiration format "${expiration}" (expected YYYY-MM-DD)`,
      );
    }
    const url =
      `${this.baseUrl}/markets/options/chains` +
      `?symbol=${encodeURIComponent(ticker)}` +
      `&expiration=${expiration}` +
      `&greeks=true`;
    const resp = await this.fetchOrThrow(
      TRADIER_CHAIN_OPERATION_ID,
      ticker,
      url,
    );
    if (resp.kind === 'unavailable') return resp;

    let body: TradierChainResponse;
    try {
      body = (await resp.response.json()) as TradierChainResponse;
    } catch (e) {
      throw new SignalComputationError(
        TRADIER_CHAIN_OPERATION_ID,
        ticker,
        `JSON parse error on chain for ${ticker} @ ${expiration}`,
        e,
      );
    }

    const raw = normalizeArray<TradierOptionWire>(body.options?.option ?? null);
    if (raw.length === 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    const contracts: RawOptionContract[] = [];
    for (const r of raw) {
      const norm = normalizeOption(r, ticker);
      if (norm !== null) contracts.push(norm);
    }
    if (contracts.length === 0) {
      // All rows dropped by anti-phantom guard (e.g. every row missing the
      // strike). Treat as data_unavailable — the orchestrator will record
      // the skip with a diagnostic rather than throw.
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    return { kind: 'chain', contracts };
  }

  /** Shared GET + status-mapping helper. Returns either an unavailable
   *  signal (401/403/404) OR the raw response for the caller to .json(). */
  private async fetchOrThrow(
    operationId: string,
    ticker: string,
    url: string,
  ): Promise<
    | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' }
    | { kind: 'ok'; response: Awaited<ReturnType<HttpFetch>> }
  > {
    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await fetchWithTimeoutAndRetry(
        this.httpFetch,
        url,
        { method: 'GET', headers: this.headers() },
        { timeoutMs: this.timeoutMs },
      );
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === 'AbortError';
      const isHttpAfterRetries =
        e instanceof Error && /^HTTP \d{3}/.test(e.message);
      const message = isTimeout
        ? `request timeout after ${this.timeoutMs}ms on ${operationId} for ${ticker}`
        : isHttpAfterRetries
        ? `${(e as Error).message} on ${operationId} for ${ticker}`
        : `network error on ${operationId} for ${ticker}`;
      throw new SignalComputationError(operationId, ticker, message, e);
    }

    // Entitlement-aware mapping. 401 + 403 are both "tier doesn't include
    // production options market data" on Tradier — collapse to a single
    // subscription_gated bucket. 404 = symbol has no chain. All others
    // (5xx already retried by fetchWithTimeoutAndRetry; 4xx other than
    // 401/403/404; 429 already retried) throw.
    if (resp.status === 401 || resp.status === 403) {
      try { await resp.text(); } catch { /* ignore */ }
      return { kind: 'unavailable', reason: 'subscription_gated' };
    }
    if (resp.status === 404) {
      try { await resp.text(); } catch { /* ignore */ }
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    if (!resp.ok) {
      try { await resp.text(); } catch { /* ignore */ }
      throw new SignalComputationError(
        operationId,
        ticker,
        `HTTP ${resp.status} ${resp.statusText} on ${operationId} for ${ticker}`,
      );
    }
    return { kind: 'ok', response: resp };
  }

  // ── Dual-axis verify (dev-probe helpers, NOT in the production hot path)
  //
  // These mirror the discipline locked in
  // `_pattern-vendor-fetcher-filter-honesty.md` (the INC-70 + INC-71
  // pattern doc). The static signatures keep them composable with any
  // already-fetched chain payload — the probe edge function fetches a
  // chain once and runs both verifications without spending another rate-
  // limit token. The orchestrator does NOT call these per-run; production
  // entitlement is operator-confirmed at ACT-157.

  /**
   * INC-70 axis — filter honesty. Every returned contract's
   * `underlying` should equal the requested symbol; a mismatch indicates
   * filter-bleed (the firehose pattern that Polygon Form 4 exhibited at
   * INC-70). Returns a diagnostic so the probe can attach evidence to the
   * GO/NO-GO decision.
   */
  static verifyFilterHonored(
    requestedSymbol: string,
    contracts: ReadonlyArray<RawOptionContract>,
  ): { honored: boolean; total: number; mismatched: number; sample_mismatched: string[] } {
    let mismatched = 0;
    const samples: string[] = [];
    for (const c of contracts) {
      // Tradier OCC symbols start with the underlying (e.g. AAPL...);
      // the `underlying` field is the explicit cross-check.
      const underlyingOk = c.underlying === requestedSymbol;
      const occPrefixOk = c.symbol.startsWith(requestedSymbol);
      if (!underlyingOk || !occPrefixOk) {
        mismatched += 1;
        if (samples.length < 5) samples.push(c.symbol);
      }
    }
    return {
      honored: mismatched === 0,
      total: contracts.length,
      mismatched,
      sample_mismatched: samples,
    };
  }

  /**
   * INC-71 axis — field presence. Counts how many contracts populate each
   * §4.4.7-required field. A production-tier chain with the $10/mo market-
   * data add-on populates bid/ask/volume/open_interest/greeks on ~100% of
   * contracts (the ACT-157 production probe saw 92/92). A "passed" check
   * is operator-defined; this helper returns the raw counts so the probe
   * can apply its own threshold (e.g. ≥80%) without baking policy into
   * the fetcher.
   */
  static verifyFieldsPresent(
    contracts: ReadonlyArray<RawOptionContract>,
  ): {
    total: number;
    populated: {
      bid: number;
      ask: number;
      last: number;
      volume: number;
      open_interest: number;
      greeks: number;
      numeric_bid_ask: number;
    };
  } {
    let bid = 0, ask = 0, last = 0, volume = 0, oi = 0, greeks = 0, numericBidAsk = 0;
    for (const c of contracts) {
      if (c.bid !== null) bid += 1;
      if (c.ask !== null) ask += 1;
      if (c.last !== null) last += 1;
      if (c.volume !== null) volume += 1;
      if (c.open_interest !== null) oi += 1;
      if (c.greeks !== null) greeks += 1;
      if (c.bid !== null && c.ask !== null && (c.bid > 0 || c.ask > 0)) numericBidAsk += 1;
    }
    return {
      total: contracts.length,
      populated: { bid, ask, last, volume, open_interest: oi, greeks, numeric_bid_ask: numericBidAsk },
    };
  }
}

export { TRADIER_PRODUCTION_BASE_URL };