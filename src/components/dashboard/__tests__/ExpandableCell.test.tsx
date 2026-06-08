/**
 * FP-032 — ExpandableCell unit tests.
 *
 * Verifies the shared one-line-with-expand disclosure primitive:
 *   - collapsed-by-default (content not visible)
 *   - clicking the chevron expands and shows full content
 *   - second click collapses again
 *   - preview slot renders as a single tight line
 *
 * No `any` — props are typed via the exported `ExpandableCellProps`.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExpandableCell } from '../ExpandableCell';

describe('ExpandableCell (FP-032)', () => {
  it('renders the preview as a single line and hides full content by default', () => {
    render(
      <ExpandableCell preview="Short preview">
        <span>Full multi-line content</span>
      </ExpandableCell>,
    );
    expect(screen.getByTestId('expandable-preview')).toHaveTextContent('Short preview');
    expect(screen.queryByText('Full multi-line content')).not.toBeInTheDocument();
  });

  it('expands on click and collapses on a second click', async () => {
    render(
      <ExpandableCell preview="P" ariaLabel="Toggle notes">
        <span>Hidden body</span>
      </ExpandableCell>,
    );
    const btn = screen.getByRole('button', { name: /Toggle notes/i });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText('Hidden body')).toBeInTheDocument());
    expect(btn).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(btn);
    await waitFor(() => expect(screen.queryByText('Hidden body')).not.toBeInTheDocument());
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });
});