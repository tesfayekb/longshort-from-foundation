/**
 * FP-030 — ReconciliationEventsPage server-side pagination test.
 *
 * Pre-FP-030 the page hard-`.limit(100)`-ed with no pagination. FP-030
 * converts it to `.range()` + `{count:'exact'}` via DataTable.
 *
 * No `any` — chainable supabase mock is interface-typed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface Row {
  event_id: string;
  ts: string;
  engine_version: string;
  call_name: string;
  tier: string;
  symbol: string | null;
  outcome: string;
  failure_action: string | null;
  notes: string | null;
  resolved_at: string | null;
};

function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    event_id: `e-${String(i).padStart(3, '0')}`,
    ts: `2026-06-${String(((i % 28) + 1)).padStart(2, '0')}T00:00:00Z`,
    engine_version: 'v1.0.0',
    call_name: `call_${i}`,
    tier: 'standard',
    symbol: 'AAPL',
    outcome: 'false_positive_within_tolerance',
    failure_action: null,
    notes: null,
    resolved_at: null,
  }));
}

const TOTAL = 30; // > DEFAULT_PAGE_SIZE (25)
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
  const { default: Page } = await import('../ReconciliationEventsPage');
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
  return Math.max(0, screen.getAllByRole('row').length - 1);
}

describe('ReconciliationEventsPage (FP-030 — paginated)', () => {
  beforeEach(() => {
    rangeCalls.length = 0;
    vi.clearAllMocks();
  });

  it('renders the first page with DEFAULT_PAGE_SIZE (25) rows from a 30-row fixture', async () => {
    await renderPage();
    await waitFor(() => expect(dataRowCount()).toBe(25));
    expect(rangeCalls[0]).toEqual({ from: 0, to: 24 });
    expect(screen.getByText(/30 events? on record/)).toBeInTheDocument();
  });

  it('advances to page 2 with the remaining 5 rows', async () => {
    await renderPage();
    await waitFor(() => expect(dataRowCount()).toBe(25));
    fireEvent.click(screen.getByRole('button', { name: /Next page/i }));
    await waitFor(() => expect(dataRowCount()).toBe(5));
    expect(rangeCalls.some((c) => c.from === 25 && c.to === 49)).toBe(true);
  });
});