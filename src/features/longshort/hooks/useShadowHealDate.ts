/**
 * useShadowHealDate — FP-054 sub-step 54.1 (L2 Shadow-Measurement panel).
 *
 * Read-only React Query hook over the SECURITY DEFINER RPC
 * `public.longshort_get_heal_date()` (MIG-104; hardened at MIG-105 —
 * EXECUTE revoked from PUBLIC/anon, retained for `authenticated`).
 *
 * The RPC reads `system_config.value->>'heal_date'` for the key
 * `dw_106_short_interest_heal_date` (DEC-060 §iii — PERMANENT, never
 * overwritten once stamped) and gates the read on
 * `has_permission(auth.uid(),'longshort.view')`. Returns `null` when
 * the carry clock has not yet started (pre-heal state).
 *
 * The generated type returns `string` (date), but the SQL body can
 * return NULL when no row exists. The hook normalizes both branches.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const sb = supabase as unknown as SupabaseClient;

const KEY = ['longshort', 'shadow', 'heal-date'] as const;

export function useShadowHealDate() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await sb.rpc('longshort_get_heal_date');
      if (error) throw error;
      return (data ?? null) as string | null;
    },
    // Heal-date is a one-time stamp — it cannot change once present.
    // A slow refetch is enough to catch the pre→post-heal transition.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });
}