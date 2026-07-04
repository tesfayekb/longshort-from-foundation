/**
 * OvershootAlpacaAccountFetcher (EDGE-RESIDENT) — snapshots the overshoot
 * account (Alpaca #2) equity/buying-power surface. Endpoint: GET /v2/account.
 *
 * FP-069 W3.6.b (ACT-463.b) — I3 sizing input (equity_snapshot) + I7-#7
 * "equity_snapshot_unavailable" typed-refusal contract. Extends the CALL
 * SHAPE proven by the W3.3 / W3.5 GATE-ZERO probes — never invents an
 * account surface.
 *
 * PROVEN CALL SHAPE (A2 evidence, verbatim citations):
 *   supabase/functions/overshoot-short-interest-compute/index.ts:225-228
 *     `client.getJson<{ account_number?: string; status?: string }>('/v2/account')`
 *   supabase/functions/overshoot-detection-run/index.ts:246-249
 *     `client.getJson<{ account_number?: string; status?: string }>('/v2/account')`
 *   supabase/functions/_shared/overshoot-broker/alpaca-paper-client_test.ts:105
 *     `await client.getJson<{ ok: boolean }>('/v2/account');`
 * The overshoot paper client exposes NO named account seam (grep is clean
 * for v2/account|getAccount inside alpaca-paper-client.ts). This fetcher is
 * the FIRST named surface — it TRANSCRIBES the getJson<'/v2/account'> call
 * used by both probe sites and EXTENDS the response shape with `equity`
 * and `buying_power` (Alpaca /v2/account native fields; docstring notes
 * inherited from the longshort buying-power sibling, which parses
 * `buying_power` and `equity` verbatim from the same endpoint).
 *
 * TYPED-ABSENCE / TYPED-REFUSAL DISCIPLINE (money-path standing rule):
 *   `equity` is REQUIRED for I3 sizing. If Alpaca returns an unparseable
 *   value (missing / empty / non-numeric / non-finite / <= 0) the fetcher
 *   returns { ok: false, refusal: 'equity_snapshot_unavailable', ... } —
 *   NEVER a fabricated 0. The I7-#7 consumer contract is: the sizing
 *   engine reads snap.ok; on false it MUST short-circuit with a typed
 *   refusal (no phantom sizing on missing equity).
 *   `buying_power` participates in the same refusal (both fields feed the
 *   sizing decision — an entry without a BP snapshot cannot be sized).
 *
 * account_number / status are surfaced OPTIONAL (typed as `string | null`).
 * They are diagnostic — not required for sizing — but if Alpaca omits them
 * that is NOT a refusal; downstream just records `null`. Redaction rule
 * (INC-77 posture, mirrored from the probe sites): consumers of
 * `account_number` MUST last-4 it before persisting.
 *
 * Per DEC-034 (3): non-2xx errors (401 / 5xx / etc.) propagate typed from
 *   the client layer — NEVER swallowed and phantom-succeeded.
 * Per DEC-034 (4): fetched_at is the injected `ts` — no wall-clock read.
 */
import type { OvershootAlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaAccountResponse {
  account_number?: string | null;
  status?: string | null;
  equity?: string | null;
  buying_power?: string | null;
}

export interface OvershootAccountSnapshotOk {
  ok: true;
  account_number: string | null;
  status: string | null;
  /** Dollars. Sizing basis (I3). Always > 0 on ok=true. */
  equity: number;
  /** Dollars. Pre-batch capacity check. Always >= 0 on ok=true. */
  buying_power: number;
  fetched_at: Date;
}

export interface OvershootAccountSnapshotRefusal {
  ok: false;
  /** Fixed refusal token — the I7-#7 consumer contract discriminant. */
  refusal: 'equity_snapshot_unavailable';
  /** Human-readable reason for the refusal (audit / operator surface). */
  reason: string;
  /** Raw string values as returned by Alpaca (post-typing). Null if absent. */
  raw_equity: string | null;
  raw_buying_power: string | null;
  fetched_at: Date;
}

export type OvershootAccountSnapshot =
  | OvershootAccountSnapshotOk
  | OvershootAccountSnapshotRefusal;

function normStr(v: string | null | undefined): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export class OvershootAlpacaAccountFetcher {
  constructor(private readonly client: OvershootAlpacaPaperClient) {}

  async fetchAccountSnapshot(ts: Date): Promise<OvershootAccountSnapshot> {
    // Client-layer errors (401, 5xx, network) propagate TYPED — never
    // caught here; the refusal branch is reserved for UNPARSEABLE-EQUITY,
    // which is a distinct condition from "the broker call failed".
    const resp = await this.client.getJson<AlpacaAccountResponse>('/v2/account');

    const raw_equity = normStr(resp.equity);
    const raw_buying_power = normStr(resp.buying_power);

    if (raw_equity === null) {
      return {
        ok: false,
        refusal: 'equity_snapshot_unavailable',
        reason: 'equity field absent or empty on /v2/account response',
        raw_equity, raw_buying_power, fetched_at: ts,
      };
    }
    const equity = parseFloat(raw_equity); // allow-bare-parsefloat: DW-058-B1 parity
    if (!Number.isFinite(equity) || equity <= 0) {
      return {
        ok: false,
        refusal: 'equity_snapshot_unavailable',
        reason: `equity unparseable or non-positive (raw='${raw_equity}')`,
        raw_equity, raw_buying_power, fetched_at: ts,
      };
    }
    if (raw_buying_power === null) {
      return {
        ok: false,
        refusal: 'equity_snapshot_unavailable',
        reason: 'buying_power field absent or empty on /v2/account response',
        raw_equity, raw_buying_power, fetched_at: ts,
      };
    }
    const buying_power = parseFloat(raw_buying_power); // allow-bare-parsefloat: DW-058-B1 parity
    if (!Number.isFinite(buying_power) || buying_power < 0) {
      return {
        ok: false,
        refusal: 'equity_snapshot_unavailable',
        reason: `buying_power unparseable or negative (raw='${raw_buying_power}')`,
        raw_equity, raw_buying_power, fetched_at: ts,
      };
    }

    return {
      ok: true,
      account_number: normStr(resp.account_number),
      status: normStr(resp.status),
      equity,
      buying_power,
      fetched_at: ts,
    };
  }
}