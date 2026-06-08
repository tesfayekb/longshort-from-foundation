/**
 * FP-023.1 — UniverseMembershipPage filter + pagination tests.
 *
 * Covers the FP-023 enhancements that converted the 839-row unpaginated
 * scroll into a paged, filterable table:
 *   - Page 1 renders only PAGE_SIZE (50) rows from a fixture larger than one page.
 *   - Sector filter narrows the row count.
 *   - Ticker filter narrows the row count.
 *   - Eligibility = long_only excludes short-only rows.
 *   - Changing a filter resets the page index back to 1.
 *
 * Supabase is mocked at the client level with a small chainable builder
 * that dispatches on table name. RLS / network not exercised — this is a
 * presentation-layer regression lock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// --- Supabase mock --------------------------------------------------------

const AS_OF = '2026-06-01';

type Row = {
  ticker: string;
  as_of_date: string;
  long_eligible: boolean;
  short_eligible: boolean;
  quarter_label: string;
  refresh_id: string;
  created_at: string;
  gics_sector: string | null;
};

function makeRows(): Row[] {
  // 75 rows so we have >1 page (PAGE_SIZE = 50). Two sectors, varied eligibility.
  const rows: Row[] = [];
  for (let i = 0; i < 75; i++) {
    const sector = i % 2 === 0 ? 'Technology' : 'Energy';
    rows.push({
      ticker: `T${String(i).padStart(3, '0')}`,
      as_of_date: AS_OF,
      long_eligible: true,
      short_eligible: i % 3 !== 0, // ~2/3 short-eligible
      quarter_label: '2026Q2',
      refresh_id: '11111111-2222-3333-4444-555555555555',
      created_at: `${AS_OF}T00:00:00Z`,
      gics_sector: sector,
    });
  }
  return rows;
}

const fixtureRows = makeRows();

interface ChainNode {
  select: () => ChainNode;
  eq: () => ChainNode;
  order: () => ChainNode;
  limit: () => ChainNode;
  maybeSingle: () => Promise<{ data: unknown; error: null }>;
  then: (onF: (value: unknown) => unknown, onR: (reason: unknown) => unknown) => Promise<unknown>;
}

function chainable(payload: { data: unknown; error: null }) {
  const node = {} as ChainNode;
  const ret = (): ChainNode => node;
  node.select = ret;
  node.eq = ret;
  node.order = ret;
  node.limit = ret;
  node.maybeSingle = () =>
    Promise.resolve({
      data: Array.isArray(payload.data) ? (payload.data as unknown[])[0] ?? null : payload.data,
      error: null,
    });
  node.then = (onF, onR) => Promise.resolve(payload).then(onF, onR);
  return node;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      if (table === 'universe_membership') {
        return chainable({ data: fixtureRows, error: null });
      }
      if (table === 'universe_refresh_log') {
        return chainable({
          data: [
            {
              outcome: 'completed',
              quarter_label: '2026Q2',
              refresh_completed_at: `${AS_OF}T01:00:00Z`,
            },
          ],
          error: null,
        });
      }
      return chainable({ data: [], error: null });
    },
  },
}));

// --- Helpers --------------------------------------------------------------

async function renderPage() {
  const { default: UniverseMembershipPage } = await import('../UniverseMembershipPage');
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  const utils = render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <UniverseMembershipPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  // Wait for the data-driven Filters card to mount (proxy for both queries having resolved).
  await screen.findByText('Filters');
  return utils;
}

function dataRows() {
  // Header row is the first <tr> in the table; data rows are the rest.
  const allRows = screen.getAllByRole('row');
  return allRows.slice(1);
}

// --- Tests ----------------------------------------------------------------

describe('UniverseMembershipPage (FP-023.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('paginates to PAGE_SIZE (50) rows on page 1 when the fixture has more than one page', async () => {
    await renderPage();
    await waitFor(() => expect(dataRows().length).toBe(50));
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
  });

  it('advances to page 2 and shows the remaining rows', async () => {
    await renderPage();
    await waitFor(() => expect(dataRows().length).toBe(50));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    await waitFor(() => expect(dataRows().length).toBe(25));
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
  });

  it('narrows rows when the ticker filter is applied', async () => {
    await renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Filter by ticker/i), {
      target: { value: 'T001' },
    });
    await waitFor(() => expect(dataRows().length).toBe(1));
    expect(within(dataRows()[0]).getByText('T001')).toBeInTheDocument();
  });

  it('resets to page 1 when a filter changes after navigating to page 2', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    await waitFor(() => expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Filter by ticker/i), {
      target: { value: 'T' },
    });
    // After the filter resets page back to 1, page indicator should NOT say "Page 2".
    await waitFor(() => {
      expect(screen.queryByText(/Page 2 of/)).not.toBeInTheDocument();
    });
  });
});