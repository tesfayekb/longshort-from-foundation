/**
 * FP-031 — TradingDashboard title verification.
 *
 * Simple static render test: the top-level /trading page now renders
 * "Strategies" instead of "Overview" or "Trading".
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TradingDashboard from '../TradingDashboard';

describe('TradingDashboard (FP-031)', () => {
  it('renders "Strategies" as the page heading', () => {
    render(<TradingDashboard />);
    expect(screen.getByRole('heading', { name: 'Strategies' })).toBeInTheDocument();
  });

  it('retains the honest empty-state message', () => {
    render(<TradingDashboard />);
    expect(screen.getByText(/No strategies enabled/)).toBeInTheDocument();
    expect(screen.getByText(/Strategy modules will appear here as they are enabled/)).toBeInTheDocument();
  });
});
