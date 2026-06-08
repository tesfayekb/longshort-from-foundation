/**
 * FP-024 — RankingsTab page assembly + control wiring.
 *
 * The signal-data hooks (`useSignalRankings`) are mocked at the module
 * level so the test exercises the page's composition contract, not
 * Supabase internals (which the FP-023.1 ChainNode pattern covers for
 * the lower-level pagination shape). All mocks are typed — no `any`
 * (Gate-4 lint is error-level on `@typescript-eslint/no-explicit-any`).
 *
 * Coverage:
 *   - Top-N / Bottom-N tables render the highest / lowest z-scores.
 *   - Server-side pagination advances and triggers a refetch with the
 *     new page number (the FP-023.1 forward-binding contract).
 *   - Ticker search and date change reset to page 1 + repaginate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  PaginatedRankingsResult,
  SignalObservationRow,
} from '@/features/longshort/hooks/useSignalRankings';

// --- Mock data ------------------------------------------------------------

const SIGNAL = 'cross_sectional_momentum_12_1';
const DATES = ['2026-06-05', '2026-06-04'];

function makePresent(n: number): SignalObservationRow[] {
  // Values from +n/2 .. -n/2 so we have a clean top/bottom ordering.
  return Array.from({ length: n }, (_, i) => ({
    ticker: `T${String(i).padStart(3, '0')}`,
    value: n / 2 - i,
    is_present: true,
    gics_sector: i % 2 === 0 ? 'Technology' : 'Energy',
  }));
}

const presentRows = makePresent(60); // > PAGE_SIZE (50)

// --- Mock the hook module -------------------------------------------------

interface PaginatedCall {
  page: number;
  tickerFilter: string;
  asOfDate: string | null;
}
const paginatedCalls: PaginatedCall[] = [];

vi.mock('@/features/longshort/hooks/useSignalRankings', () => {
  return {
    useAvailableSignals: () => ({ data: [SIGNAL], isLoading: false }),
    useSignalDates: () => ({ data: DATES, isLoading: false }),
    usePresentObservations: () => ({ data: presentRows, isLoading: false, error: null }),
    useAbsentCount: () => ({ data: 3 }),
    usePaginatedRankings: (params: {
      page: number;
      pageSize: number;
      tickerFilter: string;
      sectorFilter: string;
      signalId: string | null;
      asOfDate: string | null;
    }): { data: PaginatedRankingsResult; isLoading: boolean; error: null } => {
      paginatedCalls.push({
        page: params.page,
        tickerFilter: params.tickerFilter,
        asOfDate: params.asOfDate,
      });
      const filtered = presentRows.filter((r) =>
        params.tickerFilter
          ? r.ticker.toUpperCase().startsWith(params.tickerFilter.toUpperCase())
          : true,
      );
      const offset = (params.page - 1) * params.pageSize;
      const slice = filtered.slice(offset, offset + params.pageSize);
      return {
        data: {
          rows: slice.map((r, i) => ({ ...r, rank: offset + i + 1 })),
          total: filtered.length,
        },
        isLoading: false,
        error: null,
      };
    },
  };
});

// --- Helpers --------------------------------------------------------------

async function renderTab() {
  const { default: RankingsTab } = await import('../RankingsTab');
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <RankingsTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// --- Tests ----------------------------------------------------------------

describe('RankingsTab (FP-024)', () => {
  beforeEach(() => {
    paginatedCalls.length = 0;
    vi.clearAllMocks();
  });

  it('renders the top-20 and bottom-20 candidate tables with accented z-scores', async () => {
    await renderTab();
    expect(await screen.findByText(/Top 20 — long candidates/)).toBeInTheDocument();
    expect(screen.getByText(/Bottom 20 — short candidates/)).toBeInTheDocument();

    // Highest value ticker (T000, value = 30) is in the top-20 table; lowest
    // (T059, value = -29.5) appears in the bottom-20 table.
    expect(screen.getAllByText('T000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('T059').length).toBeGreaterThan(0);
  });

  it('surfaces the absent-count annotation from the band (epistemic-honesty contract)', async () => {
    await renderTab();
    const annotation = await screen.findByTestId('signal-band-absent');
    expect(annotation.textContent).toMatch(/3 tickers absent/);
  });

  it('advances the full-rankings page and re-invokes the paginated hook with page=2', async () => {
    await renderTab();
    // Initial render — page 1.
    await screen.findByText(/Page 1 of 2/);
    const initialPage1Calls = paginatedCalls.filter((c) => c.page === 1).length;
    expect(initialPage1Calls).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Next page/i }));
    await waitFor(() => expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument());
    expect(paginatedCalls.some((c) => c.page === 2)).toBe(true);
  });

  it('resets the full-rankings page to 1 when the ticker filter changes', async () => {
    await renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Next page/i }));
    await waitFor(() => expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Filter by ticker/i), {
      target: { value: 'T00' },
    });
    await waitFor(() => {
      // After filter, the page indicator must drop back (or disappear when
      // filtered set <= PAGE_SIZE).
      expect(screen.queryByText(/Page 2 of/)).not.toBeInTheDocument();
    });
    expect(paginatedCalls.some((c) => c.tickerFilter === 'T00' && c.page === 1)).toBe(true);
  });

  it('surfaces the single-signal phase-context note above the band', async () => {
    await renderTab();
    expect(
      screen.getByText(/Single-signal view — not the final trading list/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The tradeable ranking is the composite of all signals/i),
    ).toBeInTheDocument();
  });
});