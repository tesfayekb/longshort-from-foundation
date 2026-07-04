/**
 * alpaca-paper-client (OVERSHOOT, EDGE-RESIDENT) — minimal Alpaca paper-trading REST wrapper.
 *
 * FP-069 W3.2.a (ACT-459.a) — overshoot-owned sibling of
 *   supabase/functions/_shared/longshort-broker/alpaca-paper-client.ts
 * Behavior is byte-equivalent to the longshort copy (transcription, not
 * redesign) with three overshoot-specific rebindings enumerated below.
 * The longshort copy remains untouched. Zero cross-membrane imports —
 * the CI separation guard (RULE 1 extended to _shared/overshoot-broker/
 * this same sub-turn) enforces the isolation structurally.
 *
 * OVERSHOOT-SPECIFIC REBINDINGS (only differences vs the longshort copy):
 *   1. Secret names — Deno.env.get('ALPACA_PAPER_KEY_OVERSHOOT') and
 *      Deno.env.get('ALPACA_PAPER_SECRET_OVERSHOOT'). Account #2 (B3
 *      probe: PA37Y0DBAZD5 last-4 AZD5, ACTIVE, shorting_enabled=true;
 *      distinct from longshort's account #1 PA3CRAJBSVZO last-4 SVZO —
 *      INC-77 comparator @ docs/06-tracking/incidental-findings.md:954).
 *      The account separation is enforced UPSTREAM of this client via
 *      the secret-name divergence — if the operator swaps the values,
 *      the money-path lands in the wrong account; a runtime cross-check
 *      (e.g. account_number allow-list) is deferred to W3.3+.
 *   2. Error-class names — Overshoot* prefix so stack traces + typed
 *      catches disambiguate which strategy raised. The shape / status
 *      / bodyText / kind / offendingValue payload is byte-identical.
 *   3. Import surface — no imports; the paper-only allow-list is
 *      declared inline (parity with the longshort copy, which also
 *      declares it inline).
 *
 * BYTE-EQUIVALENT INVARIANTS (transcription-preserved from longshort copy):
 *   - Same endpoints (paper-api / data.alpaca base URLs).
 *   - Same auth headers (APCA-API-KEY-ID / APCA-API-SECRET-KEY).
 *   - Same INC-77 paper-only-URL allow-list, evaluated at CONSTRUCTION —
 *     a misconfigured client never enters the live host's call surface,
 *     even transiently (DEC-068 clause f + k.8, INC-77 closure).
 *   - Same `fetchImpl` injection seam for tests / replay fixtures.
 *   - Same deleteVoid body-drain (Deno requires consumption).
 *   - Same error-taxonomy branches (Credential / PaperOnlyViolation /
 *     Api {endpoint, status, bodyText} / Network {endpoint, cause}).
 *
 * Per DEC-034 clause (3): errors propagate; no swallow + phantom-success.
 * Per DEC-034 clause (4): no wall-clock read; client takes no time params.
 */

const ALPACA_PAPER_BASE_URL = 'https://paper-api.alpaca.markets' as const;
const ALPACA_DATA_BASE_URL = 'https://data.alpaca.markets' as const;

/**
 * Allow-listed URL prefixes for `baseUrlOverride` / `dataUrlOverride`.
 * Byte-identical to the longshort copy's INC-77 closure list. Any other
 * override throws OvershootPaperOnlyViolationError at CONSTRUCTION.
 */
const PAPER_ONLY_ALLOWED_URL_PREFIXES = [
  'https://paper-api.alpaca.markets',
  'https://data.alpaca.markets',
  'http://localhost',
  'https://localhost',
] as const;

export class OvershootAlpacaCredentialError extends Error {
  constructor() {
    super(
      'ALPACA_PAPER_KEY_OVERSHOOT or ALPACA_PAPER_SECRET_OVERSHOOT not set in environment',
    );
    this.name = 'OvershootAlpacaCredentialError';
  }
}

export class OvershootPaperOnlyViolationError extends Error {
  readonly kind: 'baseUrlOverride' | 'dataUrlOverride';
  readonly offendingValue: string;
  constructor(kind: 'baseUrlOverride' | 'dataUrlOverride', offendingValue: string) {
    super(
      `OvershootPaperOnlyViolationError: ${kind}=${JSON.stringify(offendingValue)} ` +
        `not in allow-list ${JSON.stringify(PAPER_ONLY_ALLOWED_URL_PREFIXES)} — ` +
        `paper-only-URL discipline per DEC-068 clause (f) + (k).8 (INC-77 closure)`,
    );
    this.name = 'OvershootPaperOnlyViolationError';
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

export class OvershootAlpacaApiError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status: number,
    public readonly bodyText: string,
  ) {
    super(
      `OvershootAlpacaApiError ${status} on ${endpoint}: ${bodyText.slice(0, 200)}`,
    );
    this.name = 'OvershootAlpacaApiError';
  }
}

export class OvershootAlpacaNetworkError extends Error {
  constructor(public readonly endpoint: string, cause: unknown) {
    super(
      `OvershootAlpacaNetworkError on ${endpoint}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = 'OvershootAlpacaNetworkError';
  }
}

export interface OvershootAlpacaPaperClientConfig {
  baseUrlOverride?: string;
  dataUrlOverride?: string;
  fetchImpl?: typeof fetch;
}

// @ts-ignore — Deno global; this file is consumed by Deno, not the Vite bundle.
declare const Deno: { env: { get(name: string): string | undefined } };

export class OvershootAlpacaPaperClient {
  private readonly key: string;
  private readonly secret: string;
  private readonly baseUrl: string;
  private readonly dataUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: OvershootAlpacaPaperClientConfig = {}) {
    const key = Deno.env.get('ALPACA_PAPER_KEY_OVERSHOOT');
    const secret = Deno.env.get('ALPACA_PAPER_SECRET_OVERSHOOT');
    if (!key || !secret) throw new OvershootAlpacaCredentialError();
    this.key = key;
    this.secret = secret;
    if (
      config.baseUrlOverride !== undefined &&
      !isAllowListedPaperUrl(config.baseUrlOverride)
    ) {
      throw new OvershootPaperOnlyViolationError('baseUrlOverride', config.baseUrlOverride);
    }
    if (
      config.dataUrlOverride !== undefined &&
      !isAllowListedPaperUrl(config.dataUrlOverride)
    ) {
      throw new OvershootPaperOnlyViolationError('dataUrlOverride', config.dataUrlOverride);
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
      throw new OvershootAlpacaNetworkError(endpoint, cause);
    }
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => '<no body>');
      throw new OvershootAlpacaApiError(endpoint, resp.status, bodyText);
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
      throw new OvershootAlpacaNetworkError(endpoint, cause);
    }
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => '<no body>');
      throw new OvershootAlpacaApiError(endpoint, resp.status, bodyText);
    }
    return await resp.json() as TResp;
  }

  async deleteVoid(endpoint: string): Promise<void> {
    const url = `${this.baseUrl}${endpoint}`;
    let resp: Response;
    try {
      resp = await this.fetchFn(url, { method: 'DELETE', headers: this.headers() });
    } catch (cause) {
      throw new OvershootAlpacaNetworkError(endpoint, cause);
    }
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => '<no body>');
      throw new OvershootAlpacaApiError(endpoint, resp.status, bodyText);
    }
    await resp.text().catch(() => '');
  }
}