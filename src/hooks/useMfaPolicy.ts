/**
 * useMfaPolicy — Reads the per-user MFA enforcement state.
 *
 * PLAN-AUTH-MFA-POLICY-001 / DEC-028.
 *
 * Returns:
 *   - panels: per-panel policy ('required' | 'optional')
 *   - require_mfa_for_self: user's own preference
 *
 * Cached for 5 minutes; prefetched in AdminLayout/UserLayout to keep paint
 * time unaffected.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export type PanelEnforcement = 'required' | 'optional';

export interface MfaPolicyResponse {
  version: number;
  panels: Record<string, PanelEnforcement>;
  require_mfa_for_self: boolean;
}

export const MFA_POLICY_KEY = ['mfa-policy'] as const;

export const mfaPolicyQueryFn = async (): Promise<MfaPolicyResponse> =>
  apiClient.get<MfaPolicyResponse>('get-mfa-policy');

export function useMfaPolicy() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: [...MFA_POLICY_KEY],
    queryFn: mfaPolicyQueryFn,
    staleTime: 5 * 60 * 1000,
  });

  const updatePolicy = useMutation({
    mutationFn: async (panels: Record<string, PanelEnforcement>) =>
      apiClient.patch<{ policy: MfaPolicyResponse; changed: boolean }>(
        'update-mfa-policy',
        { panels },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...MFA_POLICY_KEY] });
      toast({ title: 'MFA policy updated' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Update failed', description: error.message });
    },
  });

  const updateSelfPref = useMutation({
    mutationFn: async (require_mfa_for_self: boolean) =>
      apiClient.patch<{ require_mfa_for_self: boolean; changed: boolean }>(
        'update-mfa-self-pref',
        { require_mfa_for_self },
      ),
    onSuccess: (data) => {
      queryClient.setQueryData([...MFA_POLICY_KEY], (prev: MfaPolicyResponse | undefined) =>
        prev ? { ...prev, require_mfa_for_self: data.require_mfa_for_self } : prev,
      );
      toast({ title: 'Preference updated' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Update failed', description: error.message });
    },
  });

  return {
    policy: query.data,
    isLoading: query.isLoading,
    error: query.error,
    updatePolicy: updatePolicy.mutateAsync,
    isUpdatingPolicy: updatePolicy.isPending,
    updateSelfPref: updateSelfPref.mutateAsync,
    isUpdatingSelfPref: updateSelfPref.isPending,
  };
}
