/**
 * FP-036 — ExclusionsTab tests.
 *
 * Module-level mock of the useHardExclusions hook trio so the test
 * exercises composition (PhaseContextNote, breadth stat, neutral-tone
 * rule badges, classification, ExpandableCell, server-pagination,
 * filters) without Supabase. No `any`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  HardExclusionRow,
  PaginatedHardExclusionsResult,
  HardExclusionBreadth,
} from '@/features/longshort/hooks/useHardExclusions';

function makeRow(overrides: Partial<HardExclusionRow> & { ticker: string }): HardExclusionRow {
  return {
    operator_id: '00000000-0000-0000-0000-000000000001',
    ticker: overrides.ticker,
    as_of_date: '2026-06-05',
    firing_rules: ['3.3d'],
    firing_reasons: {
      '3.3d': { applies_to: 'short', evidence: 'no locate record for ticker', reason: 'htb_no_locate' },
    },
    applied_at: '2026-06-05T11:03:06Z',
    refresh_id: 'r-1',
    ...overrides,
  };
}

// 30 HTB rows + 1 materially-excluding M&A row.
const allRows: HardExclusionRow[] = [
  ...Array.from({ length: 30 }, (_, i) =>
    makeRow({ ticker: `T${String(i).padStart(3, '0')}` }),
  ),
  makeRow({
    ticker: 'MNAX',
    firing_rules: ['3.3b'],
    firing_reasons: {
      '3.3b': { applies_to: 'both', reason: 'ma_target', evidence: 'pending deal' },
    },
  }),
];

interface PageCall {
  page: number;
  rule: string | null;
  tickerPrefix: string;
}
const calls: PageCall[] = [];

vi.mock('@/features/longshort/hooks/useHardExclusions', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/longshort/hooks/useHardExclusions')
  >('@/features/longshort/hooks/useHardExclusions');
  return {
    ...actual,
    useHardExclusionDates: (): {
      data: string[];
      isLoading: boolean;
      error: null;
    } => ({ data: ['2026-06-05', '2026-05-30'], isLoading: false, error: null }),
    useHardExclusionBreadth: (): {
      data: HardExclusionBreadth;
      isLoading: boolean;
      error: null;
    } => ({
      data: { htbCount: 30, totalExcluded: 31, universeSize: 32 },
      isLoading: false,
      error: null,
    }),
    usePaginatedHardExclusions: (params: {
      asOfDate: string | null;
      tickerPrefix: string;
      rule: string | null;
      page: number;
      pageSize: number;
    }): { data: PaginatedHardExclusionsResult; isLoading: boolean; error: null } => {
      calls.push({ page: params.page, rule: params.rule, tickerPrefix: params.tickerPrefix });
      let filtered = allRows;
      if (params.rule) {
        filtered = filtered.filter((r) => r.firing_rules.includes(params.rule!));
      }
      if (params.tickerPrefix.trim()) {
        const p = params.tickerPrefix.trim().toUpperCase();
        filtered = filtered.filter((r) => r.ticker.toUpperCase().startsWith(p));
      }
      const offset = (params.page - 1) * params.pageSize;
      return {
        data: {
          rows: filtered.slice(offset, offset + params.pageSize),
          total: filtered.length,
        },
        isLoading: false,
        error: null,
      };
    },
  };
});

async function renderTab() {
  const { default: ExclusionsTab } = await import('../ExclusionsTab');
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ExclusionsTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ExclusionsTab (FP-036)', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
  });

  it('renders a collapsed PhaseContextNote framing flags as screening (not failure)', async () => {
    await renderTab();
    const trigger = await screen.findByRole('button', {
      name: /Hard exclusions are §3\.3 screening flags/i,
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(
      screen.getByText(/screening coverage, not a failure list/i),
    ).toBeInTheDocument();
  });

  it('renders the §3.3d breadth stat with verify-borrow-feed cue when coverage is broad', async () => {
    await renderTab();
    const stat = await screen.findByTestId('exclusions-breadth-stat');
    expect(stat.textContent).toMatch(/§3\.3d coverage/i);
    expect(stat.textContent).toMatch(/30 of 32 tickers/);
    expect(stat.textContent).toMatch(/verify against the borrow feed/i);
  });

  it('renders §3.3 rule badges in neutral info tone (not destructive)', async () => {
    await renderTab();
    const badges = await screen.findAllByTestId('rule-badge-3.3d');
    expect(badges.length).toBeGreaterThan(0);
    // Variant=info maps to `bg-info`; destructive maps to `bg-destructive`.
    // The badge MUST NOT carry the destructive class.
    for (const b of badges) {
      expect(b.className).not.toMatch(/bg-destructive/);
      expect(b.className).toMatch(/bg-info/);
    }
  });

  it('classifies HTB-only as flag-only and M&A (applies_to=both) as materially excluding', async () => {
    await renderTab();
    // Filter to §3.3b so the M&A row is in the visible page.
    fireEvent.click(screen.getByRole('combobox', { name: /Rule/i }));
    const opt = await screen.findByRole('option', { name: /§3\.3b/i });
    fireEvent.click(opt);
    const matRow = await screen.findByTestId('exclusion-row-MNAX');
    expect(within(matRow).getByTestId('classification-material')).toBeInTheDocument();
  });

  it('expands a row to reveal firing_reasons jsonb detail', async () => {
    await renderTab();
    const row = await screen.findByTestId('exclusion-row-T000');
    const toggle = within(row).getByRole('button', { name: /Toggle firing reasons/i });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByText(/htb_no_locate/)).toBeInTheDocument();
    });
  });

  it('paginates server-side: clicking next re-invokes the hook with page=2', async () => {
    await renderTab();
    await screen.findByText(/Page 1 of 2/);
    fireEvent.click(screen.getByRole('button', { name: /Next page/i }));
    await waitFor(() => expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument());
    expect(calls.some((c) => c.page === 2)).toBe(true);
  });

  it('filter toolbar renders single-row shrink-to-fit (no flex-wrap) per FP-035', async () => {
    await renderTab();
    const toolbar = await screen.findByTestId('exclusions-filter-toolbar');
    expect(toolbar.className).not.toMatch(/flex-wrap/);
  });
});