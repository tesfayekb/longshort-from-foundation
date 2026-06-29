/**
 * trading-pause — FP-062 6I.5 / DW-144 §8.9.
 *
 * The thin typed wrapper around the account-wide system pause WRITE surface
 * (MIG-146 `kill_switch_system_pause` RPC) and the read predicate consumed by
 * 6I.6a (pdt_block) and 6I.6b (persistent buying-power divergence).
 *
 * Account-only. Per-symbol pause is DW-150.
 *
 * Contract:
 *   - `pauseAccount`  → invokes the service-role-only RPC. Writes
 *     `state='soft_paused'`, `set_by=NULL`, `set_by_kind='system'`,
 *     `source_ref=<caller provenance>`. Fail-closed on RPC error (throws —
 *     the caller's invariant-violation handler decides; do NOT swallow).
 *   - `isAccountPaused` → mirrors the existing readKillSwitchState pattern
 *     in submit-cron / execute-cron. Returns true iff `state !== 'active'`.
 *     Throws on read error (fail-closed — the caller treats unknown as
 *     paused at the call-site, never coerces to false).
 *
 * Capability gate is the GRANT on the RPC (service_role only). This module
 * MUST be invoked with a service-role-keyed supabase client (`supabaseAdmin`).
 */

export const LONGSHORT_STRATEGY_KEY = 'longshort';

export interface SupabaseLike {
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: any; error: any }>;
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
          // deno-lint-ignore no-explicit-any
          maybeSingle(): Promise<{ data: any; error: any }>;
        };
      };
    };
  };
}

export interface PauseAccountInput {
  reason: string;
  source_ref: string;
  operator_id?: string;
}

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

/**
 * pauseAccount — fire the system soft-pause for the long-short strategy.
 *
 * Throws on RPC error. The RPC itself is idempotent / guarded:
 *   - active             → transitions to soft_paused
 *   - soft_paused        → refreshes reason/source_ref
 *   - hard_paused/liquid → noop (operator stronger state preserved)
 * The caller does not need to pre-check state.
 */
export async function pauseAccount(
  supabase: SupabaseLike,
  input: PauseAccountInput,
): Promise<void> {
  if (!input.reason || !input.source_ref) {
    throw new Error('pauseAccount: reason and source_ref are required');
  }
  const { error } = await supabase.rpc('kill_switch_system_pause', {
    p_strategy_key: LONGSHORT_STRATEGY_KEY,
    p_reason: input.reason,
    p_source_ref: input.source_ref,
    p_operator_id: input.operator_id ?? DEFAULT_OPERATOR_ID,
  });
  if (error) {
    throw new Error(`kill_switch_system_pause RPC failed: ${error.message ?? String(error)}`);
  }
}

/**
 * isAccountPaused — true iff the long-short kill-switch state for the
 * operator is anything other than 'active'. Throws on read error
 * (fail-closed at the call-site).
 */
export async function isAccountPaused(
  supabase: SupabaseLike,
  operator_id: string = DEFAULT_OPERATOR_ID,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('kill_switches')
    .select('state')
    .eq('operator_id', operator_id)
    .eq('strategy_key', LONGSHORT_STRATEGY_KEY)
    .maybeSingle();
  if (error) {
    throw new Error(`isAccountPaused read failed: ${error.message ?? String(error)}`);
  }
  const state = (data?.state as string | undefined) ?? null;
  if (state === null) return false; // no row → never paused
  return state !== 'active';
}