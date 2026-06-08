/**
 * FP-028 — ComputeRunsTab tests.
 *
 * Module-level mock of `useSignalComputeRuns` so the test exercises the
 * page's composition contract (outcome badges, freshness indicator,
 * server-pagination call shape, skipped_detail expansion) without
 * touching Supabase. All mocks are typed — no `any` (Gate-4 lint).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  PaginatedComputeRunsResult,
  SignalComputeRunRow,
} from '@/features/longshort/hooks/useSignalComputeRuns';

const SIGNAL = 'cross_sectional_momentum_12_1';

function makeRun(overrides: Partial<SignalComputeRunRow> & { run_id: string }): SignalComputeRunRow {
  return {
    run_id: overrides.run_id,
    signal_id: SIGNAL,
    as_of_date: '2026-06-05',
    outcome: 'completed',
    universe_size: 839,
    persisted_count: 834,
    started_at: '2026-06-05T00:00:00Z',
    completed_at: '2026-06-05T00:00:00Z',
    failure_reason: null,
    skip_counts: { insufficient_history: 4, missing_sector: 1 },
    skipped_detail: [
      { ticker: 'AAA', reason: 'insufficient_history' },
      { ticker: 'BBB', reason: 'missing_sector' },
    ],
    operator_id: '00000000-0000-0000-0000-000000000001',
    ...overrides,
  };
}

// 31 runs > PAGE_SIZE(25): row 0 is a cron fire (non-midnight), row 1 is a zero-persist run,
// row 2 is a failed run, rest are manual.
const allRuns: SignalComputeRunRow[] = [
  makeRun({
    run_id: 'cron-run',
    completed_at: '2026-06-08T20:05:13Z',
    started_at: '2026-06-08T20:05:00Z',
  }),
  makeRun({
    run_id: 'empty-run',
    persisted_count: 0,
    skip_counts: { insufficient_history: 839, missing_sector: 0 },
    skipped_detail: Array.from({ length: 5 }, (_, i) => ({
      ticker: `TICK${i}`,
      reason: 'insufficient_history',
    })),
  }),
  makeRun({
    run_id: 'failed-run',
    outcome: 'failed',
    failure_reason: 'DB timeout',
    skip_counts: null,
    skipped_detail: null,
  }),
  ...Array.from({ length: 28 }, (_, i) =>
    makeRun({ run_id: `manual-${i}`, as_of_date: '2026-06-05' }),
  ),
];

interface PaginatedCall {
  signalId: string | null;
  page: number;
}
const paginatedCalls: PaginatedCall[] = [];

vi.mock('@/features/longshort/hooks/useSignalComputeRuns', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/longshort/hooks/useSignalComputeRuns')
  >('@/features/longshort/hooks/useSignalComputeRuns');
  return {
    ...actual,
    useAvailableComputeSignals: () => ({ data: [SIGNAL], isLoading: false }),
    usePaginatedComputeRuns: (params: {
      signalId: string | null;
      page: number;
      pageSize: number;
    }): { data: PaginatedComputeRunsResult; isLoading: boolean; error: null } => {
      paginatedCalls.push({ signalId: params.signalId, page: params.page });
      const offset = (params.page - 1) * params.pageSize;
      const slice = allRuns.slice(offset, offset + params.pageSize);
      return {
        data: { rows: slice, total: allRuns.length },
        isLoading: false,
        error: null,
      };
    },
  };
});

async function renderTab() {
  const { default: ComputeRunsTab } = await import('../ComputeRunsTab');
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ComputeRunsTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ComputeRunsTab (FP-028)', () => {
  beforeEach(() => {
    paginatedCalls.length = 0;
    vi.clearAllMocks();
  });

  it('renders the phase-context note', async () => {
    await renderTab();
    expect(
      await screen.findByText(/Compute health for individual signal fires/i),
    ).toBeInTheDocument();
  });

  it('renders the outcome badge for completed runs', async () => {
    await renderTab();
    const badges = await screen.findAllByText('Completed');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('renders a warning "Completed (empty)" badge when outcome is completed but persisted_count is 0 (FP-034)', async () => {
    await renderTab();
    const emptyBadge = await screen.findByText('Completed (empty)');
    expect(emptyBadge).toBeInTheDocument();
    // The warning variant maps to the bg-warning class.
    expect(emptyBadge.closest('div')).toHaveClass('bg-warning');
  });

  it('renders a normal success "Completed" badge when outcome is completed and persisted_count > 0', async () => {
    await renderTab();
    // screen.getAllByText('Completed') would also match 'Completed (empty)'.
    // Filter for the exact text node.
    const completedBadges = screen.getAllByText((_, node) => node?.textContent === 'Completed');
    expect(completedBadges.length).toBeGreaterThan(0);
    const hasSuccess = completedBadges.some((b) =>
      b.closest('div')?.classList.contains('border-success'),
    );
    expect(hasSuccess).toBe(true);
  });

  it('renders the destructive "Failed" badge for failed runs', async () => {
    await renderTab();
    const failedBadge = await screen.findByText('Failed');
    expect(failedBadge).toBeInTheDocument();
    expect(failedBadge.closest('div')).toHaveClass('bg-destructive');
  });

  it('surfaces the freshness indicator with cron vs manual classification', async () => {
    await renderTab();
    const indicator = await screen.findByTestId('freshness-indicator');
    // The latest row in the mock is the cron fire (non-midnight UTC).
    expect(indicator.textContent).toMatch(/auto \(cron\)/i);
  });

  it('advances pagination and re-invokes the hook with page=2', async () => {
    await renderTab();
    await screen.findByText(/Page 1 of 2/);
    fireEvent.click(screen.getByRole('button', { name: /Next page/i }));
    await waitFor(() => expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument());
    expect(paginatedCalls.some((c) => c.page === 2)).toBe(true);
  });

  it('expands a run row to show per-ticker skipped_detail (FP-022)', async () => {
    await renderTab();
    const expanders = await screen.findAllByRole('button', { name: /Expand run details/i });
    fireEvent.click(expanders[0]);
    expect(await screen.findByTestId('run-detail-cron-run')).toBeInTheDocument();
    expect(screen.getByText(/Per-ticker skip detail/i)).toBeInTheDocument();
    expect(screen.getByText('AAA')).toBeInTheDocument();
    expect(screen.getByText('BBB')).toBeInTheDocument();
  });
});