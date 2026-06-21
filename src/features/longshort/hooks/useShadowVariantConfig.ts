/**
 * useShadowVariantConfig — FP-054 sub-step 54.1.
 *
 * Read-only React Query hook over `public.combiner_shadow_variant_config`
 * (MIG-100, seeded with 12 active variants). Returns only rows where
 * `active = true`. The 12 active variants enumerate the L2 panel's
 * exploratory arms (one of which is the operative baseline,
 * `gated_k0`, per DEC-059 §1a).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const sb = supabase as unknown as SupabaseClient;

export interface ShadowVariantConfigRow {
  variant: string;
  inclusion_rule: string;
  k: number;
  active: boolean;
}

const KEY = ['longshort', 'shadow', 'variant-config'] as const;

export function useShadowVariantConfig() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<ShadowVariantConfigRow[]> => {
      const { data, error } = await sb
        .from('combiner_shadow_variant_config')
        .select('variant, inclusion_rule, k, active')
        .eq('active', true)
        .order('variant', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ShadowVariantConfigRow[];
    },
    // Config is operator-mutated and very stable; a long stale window
    // is fine. Panel refresh on mount re-reads.
    staleTime: 5 * 60_000,
  });
}