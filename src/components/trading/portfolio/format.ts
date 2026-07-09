/**
 * Shared portfolio formatting + totals helpers — FP-068 W2 (ACT-439).
 *
 * Lifted from PortfolioBrokerTab / PortfolioInternalTab so the footer
 * totals and both tabs share a single source of truth. Typed-absence
 * honesty: null P&L is EXCLUDED from sums (never fabricated to 0).
 */
import type { ReactNode } from 'react';
import { createElement } from 'react';

export const fmtUsd = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export const fmtPrice = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `$${v.toFixed(2)}`;

export function PnlCell({ v }: { v: number | null | undefined }): ReactNode {
  if (v === null || v === undefined || !Number.isFinite(v)) {
    return createElement('span', { className: 'text-muted-foreground' }, '—');
  }
  const cls =
    v > 0
      ? 'text-green-600 dark:text-green-500'
      : v < 0
        ? 'text-red-600 dark:text-red-500'
        : 'text-muted-foreground';
  return createElement('span', { className: `font-mono ${cls}` }, fmtUsd(v));
}

export type SideFilter = 'all' | 'long' | 'short';

/** Sum finite numbers; null/undefined/NaN are EXCLUDED (typed-absence).
 *  Returns { sum, priced, total } so callers can flag "(n of m priced)". */
export function sumPriced(values: Array<number | null | undefined>): {
  sum: number | null;
  priced: number;
  total: number;
} {
  let sum = 0;
  let priced = 0;
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    sum += v;
    priced += 1;
  }
  return { sum: priced === 0 ? null : sum, priced, total: values.length };
}