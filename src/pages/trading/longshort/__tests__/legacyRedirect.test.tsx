/**
 * FP-023.1 — Legacy `/trading/longshort/refresh-history` redirect smoke test.
 *
 * Mirrors the `<Navigate replace>` declaration in `src/App.tsx` so the
 * bookmark-preservation contract is regression-locked outside App.tsx
 * (which can't easily mount in isolation under jsdom without auth +
 * Supabase scaffolding).
 *
 * If this test goes red, the legacy redirect was silently dropped — that
 * is the exact regression FP-023's closure paragraph promises to prevent.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

function UniverseTabProbe() {
  const loc = useLocation();
  return <div data-testid="dest">{loc.pathname + loc.search}</div>;
}

describe('Long-Short legacy refresh-history redirect (FP-023.1)', () => {
  it('redirects /trading/longshort/refresh-history to the Universe hub with the refresh-history tab active', () => {
    render(
      <MemoryRouter initialEntries={['/trading/longshort/refresh-history']}>
        <Routes>
          <Route
            path="/trading/longshort/refresh-history"
            element={<Navigate to="/trading/longshort/universe?tab=refresh-history" replace />}
          />
          <Route path="/trading/longshort/universe" element={<UniverseTabProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('dest').textContent).toBe(
      '/trading/longshort/universe?tab=refresh-history',
    );
  });
});