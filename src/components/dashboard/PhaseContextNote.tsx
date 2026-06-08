import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Lightbulb } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface PhaseContextNoteProps {
  title: string;
  children: ReactNode;
  className?: string;
  /**
   * FP-035 — collapsed-by-default (one line) is the institutional default.
   * Callers MAY force-open via `defaultOpen` if the body must always show.
   */
  defaultOpen?: boolean;
}

/**
 * Reusable info-callout for phase-context explainers.
 *
 * FP-035 — renders as a single-line collapsed header by default. The title
 * alone conveys the headline; the body (children) is revealed on click.
 *
 * Uses the design-system `--info` token (blue, informational) and the
 * Lightbulb glyph. Composed on the existing `Collapsible` primitive — no
 * new dependency. Registered in component-inventory.md per Constitution
 * Rule 6.
 */
export function PhaseContextNote({
  title,
  children,
  className,
  defaultOpen = false,
}: PhaseContextNoteProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        'rounded-lg border border-info/50 bg-info/5 text-info dark:border-info dark:bg-info/10',
        className,
      )}
      data-testid="phase-context-note"
    >
      <CollapsibleTrigger
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2"
      >
        <Lightbulb className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent
        className="px-4 pb-3 pl-10 text-sm [&_p]:leading-relaxed"
        data-testid="phase-context-body"
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}