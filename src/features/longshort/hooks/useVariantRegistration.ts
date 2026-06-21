/**
 * useVariantRegistration — FP-054 sub-step 54.1, FORK A (reader-only,
 * storage deferred).
 *
 * Returns the "registration of record" for the operative arm — the
 * pre-specified variant whose gate-clearance the panel is permitted
 * to display. At v1 there is NO source-of-record: the reader returns
 * `{ registration: null }` and the 54.2 UI is required to render
 * "none registered" + block any "gate cleared" affordance until a
 * registration exists.
 *
 * Storage decision (append-only registration table, RLS-gated to
 * superadmin write / `longshort.view` read, with a checkpoint_date +
 * source_ref tying the entry to a specific shadow snapshot) is
 * DEFERRED to the first-registration moment — captured in the FP-054
 * deferred-work register entry, not in this build.
 */
import { useQuery } from '@tanstack/react-query';

export interface VariantRegistration {
  arm: string;
  registeredAt: string;
  registeredBy: string;
  checkpointDate: string;
  sourceRef: string;
}

export interface VariantRegistrationResult {
  registration: VariantRegistration | null;
}

const KEY = ['longshort', 'shadow', 'variant-registration'] as const;

export function useVariantRegistration() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<VariantRegistrationResult> => {
      // FORK A (v1): no storage source exists. Degrade cleanly to
      // null so the panel can render "none registered" and the
      // multiplicity-guardrail chrome can block premature
      // gate-clearance claims.
      return { registration: null };
    },
    staleTime: Infinity,
  });
}