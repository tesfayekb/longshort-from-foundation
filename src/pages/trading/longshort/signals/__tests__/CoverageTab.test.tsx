/**
 * FP-029 — CoverageTab tests.
 *
 * Module-level mock of usePaginatedEligibilityCoverage so the test
 * exercises composition (PhaseContextNote, §3.3 boolean badges,
 * complete-badge logic, server-pagination) without Supabase. No `any`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  EligibilityCoverageRow,
  PaginatedCoverageResult,
} from '@/features/longshort/hooks/useEligibilityCoverage';

function makeRow(
  overrides: Partial<EligibilityCoverageRow> & { as_of_date: string },
): EligibilityCoverageRow {
  return {
    operator_id: '00000000-0000-0000-0000-000000000001',
    as_of_date: overrides.as_of_date,
    covers_3_3a: false,
    covers_3_3b: false,
    covers_3_3c: false,
    covers_3_3d: true,
    covers_3_3e: false,
    written_at: '2026-06-03T08:14:44Z',
    written_by: null,
    ...overrides,
  };
}

// 30 backfill rows + the two live May rows = enough to force pagination.
const allRows: EligibilityCoverageRow[] = [
  makeRow({ as_of_date: '2026-05-30' }),
  makeRow({ as_of_date: '2026-05-28' }),
  ...Array.from({ length: 30 }, (_, i) =>
    makeRow({ as_of_date: `2026-05-${String(27 - i).padStart(2, '0')}` }),
  ),
];

interface PageCall {
  page: number;
}
const calls: PageCall[] = [];

vi.mock('@/features/longshort/hooks/useEligibilityCoverage', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/longshort/hooks/useEligibilityCoverage')
  >('@/features/longshort/hooks/useEligibilityCoverage');
  return {
    ...actual,
    usePaginatedEligibilityCoverage: (params: {
      page: number;
      pageSize: number;
    }): { data: PaginatedCoverageResult; isLoading: boolean; error: null } => {
      calls.push({ page: params.page });
      const offset = (params.page - 1) * params.pageSize;
      return {
        data: {
          rows: allRows.slice(offset, offset + params.pageSize),
          total: allRows.length,
        },
        isLoading: false,
        error: null,
      };
    },
  };
});

async function renderTab() {
  const { default: CoverageTab } = await import('../CoverageTab');
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <CoverageTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CoverageTab (FP-029)', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
  });

  it('renders the phase-context note citing DW-063 / DEC-038.1 (FP-035 — collapsed by default)', async () => {
    await renderTab();
    const trigger = await screen.findByRole('button', {
      name: /Per-date §3.3 eligibility screening coverage/i,
    });
    // Collapsed: body (with the DW-063 citation) is hidden.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/DW-063 \/ DEC-038\.1/i)).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByText(/DW-063 \/ DEC-038\.1/i)).toBeInTheDocument();
  });

  it('renders all five §3.3 sub-rule columns with codes', async () => {
    await renderTab();
    for (const code of ['§3.3a', '§3.3b', '§3.3c', '§3.3d', '§3.3e']) {
      expect(await screen.findAllByText(code)).not.toHaveLength(0);
    }
  });

  it('renders d as wired and a/b/c/e as deferred for the today-truth row', async () => {
    await renderTab();
    const row = await screen.findByTestId('coverage-row-2026-05-30');
    const wired = row.querySelectorAll('[data-testid="sub-rule-wired"]');
    const deferred = row.querySelectorAll('[data-testid="sub-rule-deferred"]');
    expect(wired.length).toBe(1);
    expect(deferred.length).toBe(4);
  });

  it('renders an "incomplete" badge when not all sub-rules are wired', async () => {
    await renderTab();
    const row = await screen.findByTestId('coverage-row-2026-05-30');
    expect(row.textContent).toMatch(/incomplete/i);
    expect(row.textContent).not.toMatch(/\bcomplete\b(?!\s*ness)/i);
  });

  it('paginates server-side: clicking next re-invokes the hook with page=2', async () => {
    await renderTab();
    await screen.findByText(/Page 1 of 2/);
    fireEvent.click(screen.getByRole('button', { name: /Next page/i }));
    await waitFor(() => expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument());
    expect(calls.some((c) => c.page === 2)).toBe(true);
  });
});