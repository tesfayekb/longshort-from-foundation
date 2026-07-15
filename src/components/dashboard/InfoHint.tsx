/**
 * InfoHint — small info-icon affordance that hosts long explanatory
 * prose in a hover/focus tooltip. ACT-525 R2 (b) content-standard
 * primitive.
 *
 * Content rule this primitive enforces (structurally, by being tiny):
 * KPI/stat tiles carry a SHORT status label; the multi-sentence
 * governance / typed-absence / next-action prose lives behind the
 * hint, never inline in the tile body. Full text also stays in the
 * relevant detail views — the hint is a convenience, not a hiding
 * place.
 *
 * Keyboard: the button is focusable so tooltip fires on tab/focus
 * as well as hover — no info stranded behind pointer-only surfaces.
 */
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface InfoHintProps {
  /** Full explanatory content — the sentence(s) that used to be inline. */
  children: ReactNode;
  /** ARIA label for the trigger. Defaults to "More information". */
  label?: string;
  /** Optional class overrides for the trigger. */
  className?: string;
  /** Tooltip max-width class; long prose reads best around 320-360px. */
  contentClassName?: string;
}

export function InfoHint({
  children,
  label = 'More information',
  className,
  contentClassName,
}: InfoHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring',
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent
        className={cn('max-w-xs text-xs leading-snug', contentClassName)}
        sideOffset={6}
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * TruncatedMono — small helper for long technical strings (function
 * names, SQL/bracket refs, correlation ids) that must stay legible
 * inside narrow tiles. Renders in mono, `truncate` at container
 * width, with a native `title` so the full string is still available
 * on hover. Native title (not tooltip) is deliberate: these are
 * inline atoms rendered inside lists — a full radix tooltip per
 * atom would be noisy.
 */
export function TruncatedMono({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <span
      className={cn('font-mono truncate inline-block max-w-full align-bottom', className)}
      title={children}
    >
      {children}
    </span>
  );
}