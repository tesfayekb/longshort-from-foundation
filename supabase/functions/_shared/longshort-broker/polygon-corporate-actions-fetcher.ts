/**
 * PolygonCorporateActionsFetcher (EDGE-RESIDENT) — FP-061 sub-step 4M.4 / ACT-378.
 *
 * NEW execution-domain adapter. DISTINCT from the signal-#9 active-catalyst
 * fetchers (`_shared/longshort-signals/active-catalyst/polygon-splits-fetcher.ts`,
 * `polygon-dividends-fetcher.ts`, `tradier-corporate-actions-fetcher.ts`) which
 * normalize to `RawCatalystEventInput` for the catalyst signal — a different
 * output type, different SLA, different consumer. THIS adapter normalizes to a
 * `CorporateActionRow` for the `public.corporate_actions` STORE (basis-mutation
 * truth, not signal decay). Re-use of the signal-#9 fetchers here is a STOP
 * condition.
 *
 * ENDPOINTS:
 *   GET https://api.polygon.io/v3/reference/splits
 *     ?ticker=<sym>&execution_date.gte=<from>&execution_date.lte=<to>&apiKey=…
 *     → results[]: { ticker, execution_date, split_from, split_to, ... }
 *
 *   GET https://api.polygon.io/v3/reference/dividends
 *     ?ticker=<sym>&ex_dividend_date.gte=<from>&ex_dividend_date.lte=<to>&apiKey=…
 *     → results[]: { ticker, ex_dividend_date, cash_amount, dividend_type, ... }
 *       dividend_type: 'CD' (cash), 'SC' (stock — a.k.a. stock dividend).
 *
 * MERGER/SPINOFF GAP (registered as DW-197):
 *   Polygon's `/v3/reference/` family has no merger or spinoff feed. This
 *   adapter ships split + dividend coverage ONLY. The §7 composer gate still
 *   fires on whatever rows exist; degrades safely (no row → no block, no
 *   mutation). We do NOT silently fabricate a source.
 *
 * CLOCK DISCIPLINE (DEC-034 (4) / §2 Axiom 4):
 *   The fetch window from/to are INJECTED via the `window` arg — driven by the
 *   edge-fn `as_of` at the boundary, NEVER by `Date.now()` / `new Date()`
 *   inside the adapter.
 *
 * AUTH PATTERN: mirrors `polygon-quote-fetcher.ts` — apiKey/httpFetch/baseUrl
 * constructor, lazy credential check, typed-throw on missing fields.
 */

/**
 * Raw shape the adapter emits, ready for upsert into `public.corporate_actions`.
 * The applier's defensive re-check requires ratio fields populated for ratio
 * action_types; the adapter REJECTS malformed rows so they never reach the DB.
 */
export interface CorporateActionRow {
  symbol: string;
  action_type: 'split' | 'stock_dividend' | 'cash_dividend' | 'merger' | 'spinoff';
  ex_date: string;                    // YYYY-MM-DD (DATE column)
  announced_at: string | null;        // ISO timestamptz
  ratio_numerator: number | null;
  ratio_denominator: number | null;
  cash_per_share: number | null;
  successor_symbol: string | null;
  basis_allocation_pct: number | null;
  source: 'polygon';
  source_payload: unknown;
}

const POLYGON_BASE_URL = 'https://api.polygon.io';

/** Typed credential error — thrown at FIRST fetch when POLYGON_API_KEY missing. */
export class PolygonCorporateActionsCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolygonCorporateActionsCredentialError';
  }
}

interface PolygonSplitRow {
  ticker?: string;
  execution_date?: string;     // YYYY-MM-DD
  split_from?: number;         // den
  split_to?: number;           // num
}

interface PolygonDividendRow {
  ticker?: string;
  ex_dividend_date?: string;
  cash_amount?: number;
  dividend_type?: string;      // 'CD' | 'SC' | ...
  declaration_date?: string | null;
}

interface PolygonListResponse<T> {
  status?: string;
  results?: T[];
  next_url?: string;
}

export interface FetchCorporateActionsWindow {
  from: Date;
  to: Date;
  /** Optional ticker filter — pass to narrow to a specific universe; omit
   *  to fetch all symbols in window. */
  symbol?: string;
}

function toDateYmd(d: Date): string {
  // UTC date — Polygon expects YYYY-MM-DD; use ISO date prefix.
  return d.toISOString().slice(0, 10);
}

export class PolygonCorporateActionsFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: typeof fetch = fetch,
    private readonly baseUrl: string = POLYGON_BASE_URL,
  ) {
    // LAZY credential check (mirrors PolygonQuoteFetcher).
  }

  /**
   * Fetch both splits + cash/stock dividends inside `window`. Returns rows
   * ready for `corporate_actions` upsert. Merger/spinoff are NOT covered
   * (DW-197); the caller must NOT defaults-fake those — the §7 composer
   * gate degrades safely when no row exists.
   */
  async fetchCorporateActions(window: FetchCorporateActionsWindow): Promise<CorporateActionRow[]> {
    if (!this.apiKey || this.apiKey.length === 0) {
      throw new PolygonCorporateActionsCredentialError(
        'PolygonCorporateActionsFetcher: POLYGON_API_KEY is required (set the secret).',
      );
    }

    const [splits, dividends] = await Promise.all([
      this.fetchSplits(window),
      this.fetchDividends(window),
    ]);
    return [...splits, ...dividends];
  }

  private async fetchSplits(w: FetchCorporateActionsWindow): Promise<CorporateActionRow[]> {
    const params = new URLSearchParams({
      'execution_date.gte': toDateYmd(w.from),
      'execution_date.lte': toDateYmd(w.to),
      apiKey: this.apiKey,
      limit: '1000',
    });
    if (w.symbol) params.set('ticker', w.symbol);
    const url = `${this.baseUrl}/v3/reference/splits?${params.toString()}`;
    const body = await this.getJson<PolygonListResponse<PolygonSplitRow>>(url, 'splits');
    const rows = body.results ?? [];
    const out: CorporateActionRow[] = [];
    for (const r of rows) {
      // STOP-CONDITION: typed-absence-throw on missing ratio components.
      // Defaulting to 1 would silently no-op a real split.
      if (
        !r.ticker ||
        !r.execution_date ||
        typeof r.split_to !== 'number' || r.split_to <= 0 ||
        typeof r.split_from !== 'number' || r.split_from <= 0
      ) {
        throw new Error(
          `PolygonCorporateActionsFetcher: malformed split row — ${JSON.stringify(r)}`,
        );
      }
      out.push({
        symbol: r.ticker,
        action_type: 'split',
        ex_date: r.execution_date,
        announced_at: null,
        ratio_numerator: r.split_to,        // 2:1 split has split_to=2, split_from=1
        ratio_denominator: r.split_from,
        cash_per_share: null,
        successor_symbol: null,
        basis_allocation_pct: null,
        source: 'polygon',
        source_payload: r,
      });
    }
    return out;
  }

  private async fetchDividends(w: FetchCorporateActionsWindow): Promise<CorporateActionRow[]> {
    const params = new URLSearchParams({
      'ex_dividend_date.gte': toDateYmd(w.from),
      'ex_dividend_date.lte': toDateYmd(w.to),
      apiKey: this.apiKey,
      limit: '1000',
    });
    if (w.symbol) params.set('ticker', w.symbol);
    const url = `${this.baseUrl}/v3/reference/dividends?${params.toString()}`;
    const body = await this.getJson<PolygonListResponse<PolygonDividendRow>>(url, 'dividends');
    const rows = body.results ?? [];
    const out: CorporateActionRow[] = [];
    for (const r of rows) {
      if (!r.ticker || !r.ex_dividend_date || !r.dividend_type) {
        throw new Error(
          `PolygonCorporateActionsFetcher: malformed dividend row — ${JSON.stringify(r)}`,
        );
      }
      if (r.dividend_type === 'CD') {
        // Cash dividend — typed-absence-throw on missing amount per STOP-condition.
        if (typeof r.cash_amount !== 'number' || !(r.cash_amount > 0)) {
          throw new Error(
            `PolygonCorporateActionsFetcher: cash_dividend missing/invalid cash_amount — ${JSON.stringify(r)}`,
          );
        }
        out.push({
          symbol: r.ticker,
          action_type: 'cash_dividend',
          ex_date: r.ex_dividend_date,
          announced_at: r.declaration_date ?? null,
          ratio_numerator: null,
          ratio_denominator: null,
          cash_per_share: r.cash_amount,
          successor_symbol: null,
          basis_allocation_pct: null,
          source: 'polygon',
          source_payload: r,
        });
      } else if (r.dividend_type === 'SC') {
        // Stock-dividend — Polygon dividends feed does NOT carry a ratio
        // for SC rows. We do NOT default a ratio (silent corruption STOP).
        // The row is therefore rejected here; stock-dividend ratios must
        // arrive from the splits endpoint (Polygon treats fractional stock
        // distributions as splits with non-integer split_to/from). This is
        // a documented adapter behavior — log + drop, do not throw the
        // batch (a single unsupported row should not poison the upsert).
        // (Drop is the conservative choice; the gate then never fires on
        // this name, but no basis mutation occurs either.)
        continue;
      } else {
        // Unknown dividend_type — defensive drop, no fabrication.
        continue;
      }
    }
    return out;
  }

  private async getJson<T>(url: string, scope: string): Promise<T> {
    let resp: Response;
    try {
      resp = await this.httpFetch(url, { method: 'GET' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`PolygonCorporateActionsFetcher: network error on ${scope}: ${msg}`);
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(
        `PolygonCorporateActionsFetcher: HTTP ${resp.status} ${resp.statusText} on ${scope}${body ? ` — ${body.slice(0, 200)}` : ''}`,
      );
    }
    try {
      return (await resp.json()) as T;
    } catch (e) {
      throw new Error(
        `PolygonCorporateActionsFetcher: JSON parse error on ${scope}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}