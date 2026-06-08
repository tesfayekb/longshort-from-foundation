/**
 * FP-024 — SignalDistributionBand visual contract tests.
 *
 * Locks the two non-negotiable rules of the hero visual:
 *   1. Top-N highest-value tickers are accented as `long`, bottom-N as
 *      `short`, everything else as `middle` (semantic tokens only; no
 *      raw color classes asserted here — only the data-zone tag).
 *   2. Absent (is_present=false) tickers are NEVER plotted at 0 — they
 *      surface only as the out-of-band "N tickers absent" annotation.
 *      This is the DB CHECK invariant (value IS NULL ↔ is_present=false)
 *      made visible (INC-36 / §2-axiom-3 epistemic honesty).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignalDistributionBand } from '../SignalDistributionBand';
import type { SignalObservationRow } from '@/features/longshort/hooks/useSignalRankings';

function presentRow(ticker: string, value: number): SignalObservationRow {
  return { ticker, value, is_present: true, gics_sector: 'Technology' };
}

describe('SignalDistributionBand (FP-024)', () => {
  it('accents the top-N rows as long and the bottom-N rows as short', () => {
    // 10 rows, top-2 long, bottom-2 short, middle 6.
    const rows: SignalObservationRow[] = Array.from({ length: 10 }, (_, i) =>
      presentRow(`T${String(i).padStart(2, '0')}`, i - 4.5),
    );

    render(
      <SignalDistributionBand rows={rows} topN={2} bottomN={2} absentCount={0} />,
    );

    const marks = screen.getByRole('img').querySelectorAll('rect[data-ticker]');
    expect(marks.length).toBe(10);

    const longs = Array.from(marks).filter((m) => m.getAttribute('data-zone') === 'long');
    const shorts = Array.from(marks).filter((m) => m.getAttribute('data-zone') === 'short');
    const middles = Array.from(marks).filter((m) => m.getAttribute('data-zone') === 'middle');

    expect(longs.length).toBe(2);
    expect(shorts.length).toBe(2);
    expect(middles.length).toBe(6);

    // The two largest values must be the longs.
    const longTickers = longs.map((l) => l.getAttribute('data-ticker')).sort();
    expect(longTickers).toEqual(['T08', 'T09']);

    const shortTickers = shorts.map((s) => s.getAttribute('data-ticker')).sort();
    expect(shortTickers).toEqual(['T00', 'T01']);
  });

  it('does NOT plot absent tickers (renders them only as the out-of-band annotation)', () => {
    const rows: SignalObservationRow[] = [
      presentRow('AAA', 1.5),
      presentRow('BBB', -1.5),
      // is_present=false with value=null — the DB invariant shape.
      { ticker: 'GHOST', value: null, is_present: false, gics_sector: null },
    ];

    render(
      <SignalDistributionBand rows={rows} topN={1} bottomN={1} absentCount={1} />,
    );

    const marks = screen.getByRole('img').querySelectorAll('rect[data-ticker]');
    // Exactly 2 plotted — the absent ticker MUST NOT appear in the SVG.
    expect(marks.length).toBe(2);
    const plottedTickers = Array.from(marks).map((m) => m.getAttribute('data-ticker'));
    expect(plottedTickers).not.toContain('GHOST');

    // Annotation surfaces the absent count out-of-band.
    const absent = screen.getByTestId('signal-band-absent');
    expect(absent.textContent).toMatch(/1 tickers absent/);
    expect(absent.textContent).toMatch(/not plotted/);
  });

  it('renders an empty-state when there are no present rows (never invents a zero)', () => {
    render(<SignalDistributionBand rows={[]} topN={20} bottomN={20} absentCount={0} />);
    expect(screen.getByTestId('signal-band-empty')).toBeInTheDocument();
  });
});