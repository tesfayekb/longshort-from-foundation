/**
 * PhaseContextNote render test.
 *
 * Verifies the component renders title + body with info-variant styling.
 * No mocks needed — pure presentational component.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhaseContextNote } from '../PhaseContextNote';

describe('PhaseContextNote', () => {
  it('renders title and body with info styling', () => {
    render(
      <PhaseContextNote title="Note title">
        <p data-testid="body">Note body text</p>
      </PhaseContextNote>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Note title')).toBeInTheDocument();
    expect(screen.getByTestId('body')).toHaveTextContent('Note body text');

    const alert = screen.getByRole('alert');
    // Info-variant class assertions — the component applies border-info/50,
    // bg-info/5 (light) or dark:bg-info/10, and [&>svg]:text-info.
    expect(alert.className).toContain('border-info/50');
    expect(alert.className).toContain('text-info');
  });
});
