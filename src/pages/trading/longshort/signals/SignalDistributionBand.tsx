import { useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { SignalObservationRow } from '@/features/longshort/hooks/useSignalRankings';

/**
 * FP-024 — Distribution band hero visual.
 *
 * Plots every present-value ticker on a horizontal z-score axis. Top-N
 * and bottom-N are accented with semantic success/destructive tokens; the
 * middle bulk is rendered with --muted-foreground. Absent (is_present=
 * false) tickers are NEVER plotted at 0 — they are surfaced as an out-of-
 * band "N tickers absent" annotation per the DB CHECK invariant
 * (value IS NULL ↔ is_present=false). This preserves the epistemic-
 * honesty principle (INC-36 / §2-axiom-3): missing ≠ zero.
 *
 * SVG is hand-rolled (no charting dependency added — none in
 * package.json today, and the FP-023.1 zero-new-dep discipline applies).
 */

export interface SignalDistributionBandProps {
  rows: SignalObservationRow[];
  topN: number;
  bottomN: number;
  absentCount: number;
}

export function SignalDistributionBand({
  rows,
  topN,
  bottomN,
  absentCount,
}: SignalDistributionBandProps) {
  const sorted = useMemo(() => {
    return [...rows]
      .filter((r) => r.is_present && typeof r.value === 'number' && Number.isFinite(r.value))
      .sort((a, b) => (b.value as number) - (a.value as number));
  }, [rows]);

  const stats = useMemo(() => {
    if (sorted.length === 0) return null;
    const values = sorted.map((r) => r.value as number);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const longCutoff = sorted[Math.min(topN, sorted.length) - 1]?.value ?? null;
    const shortCutoff = sorted[Math.max(0, sorted.length - bottomN)]?.value ?? null;
    return { min, max, longCutoff, shortCutoff };
  }, [sorted, topN, bottomN]);

  const width = 960;
  const height = 80;
  const padX = 24;
  const trackY = 36;
  const trackHeight = 1;

  if (!stats) {
    return (
      <div
        data-testid="signal-band-empty"
        className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground"
      >
        No present values for this signal/date.
      </div>
    );
  }

  const { min, max, longCutoff, shortCutoff } = stats;
  const range = Math.max(Math.abs(min), Math.abs(max), 0.001);
  const xScale = (v: number) => {
    const t = (v + range) / (2 * range); // map [-range, +range] → [0, 1]
    return padX + t * (width - 2 * padX);
  };

  const zeroX = xScale(0);

  return (
    <div className="space-y-3" data-testid="signal-band">
      <div className="relative w-full overflow-x-auto">
        <TooltipProvider delayDuration={50}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-auto"
            role="img"
            aria-label="Signal z-score distribution band"
          >
            {/* axis baseline */}
            <line
              x1={padX}
              x2={width - padX}
              y1={trackY}
              y2={trackY}
              className="stroke-border"
              strokeWidth={trackHeight}
            />
            {/* zero marker */}
            <line
              x1={zeroX}
              x2={zeroX}
              y1={trackY - 24}
              y2={trackY + 24}
              className="stroke-muted-foreground"
              strokeDasharray="2 3"
              strokeWidth={1}
            />
            <text
              x={zeroX}
              y={trackY + 40}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              0
            </text>
            {/* min/max labels */}
            <text
              x={padX}
              y={trackY + 40}
              textAnchor="start"
              className="fill-muted-foreground text-[10px]"
            >
              {min.toFixed(2)}
            </text>
            <text
              x={width - padX}
              y={trackY + 40}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {max.toFixed(2)}
            </text>
            {/* ticker marks */}
            {sorted.map((row, idx) => {
              const v = row.value as number;
              const isLong = longCutoff !== null && v >= longCutoff;
              const isShort = shortCutoff !== null && v <= shortCutoff;
              const cx = xScale(v);
              const colorClass = isLong
                ? 'fill-success'
                : isShort
                  ? 'fill-destructive'
                  : 'fill-muted-foreground';
              const opacity = isLong || isShort ? 0.9 : 0.35;
              const h = isLong || isShort ? 28 : 16;
              return (
                <Tooltip key={`${row.ticker}-${idx}`}>
                  <TooltipTrigger asChild>
                    <rect
                      data-ticker={row.ticker}
                      data-zone={isLong ? 'long' : isShort ? 'short' : 'middle'}
                      x={cx - 0.75}
                      y={trackY - h / 2}
                      width={1.5}
                      height={h}
                      className={colorClass}
                      opacity={opacity}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      <div className="font-mono font-medium">{row.ticker}</div>
                      <div className="text-muted-foreground">
                        z = {v.toFixed(4)}
                      </div>
                      <div className="text-muted-foreground">
                        {row.gics_sector ?? '— sector'}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </svg>
        </TooltipProvider>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-destructive" />
          Bottom {bottomN} (short candidates)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/40" />
          Middle ({Math.max(0, sorted.length - topN - bottomN)} tickers)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-success" />
          Top {topN} (long candidates)
        </span>
        <span
          data-testid="signal-band-absent"
          className="ml-auto inline-flex items-center gap-1.5"
        >
          <span className="inline-block h-2 w-2 rounded-sm border border-dashed border-muted-foreground" />
          {absentCount} tickers absent this date (no value — not plotted)
        </span>
      </div>
    </div>
  );
}