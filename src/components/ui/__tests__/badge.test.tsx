/**
 * FP-033 — Badge variant lock.
 *
 * Verifies the locked vocabulary added in FP-033: success / warning /
 * info variants render their semantic background class (so consumers do
 * not need raw-color overrides). The pre-existing default / secondary /
 * destructive / outline variants are untouched.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Badge } from '../badge';

describe('Badge (FP-033 locked vocabulary)', () => {
  it.each([
    ['success', 'bg-success'],
    ['warning', 'bg-warning'],
    ['info', 'bg-info'],
  ] as const)('renders the %s variant with the %s background class', (variant, expected) => {
    const { container } = render(<Badge variant={variant}>x</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain(expected);
  });

  it('preserves the pre-existing destructive + outline variants', () => {
    const { container: d } = render(<Badge variant="destructive">x</Badge>);
    expect((d.firstElementChild as HTMLElement).className).toContain('bg-destructive');
    const { container: o } = render(<Badge variant="outline">x</Badge>);
    expect((o.firstElementChild as HTMLElement).className).toContain('text-foreground');
  });
});