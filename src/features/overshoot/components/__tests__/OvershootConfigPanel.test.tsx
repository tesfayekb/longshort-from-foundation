/**
 * FP-069 W4.e (ACT-465.e) — OvershootConfigPanel tests.
 *
 * Covers:
 *   1. zod bounds — alloc must be in (0,1], margin in [1.00, 2.00].
 *      Both edges + one out-of-range value per field.
 *   2. Permission gating — Edit button hidden for view-only callers
 *      (fallback badge shown); visible when overshoot.manage is granted.
 *   3. Confirm flow — "Review changes" is disabled when the input is
 *      unchanged (dirty=false), enabled after edit, dialog moves to the
 *      confirmation step, back button returns to the form.
 *   4. RPC-failure surface — a rejected `supabase.rpc` keeps the dialog
 *      open and renders a destructive alert (no optimistic UI).
 *
 * Mocks: the Supabase client + the RequirePermission gate. All wiring
 * uses public exports from `OvershootConfigPanel.tsx`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  OvershootConfigEditDialog,
  overshootConfigEditSchema,
  type OvershootConfigRow,
  OvershootConfigPanel,
} from '../OvershootConfigPanel';

// --- Mocks ------------------------------------------------------------------
const rpcMock = vi.fn();
const selectOrderMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => {
  return {
    supabase: {
      rpc: (...args: unknown[]) => rpcMock(...args),
      from: () => ({
        select: () => ({
          order: () => selectOrderMock(),
        }),
      }),
    },
  };
});

// Default: manage permission granted (renders children). Individual tests
// override this for the view-only case.
let allowManage = true;
vi.mock('@/components/auth/RequirePermission', () => ({
  RequirePermission: ({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) =>
    allowManage ? <>{children}</> : <>{fallback ?? null}</>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// --- Fixtures ---------------------------------------------------------------
const baseRow: OvershootConfigRow = {
  account_key: 'overshoot-paper-primary',
  strategy_allocation_pct: 1.0,
  margin_multiplier: 1.0,
  updated_at: '2026-07-05T01:23:35.040389Z',
  updated_by: null,
};

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  rpcMock.mockReset();
  selectOrderMock.mockReset();
  allowManage = true;
});

// --- 1. Zod bounds ----------------------------------------------------------
describe('overshootConfigEditSchema (bounds mirror table CHECKs)', () => {
  it('accepts allocation in (0, 1] and margin in [1.00, 2.00]', () => {
    expect(overshootConfigEditSchema.safeParse({ strategy_allocation_pct: 0.01, margin_multiplier: 1.0 }).success).toBe(true);
    expect(overshootConfigEditSchema.safeParse({ strategy_allocation_pct: 1.0, margin_multiplier: 2.0 }).success).toBe(true);
    expect(overshootConfigEditSchema.safeParse({ strategy_allocation_pct: 0.5, margin_multiplier: 1.5 }).success).toBe(true);
  });
  it('rejects allocation ≤ 0 or > 1', () => {
    expect(overshootConfigEditSchema.safeParse({ strategy_allocation_pct: 0, margin_multiplier: 1.0 }).success).toBe(false);
    expect(overshootConfigEditSchema.safeParse({ strategy_allocation_pct: 1.01, margin_multiplier: 1.0 }).success).toBe(false);
    expect(overshootConfigEditSchema.safeParse({ strategy_allocation_pct: -0.1, margin_multiplier: 1.0 }).success).toBe(false);
  });
  it('rejects margin < 1.00 or > 2.00', () => {
    expect(overshootConfigEditSchema.safeParse({ strategy_allocation_pct: 0.5, margin_multiplier: 0.99 }).success).toBe(false);
    expect(overshootConfigEditSchema.safeParse({ strategy_allocation_pct: 0.5, margin_multiplier: 2.01 }).success).toBe(false);
  });
});

// --- 2. Permission gating ---------------------------------------------------
describe('OvershootConfigPanel — permission gating', () => {
  it('hides Edit button when overshoot.manage is absent', async () => {
    allowManage = false;
    selectOrderMock.mockResolvedValue({ data: [baseRow], error: null });
    renderWithClient(<OvershootConfigPanel />);
    await screen.findByText(/overshoot-paper-primary/);
    expect(screen.queryByRole('button', { name: /edit overshoot-paper-primary/i })).toBeNull();
    expect(screen.getByText(/view-only/i)).toBeInTheDocument();
  });
  it('shows Edit button when overshoot.manage is present', async () => {
    allowManage = true;
    selectOrderMock.mockResolvedValue({ data: [baseRow], error: null });
    renderWithClient(<OvershootConfigPanel />);
    await screen.findByText(/overshoot-paper-primary/);
    expect(screen.getByRole('button', { name: /edit overshoot-paper-primary/i })).toBeInTheDocument();
  });
});

// --- 3. Confirm flow --------------------------------------------------------
describe('OvershootConfigEditDialog — confirm flow', () => {
  it('disables Review when input is unchanged, enables after edit, then advances to confirm', async () => {
    render(
      <OvershootConfigEditDialog row={baseRow} onClose={vi.fn()} onSuccess={vi.fn()} />
    );
    const review = screen.getByRole('button', { name: /review changes/i });
    expect(review).toBeDisabled();

    const alloc = screen.getByLabelText(/strategy allocation/i);
    fireEvent.change(alloc, { target: { value: '0.75' } });
    expect(review).not.toBeDisabled();

    fireEvent.click(review);
    expect(await screen.findByText(/diff \(before → after\)/i)).toBeInTheDocument();
    expect(screen.getByText(/→ 75\.00%/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByRole('button', { name: /review changes/i })).toBeInTheDocument();
  });
});

// --- 4. RPC-failure surface -------------------------------------------------
describe('OvershootConfigEditDialog — RPC failure surfaces destructively', () => {
  it('keeps the dialog open and renders the error verbatim on RPC reject', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'overshoot_update_strategy_config requires overshoot.manage' },
    });

    const onSuccess = vi.fn();
    render(<OvershootConfigEditDialog row={baseRow} onClose={vi.fn()} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/strategy allocation/i), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: /review changes/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirm & submit/i }));

    await waitFor(() =>
      expect(screen.getByText(/RPC failed — no change applied/i)).toBeInTheDocument()
    );
    expect(
      screen.getByText(/overshoot_update_strategy_config requires overshoot\.manage/i)
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('closes on success and returns the RPC-provided row', async () => {
    const returned: OvershootConfigRow = {
      ...baseRow,
      strategy_allocation_pct: 0.5,
      margin_multiplier: 1.5,
      updated_at: '2026-07-05T02:00:00Z',
      updated_by: 'c0523131-8964-48c0-8a6a-76275acff631',
    };
    rpcMock.mockResolvedValue({ data: returned, error: null });

    const onSuccess = vi.fn();
    render(<OvershootConfigEditDialog row={baseRow} onClose={vi.fn()} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText(/strategy allocation/i), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText(/margin multiplier/i), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: /review changes/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirm & submit/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(returned));
  });
});