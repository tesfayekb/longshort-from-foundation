/**
 * SideFilterControl — FP-068 W2 (ACT-439).
 *
 * All / Long / Short segmented filter. Drives both the row list AND the
 * footer totals in the positions tabs.
 */
import { Button } from '@/components/ui/button';
import type { SideFilter } from './format';
// Lifted to src/components/trading/portfolio/ (ACT-491, FP-069 W4.h+):
// shared platform-tier portfolio primitives consumed by both the longshort
// and overshoot Portfolio surfaces. Neutral home — no strategy in path.

interface Props {
  value: SideFilter;
  onChange: (v: SideFilter) => void;
}

const OPTS: Array<{ value: SideFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
];

export function SideFilterControl({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden">
      {OPTS.map((o) => (
        <Button
          key={o.value}
          type="button"
          variant={value === o.value ? 'default' : 'ghost'}
          size="sm"
          className="rounded-none border-0 h-8 px-3 text-xs"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}