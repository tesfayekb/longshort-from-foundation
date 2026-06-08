/**
 * PhaseContextNote render test.
 *
 * FP-035 — verifies the collapsible-one-line default: title is always
 * visible, body is hidden until the trigger is clicked, and the
 * `defaultOpen` prop forces the body open on mount.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhaseContextNote } from '../PhaseContextNote';

describe('PhaseContextNote (FP-035)', () => {
  it('renders the title with info styling and keeps the body collapsed by default', () => {
    render(
      <PhaseContextNote title="Note title">
        <p data-testid="body">Note body text</p>
      </PhaseContextNote>,
    );

    const root = screen.getByTestId('phase-context-note');
    expect(root).toBeInTheDocument();
    expect(root.className).toContain('border-info/50');
    expect(root.className).toContain('text-info');

    const trigger = screen.getByRole('button', { name: /Note title/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Body is not rendered (or hidden) while collapsed.
    expect(screen.queryByTestId('body')).not.toBeInTheDocument();
  });

  it('reveals the body when the trigger is clicked', () => {
    render(
      <PhaseContextNote title="Note title">
        <p data-testid="body">Note body text</p>
      </PhaseContextNote>,
    );
    const trigger = screen.getByRole('button', { name: /Note title/i });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('body')).toHaveTextContent('Note body text');
  });

  it('renders the body open on mount when defaultOpen is true', () => {
    render(
      <PhaseContextNote title="Note title" defaultOpen>
        <p data-testid="body">Note body text</p>
      </PhaseContextNote>,
    );
    expect(screen.getByRole('button', { name: /Note title/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });
});