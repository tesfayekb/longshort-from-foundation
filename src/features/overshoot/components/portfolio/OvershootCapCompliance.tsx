/**
 * OvershootCapCompliance — small console affordance surfacing the
 * INC-96 ratified vs actual per-side allocation posture in one line.
 *
 * Rationale: the operator seeing 50 open lots with no on-screen
 * explanation of the ratified-vs-actual gap reads as a defect. The
 * INC-96 carry is known, ruled, and dated (converging via T+10 exits
 * from 07-22) — the console should say so, plainly, wherever the
 * DEPLOYED posture is rendered.
 *
 * Ratified pct constants MIRROR the engine values verbatim
 * (supabase/functions/_shared/overshoot-execution/sizing.ts):
 *   OVERSHOOT_SIDE_ALLOCATION_PCT_LONG  = 0.90
 *   OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT = 0.10
 * Per the FP-069 W4.g display-truth rule, console thresholds cite
 * their engine constant — never restate values independently.
 *
 * Pure display: no fetches, no writes, no live-price consumption.
 * Callers pass in `sizingBaseUsd` (equity × strategy_allocation_pct ×
 * margin_multiplier) and the current per-side MV (broker mark preferred,
 * cost-basis fallback — same basis rules the allocation-cap module
 * applies in the money path).
 */
import { Badge } from '@/components/ui/badge';
import { InfoHint } from '@/components/dashboard/InfoHint';

// Engine-mirrored ratified per-side allocation pcts.
// Source of truth: OVERSHOOT_SIDE_ALLOCATION_PCT_{LONG,SHORT} in
// supabase/functions/_shared/overshoot-execution/sizing.ts.
export const OVERSHOOT_SIDE_ALLOCATION_PCT_LONG = 0.90;
export const OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT = 0.10;

// INC-96 convergence note: existing over-cap carry unwinds naturally via
// T+10 exits from the first over-cap entry date (2026-07-22). The engine
// gate (evaluateAllocationCap) refuses NEW cap-breaching entries; the
// carry is bounded above and dated below.
const INC96_SHORT = 'INC-96 carry';

export interface OvershootCapComplianceProps {
  /** equity × strategy_allocation_pct × margin_multiplier (USD). */
  sizingBaseUsd: number | null;
  /** Aggregate absolute LONG book MV, USD. */
  longMvUsd: number | null;
  /** Aggregate absolute SHORT book MV, USD. */
  shortMvUsd: number | null;
  /** Optional short label prefix (e.g. "Cap:"); default omitted. */
  labelPrefix?: string;
  className?: string;
}

function fmtK(usd: number): string {
  const k = usd / 1_000;
  if (Math.abs(k) >= 100) return `$${k.toFixed(1)}K`;
  return `$${k.toFixed(1)}K`;
}

interface SideLine {
  side: 'LONG' | 'SHORT';
  mv: number;
  cap: number;
  pct: number;
  over: boolean;
}

function computeLine(side: 'LONG' | 'SHORT', mv: number, cap: number): SideLine {
  const pct = cap > 0 ? (mv / cap) * 100 : 0;
  return { side, mv, cap, pct, over: pct > 100 };
}

export function OvershootCapCompliance({
  sizingBaseUsd,
  longMvUsd,
  shortMvUsd,
  labelPrefix,
  className,
}: OvershootCapComplianceProps) {
  if (
    sizingBaseUsd === null ||
    !Number.isFinite(sizingBaseUsd) ||
    sizingBaseUsd <= 0 ||
    longMvUsd === null ||
    shortMvUsd === null
  ) {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
        Cap compliance — pending equity snapshot (arm overshoot_equity_snapshot).
      </div>
    );
  }

  const longCap = sizingBaseUsd * OVERSHOOT_SIDE_ALLOCATION_PCT_LONG;
  const shortCap = sizingBaseUsd * OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT;
  const lines: SideLine[] = [
    computeLine('LONG', Math.abs(longMvUsd), longCap),
    computeLine('SHORT', Math.abs(shortMvUsd), shortCap),
  ];

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 ${className ?? ''}`}>
      {labelPrefix ? <span className="shrink-0">{labelPrefix}</span> : null}
      {lines.map((l) => (
        <span key={l.side} className="inline-flex items-center gap-1 whitespace-nowrap min-w-0">
          <span className="font-semibold">{l.side}</span>{' '}
          <span className="font-mono">
            {fmtK(l.mv)} / {fmtK(l.cap)} cap · {l.pct.toFixed(0)}%
          </span>{' '}
          <Badge
            variant={l.over ? 'destructive' : 'outline'}
            className="ml-1 uppercase text-[10px]"
          >
            {l.over ? 'over' : 'under'}
          </Badge>
          {l.over ? (
            <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground text-[11px]">
              <span>{INC96_SHORT}</span>
              <InfoHint label="INC-96 carry — convergence">
                Existing over-cap carry unwinds naturally via T+10 exits from the first over-cap entry
                date (2026-07-22). The engine gate <span className="font-mono">evaluateAllocationCap</span>
                {' '}refuses new cap-breaching entries — the carry is bounded above and dated below.
              </InfoHint>
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}