/**
 * FP-054 sub-step 54.2 — ShadowMeasurementPanel tests.
 *
 * Covers the AC7 multiplicity-guardrail invariants (banner verbatim,
 * NO pass-fail / promote badge, NO ranking-by-edge, neutral arm
 * order, registration "none" at v1) plus AC9 degradation states.
 * Hooks are module-mocked; no Supabase contact.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ShadowMeasurementPanel,
  SHADOW_AC7_BANNER,
  orderArmsNeutrally,
} from '@/features/longshort/components/shadow/ShadowMeasurementPanel';

vi.mock('@/features/longshort/hooks/useShadowHealDate', () => ({
  useShadowHealDate: vi.fn(),
}));
vi.mock('@/features/longshort/hooks/useShadowVariantConfig', () => ({
  useShadowVariantConfig: vi.fn(),
}));
vi.mock('@/features/longshort/hooks/useShadowBookHead', () => ({
  useShadowBookHead: vi.fn(),
}));
vi.mock('@/features/longshort/hooks/useShadowForwardReturnsPaired', () => ({
  useShadowForwardReturnsPaired: vi.fn(),
}));
vi.mock('@/features/longshort/hooks/useShadowFetchErrorClusters', () => ({
  useShadowFetchErrorClusters: vi.fn(),
}));
vi.mock('@/features/longshort/hooks/useShadowFreshness', () => ({
  useShadowFreshness: vi.fn(),
}));
vi.mock('@/features/longshort/hooks/useVariantRegistration', () => ({
  useVariantRegistration: vi.fn(),
}));

import { useShadowHealDate } from '@/features/longshort/hooks/useShadowHealDate';
import { useShadowVariantConfig } from '@/features/longshort/hooks/useShadowVariantConfig';
import { useShadowBookHead } from '@/features/longshort/hooks/useShadowBookHead';
import { useShadowForwardReturnsPaired } from '@/features/longshort/hooks/useShadowForwardReturnsPaired';
import { useShadowFetchErrorClusters } from '@/features/longshort/hooks/useShadowFetchErrorClusters';
import { useShadowFreshness } from '@/features/longshort/hooks/useShadowFreshness';
import { useVariantRegistration } from '@/features/longshort/hooks/useVariantRegistration';

function ok<T>(data: T) {
  return { data, isLoading: false, error: null } as unknown as ReturnType<
    typeof useShadowHealDate
  >;
}
function loading() {
  return { data: undefined, isLoading: true, error: null } as unknown as ReturnType<
    typeof useShadowHealDate
  >;
}

const VARIANTS = [
  { variant: 'gated_k0', inclusion_rule: 'gated', k: 0, active: true },
  { variant: 'relaxed_a_k1', inclusion_rule: 'relaxed_a', k: 1, active: true },
  { variant: 'relaxed_a_k2', inclusion_rule: 'relaxed_a', k: 2, active: true },
  { variant: 'relaxed_b_k1', inclusion_rule: 'relaxed_b', k: 1, active: true },
];

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ShadowMeasurementPanel />
    </QueryClientProvider>,
  );
}

function primePairedHookEmpty() {
  (useShadowForwardReturnsPaired as ReturnType<typeof vi.fn>).mockReturnValue(
    ok({ paired: [], n: 0 }),
  );
}

describe('orderArmsNeutrally (pure)', () => {
  it('drops the baseline arm and sorts by (inclusion_rule, k)', () => {
    const ordered = orderArmsNeutrally(VARIANTS);
    expect(ordered.map((a) => a.variant)).toEqual([
      'relaxed_a_k1',
      'relaxed_a_k2',
      'relaxed_b_k1',
    ]);
  });
  it('handles null/undefined input', () => {
    expect(orderArmsNeutrally(null)).toEqual([]);
    expect(orderArmsNeutrally(undefined)).toEqual([]);
  });
});

describe('ShadowMeasurementPanel — AC9 degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useShadowFreshness as ReturnType<typeof vi.fn>).mockReturnValue(
      ok({ shadowBookThrough: '2026-06-20', forwardReturnsMaturedThrough: '2026-06-15' }),
    );
    (useShadowVariantConfig as ReturnType<typeof vi.fn>).mockReturnValue(ok(VARIANTS));
    (useShadowBookHead as ReturnType<typeof vi.fn>).mockReturnValue(ok([]));
    (useShadowFetchErrorClusters as ReturnType<typeof vi.fn>).mockReturnValue(
      ok({ clusters: [], topPersistentTickers: [], totalFailRows: 0 }),
    );
    (useVariantRegistration as ReturnType<typeof vi.fn>).mockReturnValue(
      ok({ registration: null }),
    );
    primePairedHookEmpty();
  });

  it('pre-heal: renders clock-not-started, no arms table', () => {
    (useShadowHealDate as ReturnType<typeof vi.fn>).mockReturnValue(ok(null));
    renderPanel();
    expect(screen.getByTestId('shadow-state-pre-heal')).toBeInTheDocument();
    expect(screen.queryByTestId('arms-table')).not.toBeInTheDocument();
    expect(screen.getByText(/Measurement clock not started/i)).toBeInTheDocument();
  });

  it('loading: skeletons only, no banner', () => {
    (useShadowHealDate as ReturnType<typeof vi.fn>).mockReturnValue(loading());
    renderPanel();
    expect(screen.queryByTestId('ac7-banner')).not.toBeInTheDocument();
  });
});

describe('ShadowMeasurementPanel — AC7 multiplicity chrome (LOAD-BEARING)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useShadowHealDate as ReturnType<typeof vi.fn>).mockReturnValue(ok('2026-06-01'));
    (useShadowVariantConfig as ReturnType<typeof vi.fn>).mockReturnValue(ok(VARIANTS));
    (useShadowFreshness as ReturnType<typeof vi.fn>).mockReturnValue(
      ok({ shadowBookThrough: '2026-06-20', forwardReturnsMaturedThrough: '2026-06-15' }),
    );
    (useShadowBookHead as ReturnType<typeof vi.fn>).mockReturnValue(ok([]));
    (useShadowFetchErrorClusters as ReturnType<typeof vi.fn>).mockReturnValue(
      ok({ clusters: [], topPersistentTickers: [], totalFailRows: 0 }),
    );
    (useVariantRegistration as ReturnType<typeof vi.fn>).mockReturnValue(
      ok({ registration: null }),
    );
    primePairedHookEmpty();
  });

  it('renders the AC7 banner verbatim', () => {
    renderPanel();
    const banner = screen.getByTestId('ac7-banner');
    expect(banner.textContent).toContain(SHADOW_AC7_BANNER);
  });

  it('registration-of-record renders "none" at v1', () => {
    renderPanel();
    const reg = screen.getByTestId('registration-of-record');
    expect(reg.getAttribute('data-registered')).toBe('false');
    expect(reg.textContent).toMatch(/No confirmatory pre-registration/i);
  });

  it('arms render in neutral (inclusion_rule, k) order — never by edge', () => {
    renderPanel();
    const table = screen.getByTestId('arms-table');
    const rows = table.querySelectorAll('tbody tr[data-arm]');
    const order = Array.from(rows).map((r) => r.getAttribute('data-arm'));
    expect(order).toEqual(['relaxed_a_k1', 'relaxed_a_k2', 'relaxed_b_k1']);
    // baseline arm is NEVER rendered as one of the relaxed-arm rows
    expect(order).not.toContain('gated_k0');
  });

  it('NO gate / pass-fail / promote affordance on any arm', () => {
    renderPanel();
    const table = screen.getByTestId('arms-table');
    const text = (table.textContent ?? '').toLowerCase();
    for (const forbidden of [
      'qualifies',
      'promote',
      'gate cleared',
      'pass',
      'fail',
      'significant',
      'reject',
    ]) {
      expect(text).not.toContain(forbidden);
    }
    // No button affordance in the arms table.
    expect(table.querySelectorAll('button').length).toBe(0);
  });

  it('freshness link points to /admin/jobs (data-derived, not cron_last_fire)', () => {
    renderPanel();
    const link = screen.getByText(/Cron health/i).closest('a');
    expect(link?.getAttribute('href')).toBe('/admin/jobs');
  });
});