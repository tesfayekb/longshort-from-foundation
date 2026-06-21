/**
 * useShadowFreshness — FP-054 sub-step 54.1 (AC6 / F4 data-derived
 * freshness). Per Fork F4: freshness is DERIVED from the data itself,
 * NOT read from `cron_last_fire` (cron-liveness stays admin-only).
 *
 * Surfaces:
 *   - max(as_of_date) from combiner_book_shadow
 *     → "Shadow book current through".
 *   - max(horizon_close_date) from combiner_forward_returns where
 *     raw_return IS NOT NULL → "Forward returns matured through".
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const sb = supabase as unknown as SupabaseClient;

export interface ShadowFreshness {
  shadowBookThrough: string | null;
  forwardReturnsMaturedThrough: string | null;
}

const KEY = ['longshort', 'shadow', 'freshness'] as const;

export function useShadowFreshness() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<ShadowFreshness> => {
      const [bookRes, frRes] = await Promise.all([
        sb
          .from('combiner_book_shadow')
          .select('as_of_date')
          .order('as_of_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        sb
          .from('combiner_forward_returns')
          .select('horizon_close_date')
          .not('raw_return', 'is', null)
          .not('horizon_close_date', 'is', null)
          .order('horizon_close_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (bookRes.error) throw bookRes.error;
      if (frRes.error) throw frRes.error;
      return {
        shadowBookThrough:
          (bookRes.data as { as_of_date?: string | null } | null)?.as_of_date ?? null,
        forwardReturnsMaturedThrough:
          (frRes.data as { horizon_close_date?: string | null } | null)
            ?.horizon_close_date ?? null,
      };
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });
}