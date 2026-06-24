/**
 * alpaca-paper-client (EDGE-RESIDENT) — minimal Alpaca paper-trading REST wrapper.
 *
 * ACT-316 (E6-build-revision) — edge-resident transcription of the src/-resident
 * `src/features/longshort/services/broker/alpaca/alpaca-paper-client.ts`. The src/
 * copy remains untouched and continues to serve src/ verifier/signal/UI paths;
 * this edge-resident copy is consumed exclusively by the Supabase edge function
 * tree via `_shared/longshort-execution/broker-bootstrap.ts`.
 *
 * Architectural rationale (codebase-determined, not preference): the
 * `longshort-broker-interfaces.ts` header + the E2 submitter pattern + the
 * negative-guard tests in `_shared/longshort-execution/order-submitter_test.ts`
 * and `ordering_test.ts` encode the intended architecture — edge code speaks
 * broker-interface CONTRACTS (injected), never the concrete src/ AlpacaPaperClient.
 * E6-build (ACT-314) deviated by reaching into src/; FP-011 caught it as Gate-2
 * red. This revision restores the architecture: the edge tree owns its own
 * Alpaca surface, importing nothing from src/.
 *
 * BEHAVIOR IS BYTE-IDENTICAL to the src/ copy (transcription, not redesign):
 *   - Same endpoints, same auth headers, same error taxonomy.
 *   - Same INC-77 paper-only-URL allow-list + PaperOnlyViolationError (DEC-068
 *     clause f + k.8 — money-path guard MUST NOT be dropped in transcription).
 *   - Same fetchImpl injection seam (replay-fixture leg E_evidence_1 uses it).
 *   - Same deleteVoid body-drain (Deno requires consumption).
 *   - Same Deno.env.get cred read + AlpacaCredentialError on absence.
 *
 * Per DEC-034 clause (3): errors propagate; no swallow + phantom-success.
 * Per DEC-034 clause (4): no wall-clock leakage; client takes no time params.
 */

const ALPACA_PAPER_BASE_URL = 'https://paper-api.alpaca.markets' as const;
const ALPACA_DATA_BASE_URL = 'https://data.alpaca.markets' as const;

/**
 * Allow-listed URL prefixes for `baseUrlOverride` / `dataUrlOverride`.
 * Verbatim transcription of the src/ copy's INC-77 closure (DEC-068 clause
 * f + k.8). Any other override throws `PaperOnlyViolationError` at
 * CONSTRUCTION (not at first request) so a misconfigured client never
 * enters the live trading host's call surface, even transiently.
 */
const PAPER_ONLY_ALLOWED_URL_PREFIXES = [
  'https://paper-api.alpaca.markets',
  'https://data.alpaca.markets',
  'http://localhost',
  'https://localhost',
] as const;

export class AlpacaCredentialError extends Error {
  constructor() {
    super('ALPACA_PAPER_KEY or ALPACA_PAPER_SECRET not set in environment');
    this.name = 'AlpacaCredentialError';
  }
}

export class PaperOnlyViolationError extends Error {
  readonly kind: 'baseUrlOverride' | 'dataUrlOverride';
  readonly offendingValue: string;
  constructor(kind: 'baseUrlOverride' | 'dataUrlOverride', offendingValue: string) {
    super(
      `PaperOnlyViolationError: ${kind}=${JSON.stringify(offendingValue)} ` +
        `not in allow-list ${JSON.stringify(PAPER_ONLY_ALLOWED_URL_PREFIXES)} — ` +
        `paper-only-URL discipline per DEC-068 clause (f) + (k).8 (INC-77 closure)`,
    );
    this.name = 'PaperOnlyViolationError';
    this.kind = kind;
    this.offendingValue = offendingValue;
  }
}

function isAllowListedPaperUrl(url: string): boolean {
  for (const prefix of PAPER_ONLY_ALLOWED_URL_PREFIXES) {
    if (url.startsWith(prefix)) return true;
  }
  return false;
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
  baseUrlOverride?: string;
  dataUrlOverride?: string;
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
    if (config.baseUrlOverride !== undefined && !isAllowListedPaperUrl(config.baseUrlOverride)) {
      throw new PaperOnlyViolationError('baseUrlOverride', config.baseUrlOverride);
    }
    if (config.dataUrlOverride !== undefined && !isAllowListedPaperUrl(config.dataUrlOverride)) {
      throw new PaperOnlyViolationError('dataUrlOverride', config.dataUrlOverride);
    }
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

  async deleteVoid(endpoint: string): Promise<void> {
    const url = `${this.baseUrl}${endpoint}`;
    let resp: Response;
    try {
      resp = await this.fetchFn(url, { method: 'DELETE', headers: this.headers() });
    } catch (cause) {
      throw new AlpacaNetworkError(endpoint, cause);
    }
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => '<no body>');
      throw new AlpacaApiError(endpoint, resp.status, bodyText);
    }
    await resp.text().catch(() => '');
  }
}