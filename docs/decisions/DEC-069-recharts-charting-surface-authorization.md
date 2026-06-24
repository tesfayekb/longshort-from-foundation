# DEC-069 — Recharts authorized for the dashboard charting surface (ACT-324 / FP-057)

**Status:** Approved (operator) — 2026-06-24.
**Authority:** Supervisor (operator).
**Tier:** A (governance — dep-policy carve-out for the charting surface; the
dep + this DEC are co-equal and ship in the same PR).

## Decision

`recharts` (npm: `recharts`, pinned at `^2.15.0`) is **authorized** as the
sole charting dependency for the long-short dashboard charting surface
(equity / portfolio growth chart per ACT-324 / FP-057, per-ticker price
history charts, and any subsequent dashboard charts that need a real
time-axis + range-toggle + hover-crosshair primitive).

## Scope and limits

1. **Charting surface only.** This authorization applies to charts only.
   It does NOT open general-purpose dependency adding. The existing
   `SignalDistributionBand` hand-rolled SVG component **stays as-is**
   (this DEC is additive, not a rewrite mandate).
2. **Pinned at `^2.15.0`** (caret-minor). Major-version upgrades (3.x +)
   require a follow-up DEC.
3. **No further charting dependencies** (`chart.js`, `tremor`, `nivo`,
   `visx`, `d3-*`, etc.) without a follow-up DEC. This is the
   slippery-slope cap; the precedent stops here.
4. **Supersedes** the per-FP zero-new-dep discipline (FP-023.1 forward-binding)
   **for the charting surface only**. Other surfaces remain on the
   zero-new-dep default.

## Rationale

- The operator-asked Yahoo-style equity growth chart needs time-axis
  scaling, hover-crosshair + nearest-point lookup, D/W/M/3M/6M/1Y range
  toggles, responsive container, and axis tick formatting per range —
  approximately 200–400 LoC of axis/scale/tooltip plumbing to hand-roll
  vs. ~30 LoC with `recharts`. The chart is the most visible surface in
  the UI; a hand-rolled implementation with janky hover would be
  noticeably amateur.
- `recharts` qualifies under the project's dep policy by orders of
  magnitude: MIT license, ~2.4M weekly downloads, actively maintained
  (<12 months since last release), shadcn-blessed (shadcn ships a
  `recharts`-backed `Chart` primitive). No native-binary dependency; pure
  React + SVG.
- `SignalDistributionBand` is hand-rolled because it is a static
  one-dimensional band (no time axis, no hover-nearest, no range
  switching) — it does not benefit from `recharts` and is excluded from
  this authorization's mandate to migrate.

## Reference

- ACT-324 / FP-057 (the equity-snapshot pipeline + the chart that
  consumes `longshort_equity_snapshots`).
- MIG-121 (the `longshort_equity_snapshots` table — the chart's data
  source).
- FP-023.1 forward-binding (per-FP zero-new-dep discipline — superseded
  for the charting surface by this DEC).