import { ReactNode } from 'react';
import { Lightbulb } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface PhaseContextNoteProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Reusable info-alert wrapper for phase-context explainers.
 *
 * Every longshort page that shows a partial/in-progress capability must carry
 * a phase-context note stating (a) what the page shows, (b) what it does NOT
 * yet show, (c) which phase/FP completes it.
 *
 * Uses the design-system `--info` token (blue, informational). Registered in
 * component-inventory.md per Constitution Rule 6.
 */
export function PhaseContextNote({ title, children, className }: PhaseContextNoteProps) {
  return (
    <Alert
      className={cn(
        'border-info/50 text-info bg-info/5 dark:border-info dark:bg-info/10 [&>svg]:text-info',
        className,
      )}
    >
      <Lightbulb className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
