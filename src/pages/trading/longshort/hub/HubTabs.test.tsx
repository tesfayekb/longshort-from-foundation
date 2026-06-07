/**
 * HubTabs — FP-023.1 component tests.
 *
 * Covers the URL-sync contract that the IA refactor depends on:
 *   - `?tab=<slug>` selects the matching tab on mount
 *   - missing / unknown `?tab=` falls back to `defaultTab`
 *   - clicking a non-default tab writes `?tab=` to the URL
 *   - clicking back to the default tab removes the param
 *
 * Pure component test — no Supabase, no React Query. Routed via
 * MemoryRouter so `useSearchParams` is real.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HubTabs } from './HubTabs';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderAt(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/x"
          element={
            <>
              <HubTabs
                defaultTab="a"
                tabs={[
                  { value: 'a', label: 'Alpha', content: <div>alpha-body</div> },
                  { value: 'b', label: 'Beta', content: <div>beta-body</div> },
                  { value: 'c', label: 'Gamma', content: <div>gamma-body</div> },
                ]}
              />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HubTabs (FP-023.1)', () => {
  it('selects the tab named by ?tab= on mount', () => {
    renderAt('/x?tab=b');
    expect(screen.getByText('beta-body')).toBeVisible();
  });

  it('falls back to defaultTab when ?tab= is missing', () => {
    renderAt('/x');
    expect(screen.getByText('alpha-body')).toBeVisible();
  });

  it('falls back to defaultTab when ?tab= is unknown', () => {
    renderAt('/x?tab=zzz');
    expect(screen.getByText('alpha-body')).toBeVisible();
  });

  it('writes ?tab= to the URL when a non-default tab is activated', async () => {
    const user = userEvent.setup();
    renderAt('/x');
    await user.click(screen.getByRole('tab', { name: 'Gamma' }));
    expect(screen.getByTestId('loc').textContent).toBe('/x?tab=c');
    expect(screen.getByText('gamma-body')).toBeVisible();
  });

  it('strips ?tab= when returning to the default tab', async () => {
    const user = userEvent.setup();
    renderAt('/x?tab=b');
    await user.click(screen.getByRole('tab', { name: 'Alpha' }));
    expect(screen.getByTestId('loc').textContent).toBe('/x');
  });
});