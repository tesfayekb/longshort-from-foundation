/**
 * FP-030 — UniverseRefreshHistoryPage server-side pagination test.
 *
 * Pre-FP-030 the page hard-`.limit(50)`-ed and had no pagination. FP-030
 * converts it to `.range()` + `{count:'exact'}` via DataTable.
 *
 * No `any` — chainable supabase mock is interface-typed (ChainNode).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface Row {
  refresh_id: string;
  refresh_started_at: string;
  refresh_completed_at: string | null;
  as_of_date: string;
  quarter_label: string;
  total_constituents_raw: number | null;
  total_post_filters: number | null;
  total_eligible_long: number | null;
  total_eligible_short: number | null;
  outcome: 'completed' | 'failed' | 'partial' | 'circuit_breaker_open' | null;
  failure_reason: string | null;
};

const TOTAL = 30; // > DEFAULT_PAGE_SIZE (25) → 2 pages

function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    refresh_id: `r-${String(i).padStart(3, '0')}`,
    refresh_started_at: `2026-06-${String(((i % 28) + 1)).padStart(2, '0')}T00:00:00Z`,
    refresh_completed_at: `2026-06-${String(((i % 28) + 1)).padStart(2, '0')}T00:01:00Z`,
    as_of_date: `2026-06-${String(((i % 28) + 1)).padStart(2, '0')}`,
    quarter_label: '2026Q2',
    total_constituents_raw: 1000,
    total_post_filters: 900,
    total_eligible_long: 500,
    total_eligible_short: 400,
    outcome: 'completed',
    failure_reason: null,
  }));
}

const fixture = makeRows(TOTAL);

interface RangeCall {
  from: number;
  to: number;
}
const rangeCalls: RangeCall[] = [];

interface ChainNode {
  select: (cols: string, opts?: { count?: string }) => ChainNode;
  order: (col: string, opts?: { ascending?: boolean }) => ChainNode;
  range: (from: number, to: number) => Promise<{ data: Row[]; count: number; error: null }>;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(_table: string) {
      const node = {} as ChainNode;
      node.select = () => node;
      node.order = () => node;
      node.range = (from: number, to: number) => {
        rangeCalls.push({ from, to });
        return Promise.resolve({
          data: fixture.slice(from, to + 1),
          count: fixture.length,
          error: null,
        });
      };
      return node;
    },
  },
}));

async function renderPage() {
  const { default: Page } = await import('../UniverseRefreshHistoryPage');
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <Page />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function dataRowCount(): number {
  // Header row + data rows in the DataTable; subtract 1 for the header.
  return Math.max(0, screen.getAllByRole('row').length - 1);
}

describe('UniverseRefreshHistoryPage (FP-030 — paginated)', () => {
  beforeEach(() => {
    rangeCalls.length = 0;
    vi.clearAllMocks();
  });

  it('renders the first page with DEFAULT_PAGE_SIZE (25) rows from a 30-row fixture', async () => {
    await renderPage();
    await waitFor(() => expect(dataRowCount()).toBe(25));
    expect(rangeCalls[0]).toEqual({ from: 0, to: 24 });
    expect(screen.getByText(/30 refresh(es)? on record/)).toBeInTheDocument();
  });

  it('advances to page 2 with the remaining 5 rows', async () => {
    await renderPage();
    await waitFor(() => expect(dataRowCount()).toBe(25));
    fireEvent.click(screen.getByRole('button', { name: /Next page/i }));
    await waitFor(() => expect(dataRowCount()).toBe(5));
    expect(rangeCalls.some((c) => c.from === 25 && c.to === 49)).toBe(true);
  });
});