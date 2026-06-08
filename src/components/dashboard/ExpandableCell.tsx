import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * FP-032 — One-line-with-expand cell.
 *
 * Standardizes the "collapsed by default, click chevron to expand" pattern
 * for verbose tabular cells (long notes, multi-line attribution). Built on
 * the existing `Collapsible` primitive — no new dependency.
 *
 * The `preview` is rendered as a tight single line (truncated). The
 * `children` are revealed on expand and may wrap freely.
 */
export interface ExpandableCellProps {
  preview: ReactNode;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function ExpandableCell({
  preview,
  children,
  className,
  ariaLabel = 'Toggle details',
}: ExpandableCellProps) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn('w-full', className)}>
      <div className="flex items-start gap-1">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0"
            aria-label={ariaLabel}
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        </CollapsibleTrigger>
        <span className="min-w-0 flex-1 truncate text-sm" data-testid="expandable-preview">
          {preview}
        </span>
      </div>
      <CollapsibleContent
        className="mt-1 pl-6 text-sm whitespace-pre-wrap break-words"
        data-testid="expandable-content"
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}