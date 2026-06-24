/**
 * ACT-325 — ExecutionHub tab structure + SSR-diagnostic + equity empty-state
 * + ticker-attribution rendering. Mocks `useQuery` at the module level to
 * avoid touching supabase, matching the LongShortDashboard test pattern.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExecutionHubPage from '@/pages/trading/longshort/ExecutionHubPage';

// Mock ResizeObserver for recharts ResponsiveContainer in jsdom.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver =
  ResizeObserverMock;

type UseQueryResult = {
  isLoading: boolean;
  isError: boolean;
  data: unknown;
  error: null;
};

const queryStates = new Map<string, UseQueryResult>();

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: vi.fn(({ queryKey }: { queryKey: unknown[] }) => {
      const tag = String(queryKey[2] ?? '');
      const state = queryStates.get(tag);
      if (state) return state;
      return { isLoading: false, isError: false, data: [], error: null };
    }),
  };
});

function setQuery(tag: string, data: unknown) {
  queryStates.set(tag, { isLoading: false, isError: false, data, error: null });
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderAt(entry: string) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/trading/longshort/execution" element={<ExecutionHubPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryStates.clear();
  // Default empty results.
  setQuery('recent-rebalances', []);
  setQuery('recent-order-events', []);
  setQuery('equity-snapshots', []);
  setQuery('attribution-book', { asOf: null, rows: [] });
});

describe('ExecutionHubPage (ACT-325)', () => {
  it('renders the three tabs', () => {
    renderAt('/trading/longshort/execution');
    expect(screen.getByRole('tab', { name: 'Monitor' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Equity' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Attribution' })).toBeInTheDocument();
  });

  it('shows the Guardrail-2 SSR diagnostic when a rebalance fires shorts without an SSR check', () => {
    setQuery('recent-rebalances', [
      {
        id: 'a1',
        action: 'longshort.rebalance.full_rebalance.completed',
        created_at: new Date().toISOString(),
        metadata: {
          mode: 'full_rebalance',
          orders_placed: 14,
          orders_filled: 12,
          orders_rejected: 2,
          ssr_unavailable: true,
          shorts_placed_without_ssr_check: 3,
          shorts_placed_without_ssr_check_symbols: ['AAA', 'BBB', 'CCC'],
        },
        correlation_id: null,
      },
    ]);
    renderAt('/trading/longshort/execution');
    expect(
      screen.getByText(/SSR unavailable — 3 shorts placed without SSR check/i),
    ).toBeInTheDocument();
  });

  it('shows the equity empty-state copy (direction, not error) when no snapshots exist', () => {
    renderAt('/trading/longshort/execution?tab=equity');
    expect(
      screen.getByText(/curve begins after your first full rebalance/i),
    ).toBeInTheDocument();
  });

  it('renders the equity range toggles when snapshots are present', async () => {
    setQuery('equity-snapshots', [
      { ts: '2026-06-01T00:00:00Z', account_equity: 100000, long_mv: 60000, short_mv: 40000, gross: 100000, net: 20000, cash: 0, mode: 'full_rebalance', source: 'broker' },
      { ts: '2026-06-15T00:00:00Z', account_equity: 102000, long_mv: 61000, short_mv: 41000, gross: 102000, net: 20000, cash: 0, mode: 'full_rebalance', source: 'broker' },
    ]);
    renderAt('/trading/longshort/execution?tab=equity');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '1M' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ALL' })).toBeInTheDocument();
    });
    // Toggling range should not throw.
    fireEvent.click(screen.getByRole('button', { name: 'ALL' }));
    expect(screen.getByRole('button', { name: 'ALL' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('attribution tab prompts to select a ticker when no selection yet', () => {
    setQuery('attribution-book', {
      asOf: '2026-06-20',
      rows: [
        { ticker: 'AAA', long_rank: 1, short_rank: 50, long_score: 0.9, short_score: 0.1 },
      ],
    });
    renderAt('/trading/longshort/execution?tab=attribution');
    expect(screen.getByText(/Select a ticker to see its signal attribution/i)).toBeInTheDocument();
  });
});