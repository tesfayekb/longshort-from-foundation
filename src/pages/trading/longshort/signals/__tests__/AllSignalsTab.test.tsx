/**
 * FP-038 — AllSignalsTab page assembly + registry rendering.
 *
 * `useSignalRegistry` is module-mocked with typed fixtures (no `any`).
 * Covers:
 *   - All 10 registry rows render.
 *   - Live signals show real last-fire + coverage.
 *   - Planned signals show "—" for last-fire/coverage and a planned badge.
 *   - Composite row is present and planned.
 *   - Drift shows "Insufficient history" when distinctDates < DRIFT_MIN_HISTORY.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type {
  SignalRegistryRowWithFire,
} from '@/features/longshort/hooks/useSignalRegistry';

const FIXTURE: SignalRegistryRowWithFire[] = [
  {
    signal_id: 'analyst_revision_drift',
    signal_num: 1,
    display_name: 'Analyst revision drift',
    spec_ref: '§4.4.5',
    cadence: 'intraday (15 min)',
    status: 'planned',
    criticality: 'non_critical',
    stale_after_hours: null,
    planned_phase: 'Phase 2.5',
    job_registry_id: null,
    display_order: 1,
    lastFire: null,
    totalRuns: 0,
    distinctDates: 0,
    cron_schedule: null,
  },
  {
    signal_id: 'pead',
    signal_num: 2,
    display_name: 'PEAD (post-earnings drift)',
    spec_ref: '§4.4.6',
    cadence: 'event-triggered',
    status: 'planned',
    criticality: 'non_critical',
    stale_after_hours: null,
    planned_phase: 'Phase 2.6',
    job_registry_id: null,
    display_order: 2,
    lastFire: null,
    totalRuns: 0,
    distinctDates: 0,
    cron_schedule: null,
  },
  {
    signal_id: 'options_flow_imbalance_5d',
    signal_num: 3,
    display_name: 'Options flow imbalance',
    spec_ref: '§4.4.7',
    cadence: 'intraday (5 min)',
    status: 'planned',
    criticality: 'non_critical',
    stale_after_hours: null,
    planned_phase: 'Phase 2.7',
    job_registry_id: null,
    display_order: 3,
    lastFire: null,
    totalRuns: 0,
    distinctDates: 0,
    cron_schedule: null,
  },
  {
    signal_id: 'insider_transactions_90d',
    signal_num: 4,
    display_name: 'Insider transactions (90-day, 14-day half-life)',
    spec_ref: '§4.4.4',
    cadence: 'intraday (30 min)',
    status: 'planned',
    criticality: 'non_critical',
    stale_after_hours: null,
    planned_phase: 'Phase 2.4',
    job_registry_id: null,
    display_order: 4,
    lastFire: null,
    totalRuns: 0,
    distinctDates: 0,
    cron_schedule: null,
  },
  {
    signal_id: 'short_interest_change_30d',
    signal_num: 5,
    display_name: 'Short interest changes (30-day)',
    spec_ref: '§4.4.3',
    cadence: 'twice-monthly',
    status: 'planned',
    criticality: 'non_critical',
    stale_after_hours: null,
    planned_phase: 'Phase 2.3',
    job_registry_id: null,
    display_order: 5,
    lastFire: null,
    totalRuns: 0,
    distinctDates: 0,
    cron_schedule: null,
  },
  {
    signal_id: 'cross_sectional_momentum_12_1',
    signal_num: 6,
    display_name: 'Cross-sectional momentum (12-1)',
    spec_ref: '§4.4.1',
    cadence: 'daily',
    status: 'live',
    criticality: 'critical',
    stale_after_hours: 36,
    planned_phase: null,
    job_registry_id: 'longshort.momentum.compute',
    display_order: 6,
    lastFire: {
      completed_at: '2026-06-08T11:54:00Z',
      as_of_date: '2026-06-08',
      outcome: 'completed',
      universe_size: 834,
      persisted_count: 834,
    },
    totalRuns: 2,
    distinctDates: 1,
    cron_schedule: null,
  },
  {
    signal_id: 'short_term_reversal_1w',
    signal_num: 7,
    display_name: 'Short-term reversal (1-week)',
    spec_ref: '§4.4.2',
    cadence: 'daily',
    status: 'live',
    criticality: 'critical',
    stale_after_hours: 36,
    planned_phase: null,
    job_registry_id: 'longshort.reversal.compute',
    display_order: 7,
    lastFire: {
      completed_at: '2026-06-08T12:00:00Z',
      as_of_date: '2026-06-08',
      outcome: 'completed',
      universe_size: 834,
      persisted_count: 820,
    },
    totalRuns: 1,
    distinctDates: 1,
    cron_schedule: null,
  },
  {
    signal_id: 'news_sentiment_7d',
    signal_num: 8,
    display_name: 'News sentiment momentum (7-day)',
    spec_ref: '§4.4.8',
    cadence: 'intraday (5 min)',
    status: 'planned',
    criticality: 'non_critical',
    stale_after_hours: null,
    planned_phase: 'Phase 2.8',
    job_registry_id: null,
    display_order: 8,
    lastFire: null,
    totalRuns: 0,
    distinctDates: 0,
    cron_schedule: null,
  },
  {
    signal_id: 'active_catalyst_flag',
    signal_num: 9,
    display_name: 'Active catalyst flag',
    spec_ref: '§4.4.9',
    cadence: 'intraday (5 min)',
    status: 'planned',
    criticality: 'non_critical',
    stale_after_hours: null,
    planned_phase: 'Phase 2.9',
    job_registry_id: null,
    display_order: 9,
    lastFire: null,
    totalRuns: 0,
    distinctDates: 0,
    cron_schedule: null,
  },
  {
    signal_id: 'composite',
    signal_num: null,
    display_name: 'Composite (combiner output)',
    spec_ref: '§6',
    cadence: 'derived',
    status: 'planned',
    criticality: null,
    stale_after_hours: null,
    planned_phase: 'Phase 3',
    job_registry_id: null,
    display_order: 99,
    lastFire: null,
    totalRuns: 0,
    distinctDates: 0,
    cron_schedule: null,
  },
];

vi.mock('@/features/longshort/hooks/useSignalRegistry', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/longshort/hooks/useSignalRegistry')
  >('@/features/longshort/hooks/useSignalRegistry');
  return {
    ...actual,
    useSignalRegistry: () => ({ data: FIXTURE, isLoading: false, error: null }),
  };
});

async function renderTab() {
  const { default: AllSignalsTab } = await import('../AllSignalsTab');
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <AllSignalsTab />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AllSignalsTab (FP-038)', () => {
  it('renders all 10 registry rows', async () => {
    await renderTab();
    const table = await screen.findByTestId('all-signals-table');
    const bodyRows = within(table).getAllByTestId(/^signal-row-/);
    expect(bodyRows).toHaveLength(10);
  });

  it('live signals show real last-fire + coverage', async () => {
    await renderTab();
    const momentum = await screen.findByTestId('signal-row-cross_sectional_momentum_12_1');
    expect(within(momentum).getByText('Live')).toBeInTheDocument();
    expect(within(momentum).getByText('834 / 834')).toBeInTheDocument();
    expect(within(momentum).getByText(/2026-06-08 11:54/)).toBeInTheDocument();
  });

  it('planned signals show "—" for last-fire/coverage and a planned-phase badge', async () => {
    await renderTab();
    const planned = await screen.findByTestId('signal-row-analyst_revision_drift');
    expect(within(planned).getByText('Phase 2.5')).toBeInTheDocument();
    expect(within(planned).getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('composite row is present and planned (not a separate page)', async () => {
    await renderTab();
    const composite = await screen.findByTestId('signal-row-composite');
    expect(within(composite).getByText(/Composite/)).toBeInTheDocument();
    expect(within(composite).getByText('Phase 3')).toBeInTheDocument();
    expect(
      within(composite).getByText(/Arrives with the combiner/),
    ).toBeInTheDocument();
  });

  it('drift cell shows "Insufficient history" for live signals below the N≥30 threshold', async () => {
    await renderTab();
    const momentum = await screen.findByTestId('signal-row-cross_sectional_momentum_12_1');
    expect(within(momentum).getByText('Insufficient history')).toBeInTheDocument();
  });
});