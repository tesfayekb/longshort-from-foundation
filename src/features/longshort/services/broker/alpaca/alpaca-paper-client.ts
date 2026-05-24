/**
 * alpaca-paper-client — minimal Alpaca paper-trading REST wrapper.
 *
 * Endpoints used at sub-step 6.7 (6 fetcher implementations):
 *   GET  /v2/positions/{symbol}
 *   GET  /v2/stocks/{symbol}/quotes/latest        (data URL)
 *   GET  /v2/assets/{symbol}
 *   POST /v2/short_locates
 *   GET  /v2/account
 *   GET  /v2/orders/{order_id}
 *   POST /v2/orders
 *
 * Per DEC-034 clause (3): errors propagate; no swallow + phantom-success.
 * Per DEC-034 clause (4): no wall-clock leakage; client takes no time params.
 * Credentials read from environment via Deno.env on construction. Throws typed
 * AlpacaCredentialError if absent — never silently uses empty strings.
 */

const ALPACA_PAPER_BASE_URL = 'https://paper-api.alpaca.markets' as const;
const ALPACA_DATA_BASE_URL = 'https://data.alpaca.markets' as const;

export class AlpacaCredentialError extends Error {
  constructor() {
    super('ALPACA_PAPER_KEY or ALPACA_PAPER_SECRET not set in environment');
    this.name = 'AlpacaCredentialError';
  }
}

export class AlpacaApiError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status: number,
    public readonly bodyText: string,
  ) {
    super(`AlpacaApiError ${status} on ${endpoint}: ${bodyText.slice(0, 200)}`);
    this.name = 'AlpacaApiError';
  }
}

export class AlpacaNetworkError extends Error {
  constructor(public readonly endpoint: string, cause: unknown) {
    super(`AlpacaNetworkError on ${endpoint}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'AlpacaNetworkError';
  }
}

export interface AlpacaPaperClientConfig {
  /** Override base URL — used in tests with mocked fetch. */
  baseUrlOverride?: string;
  dataUrlOverride?: string;
  /** Inject fetch implementation — defaults to global fetch; tests provide mock. */
  fetchImpl?: typeof fetch;
}

// @ts-ignore — Deno global; this file is consumed by Deno, not the Vite bundle.
declare const Deno: { env: { get(name: string): string | undefined } };

export class AlpacaPaperClient {
  private readonly key: string;
  private readonly secret: string;
  private readonly baseUrl: string;
  private readonly dataUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: AlpacaPaperClientConfig = {}) {
    const key = Deno.env.get('ALPACA_PAPER_KEY');
    const secret = Deno.env.get('ALPACA_PAPER_SECRET');
    if (!key || !secret) throw new AlpacaCredentialError();
    this.key = key;
    this.secret = secret;
    this.baseUrl = config.baseUrlOverride ?? ALPACA_PAPER_BASE_URL;
    this.dataUrl = config.dataUrlOverride ?? ALPACA_DATA_BASE_URL;
    this.fetchFn = config.fetchImpl ?? fetch;
  }

  private headers(): HeadersInit {
    return {
      'APCA-API-KEY-ID': this.key,
      'APCA-API-SECRET-KEY': this.secret,
      'Accept': 'application/json',
    };
  }

  /** Generic typed GET. Throws AlpacaApiError on non-2xx; AlpacaNetworkError on fetch failure. */
  async getJson<T>(endpoint: string, useDataUrl = false): Promise<T> {
    const url = `${useDataUrl ? this.dataUrl : this.baseUrl}${endpoint}`;
    let resp: Response;
    try {
      resp = await this.fetchFn(url, { method: 'GET', headers: this.headers() });
    } catch (cause) {
      throw new AlpacaNetworkError(endpoint, cause);
    }
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => '<no body>');
      throw new AlpacaApiError(endpoint, resp.status, bodyText);
    }
    return await resp.json() as T;
  }

  /** Generic typed POST. */
  async postJson<TBody, TResp>(endpoint: string, body: TBody, useDataUrl = false): Promise<TResp> {
    const url = `${useDataUrl ? this.dataUrl : this.baseUrl}${endpoint}`;
    let resp: Response;
    try {
      resp = await this.fetchFn(url, {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new AlpacaNetworkError(endpoint, cause);
    }
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => '<no body>');
      throw new AlpacaApiError(endpoint, resp.status, bodyText);
    }
    return await resp.json() as TResp;
  }
}