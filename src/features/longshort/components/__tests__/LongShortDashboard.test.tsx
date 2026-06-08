/**
 * FP-031 — LongShortDashboard tab structure + URL-sync tests.
 *
 * Uses a module-level mock of React Query's `useQuery` so the test exercises
 * tab composition and URL round-tripping without touching Supabase. All
 * mocks are typed — no `any` (Gate-4 lint).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LongShortDashboard } from '@/features/longshort/components/LongShortDashboard';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: vi.fn(() => {
      // Return loading state for all queries — enough to render tab structure
      return {
        isLoading: true,
        isError: false,
        data: null,
        error: null,
      };
    }),
  };
});

function renderAt(initialEntry: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/trading/longshort"
            element={
              <>
                <LongShortDashboard />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LongShortDashboard tabs (FP-031)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders both tab triggers', () => {
    renderAt('/trading/longshort');
    expect(screen.getByRole('tab', { name: 'Universe' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Reconciliation' })).toBeInTheDocument();
  });

  it('defaults to Universe tab', () => {
    renderAt('/trading/longshort');
    expect(screen.getByRole('tab', { name: 'Universe' })).toHaveAttribute('data-state', 'active');
    // Card titles inside the Universe tab should be visible
    expect(screen.getByText('Last Universe Refresh')).toBeInTheDocument();
    expect(screen.getByText('Universe Jobs')).toBeInTheDocument();
  });

  it('shows Reconciliation content when that tab is clicked', async () => {
    renderAt('/trading/longshort');
    const reconTab = screen.getByRole('tab', { name: 'Reconciliation' });
    fireEvent.pointerDown(reconTab, { button: 0, pointerType: 'mouse' });
    fireEvent.mouseDown(reconTab, { button: 0 });
    fireEvent.click(reconTab);
    await waitFor(() => {
      expect(screen.getByText('Latest Universe Cross-Check')).toBeVisible();
      expect(screen.getByText('Recent Reconciliation Events')).toBeVisible();
    });
  });

  it('selects Reconciliation tab from ?tab=reconciliation', () => {
    renderAt('/trading/longshort?tab=reconciliation');
    expect(screen.getByRole('tab', { name: 'Reconciliation' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Latest Universe Cross-Check')).toBeInTheDocument();
    expect(screen.queryByText('Last Universe Refresh')).not.toBeInTheDocument();
  });

  it('writes ?tab= to the URL when a non-default tab is activated', async () => {
    renderAt('/trading/longshort');
    const reconTab = screen.getByRole('tab', { name: 'Reconciliation' });
    fireEvent.pointerDown(reconTab, { button: 0, pointerType: 'mouse' });
    fireEvent.mouseDown(reconTab, { button: 0 });
    fireEvent.click(reconTab);
    await waitFor(() =>
      expect(screen.getByTestId('loc').textContent).toBe('/trading/longshort?tab=reconciliation'),
    );
  });

  it('strips ?tab= when returning to the default tab', async () => {
    renderAt('/trading/longshort?tab=reconciliation');
    const universeTab = screen.getByRole('tab', { name: 'Universe' });
    fireEvent.pointerDown(universeTab, { button: 0, pointerType: 'mouse' });
    fireEvent.mouseDown(universeTab, { button: 0 });
    fireEvent.click(universeTab);
    await waitFor(() =>
      expect(screen.getByTestId('loc').textContent).toBe('/trading/longshort'),
    );
  });
});
