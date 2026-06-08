/**
 * FP-033 — TradingStatusStrip render contract.
 *
 * Mocks the `useTradingStatus` hook so the test exercises the strip's
 * composition (4 indicators, graceful "—" fallback, badge variants)
 * without touching Supabase. No `any` — return type is the exported
 * `TradingStatusSnapshot`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { TradingStatusSnapshot } from '@/features/longshort/hooks/useTradingStatus';

let mockSnapshot: TradingStatusSnapshot | null = null;
let mockLoading = false;

vi.mock('@/features/longshort/hooks/useTradingStatus', async () => {
  const actual = await vi.importActual<typeof import('@/features/longshort/hooks/useTradingStatus')>(
    '@/features/longshort/hooks/useTradingStatus',
  );
  return {
    ...actual,
    useTradingStatus: (): {
      data: TradingStatusSnapshot | undefined;
      isLoading: boolean;
    } => ({
      data: mockSnapshot ?? undefined,
      isLoading: mockLoading,
    }),
  };
});

async function renderStrip() {
  const { TradingStatusStrip } = await import('../TradingStatusStrip');
  return render(
    <TooltipProvider>
      <TradingStatusStrip />
    </TooltipProvider>,
  );
}

describe('TradingStatusStrip (FP-033)', () => {
  beforeEach(() => {
    mockSnapshot = null;
    mockLoading = false;
    vi.clearAllMocks();
  });

  it('renders all four indicators with "—" placeholders when no data is available', async () => {
    mockSnapshot = { lastFire: null, universe: null, breaker: null, reconciliation: null };
    await renderStrip();
    expect(screen.getByTestId('trading-status-strip')).toBeInTheDocument();
    expect(screen.getByTestId('status-last-fire')).toBeInTheDocument();
    expect(screen.getByTestId('status-universe')).toBeInTheDocument();
    expect(screen.getByTestId('status-breaker')).toBeInTheDocument();
    expect(screen.getByTestId('status-open-reconciliation')).toBeInTheDocument();
    // Each placeholder badge renders the em-dash.
    expect(screen.getAllByText('—').length).toBe(4);
  });

  it('renders the auto-fire + fresh-universe + armed-breaker + zero-open happy path', async () => {
    mockSnapshot = {
      lastFire: { completed_at: '2026-06-08T20:05:13Z' }, // cron (non-midnight)
      universe: { completed_at: new Date().toISOString(), outcome: 'completed' },
      breaker: { state: 'active' },
      reconciliation: { openCount: 0 },
    };
    await renderStrip();
    expect(within(screen.getByTestId('status-last-fire')).getByText('auto')).toBeInTheDocument();
    expect(within(screen.getByTestId('status-universe')).getByText('fresh')).toBeInTheDocument();
    expect(within(screen.getByTestId('status-breaker')).getByText('armed')).toBeInTheDocument();
    expect(within(screen.getByTestId('status-open-reconciliation')).getByText('none')).toBeInTheDocument();
  });

  it('flags tripped breaker, stale universe, manual fire, and open reconciliations', async () => {
    const oldTs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48h old
    mockSnapshot = {
      lastFire: { completed_at: '2026-06-05T00:00:00Z' }, // midnight → manual
      universe: { completed_at: oldTs, outcome: 'failed' },
      breaker: { state: 'hard_paused' },
      reconciliation: { openCount: 7 },
    };
    await renderStrip();
    expect(within(screen.getByTestId('status-last-fire')).getByText('manual')).toBeInTheDocument();
    expect(within(screen.getByTestId('status-universe')).getByText('stale')).toBeInTheDocument();
    expect(within(screen.getByTestId('status-breaker')).getByText('tripped')).toBeInTheDocument();
    expect(within(screen.getByTestId('status-open-reconciliation')).getByText('7 open')).toBeInTheDocument();
  });

  it('exposes accessible tooltip triggers on every indicator (FP-035)', async () => {
    mockSnapshot = {
      lastFire: { completed_at: '2026-06-08T20:05:13Z' },
      universe: { completed_at: new Date().toISOString(), outcome: 'completed' },
      breaker: { state: 'active' },
      reconciliation: { openCount: 3 },
    };
    await renderStrip();
    for (const id of [
      'status-last-fire',
      'status-universe',
      'status-breaker',
      'status-open-reconciliation',
    ]) {
      const el = screen.getByTestId(id);
      // Radix Tooltip's asChild trigger forwards the data-state attr to the child.
      expect(el).toHaveAttribute('data-state');
      expect(el.className).toContain('cursor-help');
    }
  });
});