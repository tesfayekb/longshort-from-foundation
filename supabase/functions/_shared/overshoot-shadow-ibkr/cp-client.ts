/**
 * IBKR Client Portal Web API client — ACT-572 skeleton.
 *
 * DORMANT: this module contains typed error surface, session/reauth
 * scaffolding, and endpoint constants only. It DOES NOT issue live
 * network calls. All public methods throw `IbkrShadowDisabledError`
 * when `ibkr_shadow_enabled=false` (the default), and throw
 * `IbkrShadowNotImplementedError` when enabled but the Phase-1 wiring
 * has not landed. This preserves the "skeleton deploys but stays
 * dormant" charter §2 discipline.
 *
 * MEMBRANE: this file lives under
 *   supabase/functions/_shared/overshoot-shadow-ibkr/
 * which the `check-ibkr-shadow-separation` CI guard forbids money-path
 * files from importing. Only:
 *   - supabase/functions/overshoot-ibkr-shadow-mirror/
 *   - supabase/functions/overshoot-ibkr-shadow-reconcile/
 *   - supabase/functions/_shared/overshoot-shadow-ibkr/
 *   - test files under scripts/
 * may import from this tree.
 */

export class IbkrShadowDisabledError extends Error {
  readonly typedError = 'ibkr_shadow_disabled' as const;
  constructor(msg = 'IBKR shadow lane is disabled (ibkr_shadow_enabled=false)') {
    super(msg);
    this.name = 'IbkrShadowDisabledError';
  }
}

export class IbkrShadowNotImplementedError extends Error {
  readonly typedError = 'ibkr_shadow_not_implemented' as const;
  constructor(op: string) {
    super(`IBKR shadow op '${op}' not implemented in ACT-572 skeleton (Phase-1 wiring pending)`);
    this.name = 'IbkrShadowNotImplementedError';
  }
}

export class IbkrCpAuthError extends Error {
  readonly typedError = 'ibkr_cp_auth_error' as const;
  constructor(msg: string) { super(msg); this.name = 'IbkrCpAuthError'; }
}

export class IbkrCpTransportError extends Error {
  readonly typedError = 'ibkr_cp_transport_error' as const;
  constructor(msg: string, readonly status?: number) {
    super(msg); this.name = 'IbkrCpTransportError';
  }
}

/** Endpoint constants — locked to charter §3 / ACT-565 §4.4. */
export const IBKR_CP_ENDPOINTS = {
  SESSION_INIT:        '/iserver/auth/ssodh/init',
  TICKLE:              '/tickle',
  ORDER_SUBMIT:        (accountId: string) => `/iserver/account/${accountId}/orders`,
  ORDER_STATUS:        '/iserver/account/orders',
  POSITIONS:           (accountId: string) => `/portfolio/${accountId}/positions/0`,
  LEDGER:              (accountId: string) => `/portfolio/${accountId}/ledger`,
  SNAPSHOT:            '/iserver/marketdata/snapshot',
  SECDEF_SEARCH:       '/iserver/secdef/search',
  SECDEF_INFO:         '/iserver/secdef/info',
} as const;

/** Charter §4 operator-provisioned secrets (names locked). */
export const IBKR_SECRET_NAMES = [
  'IBKR_PAPER_GATEWAY_URL',
  'IBKR_PAPER_ACCOUNT_ID',
  'IBKR_PAPER_USERNAME',
  'IBKR_PAPER_PASSWORD',
  'IBKR_PAPER_SESSION_TOKEN',
] as const;

export type IbkrSecretName = typeof IBKR_SECRET_NAMES[number];

/**
 * Read the kill-switch from `system_config`. Returns `false` on any
 * error (fail-closed — charter §2 "fail-open on the shadow lane,
 * fail-closed on the flag read").
 */
export async function isIbkrShadowEnabled(
  supabase: { from: (t: string) => { select: (c: string) => { eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: { value: unknown } | null; error: unknown }> } } } },
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'ibkr_shadow_enabled')
      .maybeSingle();
    if (error || !data) return false;
    return data.value === true;
  } catch {
    return false;
  }
}

/**
 * Shape of a would-be CP submit — locked so Phase-1 wiring drops in
 * without contract debate. Types only; no runtime behavior.
 */
export interface IbkrShadowSubmitInput {
  mirror_of_alpaca_client_order_id: string;
  mirror_of_alpaca_lot_id: string | null;
  mirror_reason: 'admit' | 'exit_senior' | 'exit_morning' | 'exit_kill';
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  limit_price: number | null;
  tif: 'day' | 'gtc';
}

export interface IbkrShadowSubmitResult {
  ibkr_order_id: string;
  status: 'submitted' | 'refused' | 'errored';
  refusal_reason: string | null;
  raw_response: unknown;
}

/**
 * Dormant client — every method is a typed throw. Phase-1 replaces
 * these bodies with `fetch()` calls against `IBKR_CP_ENDPOINTS`.
 */
export class IbkrShadowClient {
  constructor(readonly gatewayUrl: string, readonly accountId: string) {}

  async submitOrder(_input: IbkrShadowSubmitInput): Promise<IbkrShadowSubmitResult> {
    throw new IbkrShadowNotImplementedError('submitOrder');
  }

  async getOrderStatus(_ibkrOrderId: string): Promise<unknown> {
    throw new IbkrShadowNotImplementedError('getOrderStatus');
  }

  async listPositions(): Promise<unknown> {
    throw new IbkrShadowNotImplementedError('listPositions');
  }

  async getLedger(): Promise<unknown> {
    throw new IbkrShadowNotImplementedError('getLedger');
  }
}