/**
 * useShadowForwardReturnsPaired — FP-054 sub-step 54.1 (AC2 n-counter,
 * AC3 spread). Pairs an exploratory arm against the operative
 * baseline (`gated_k0` per DEC-059 §1a) by joining the validated
 * 54.0-STEP-D key `(seed_as_of_date, ticker, side, horizon_td)` on
 * `source_table='combiner_book_shadow'` + `price_source_status='success'`
 * + `seed_as_of_date >= heal_date`.
 *
 * Supabase REST has no cross-table join here (no FK), so the hook
 * fetches both arms in parallel and pairs in client. The pure pair
 * helper `pairForwardReturns` is exported for unit-test.
 *
 * Returns paired rows (per row: arm_return + baseline_return) plus
 * the distinct-seed-day count `n` (AC2 sample-size readout).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const sb = supabase as unknown as SupabaseClient;

export interface ForwardReturnRow {
  seed_as_of_date: string;
  ticker: string;
  side: string;
  horizon_td: number;
  side_signed_return: number | null;
}

export interface PairedRow {
  seed_as_of_date: string;
  ticker: string;
  side: string;
  horizon_td: number;
  arm_return: number;
  baseline_return: number;
}

export interface PairedResult {
  paired: PairedRow[];
  n: number; // distinct seed_as_of_date count over paired rows
}

/**
 * Pure pair: index baseline by (seed_as_of_date,ticker,side,horizon_td)
 * then walk arm rows, emitting a paired row when both side_signed_return
 * values are finite numbers. `n` = distinct seed_as_of_date over paired.
 */
export function pairForwardReturns(
  armRows: ForwardReturnRow[] | null | undefined,
  baselineRows: ForwardReturnRow[] | null | undefined,
): PairedResult {
  const idx = new Map<string, ForwardReturnRow>();
  for (const b of baselineRows ?? []) {
    idx.set(
      `${b.seed_as_of_date}|${b.ticker}|${b.side}|${b.horizon_td}`,
      b,
    );
  }
  const paired: PairedRow[] = [];
  const seedDays = new Set<string>();
  for (const a of armRows ?? []) {
    const k = `${a.seed_as_of_date}|${a.ticker}|${a.side}|${a.horizon_td}`;
    const b = idx.get(k);
    if (!b) continue;
    if (
      typeof a.side_signed_return !== 'number' ||
      !Number.isFinite(a.side_signed_return) ||
      typeof b.side_signed_return !== 'number' ||
      !Number.isFinite(b.side_signed_return)
    )
      continue;
    paired.push({
      seed_as_of_date: a.seed_as_of_date,
      ticker: a.ticker,
      side: a.side,
      horizon_td: a.horizon_td,
      arm_return: a.side_signed_return,
      baseline_return: b.side_signed_return,
    });
    seedDays.add(a.seed_as_of_date);
  }
  return { paired, n: seedDays.size };
}

async function fetchVariantHorizon(
  variant: string,
  horizon: number,
  healDate: string,
): Promise<ForwardReturnRow[]> {
  const { data, error } = await sb
    .from('combiner_forward_returns')
    .select('seed_as_of_date, ticker, side, horizon_td, side_signed_return')
    .eq('variant', variant)
    .eq('horizon_td', horizon)
    .eq('source_table', 'combiner_book_shadow')
    .eq('price_source_status', 'success')
    .gte('seed_as_of_date', healDate);
  if (error) throw error;
  return (data ?? []) as ForwardReturnRow[];
}

export function useShadowForwardReturnsPaired(
  armVariant: string,
  horizon: number,
  healDate: string | null | undefined,
  baselineVariant = 'gated_k0',
) {
  return useQuery({
    enabled: !!healDate && !!armVariant && Number.isFinite(horizon),
    queryKey: [
      'longshort',
      'shadow',
      'forward-returns-paired',
      armVariant,
      baselineVariant,
      horizon,
      healDate ?? null,
    ] as const,
    queryFn: async (): Promise<PairedResult> => {
      // healDate guaranteed non-null by `enabled` gate above.
      const hd = healDate as string;
      const [arm, baseline] = await Promise.all([
        fetchVariantHorizon(armVariant, horizon, hd),
        fetchVariantHorizon(baselineVariant, horizon, hd),
      ]);
      return pairForwardReturns(arm, baseline);
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });
}