/**
 * LongShortDashboard — placeholder dashboard component for the long-short strategy.
 *
 * At FP-005 bootstrap, this component renders only a placeholder indicating the
 * route is reachable and the RBAC gate is honored. FP-006 fills this with the
 * actual signal/position dashboard UI.
 *
 * This is the strategy's INTERNAL component. External consumers MUST import
 * `LongShortDashboardPage` (the named re-export) from
 * `src/features/longshort/index.ts`, NOT from this file directly. Reaching
 * inside this folder is a Constitution Rule 3 violation.
 */
export function LongShortDashboard() {
  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Long-Short Strategy</h1>
      <p className="text-sm text-muted-foreground">
        FP-005 bootstrap surface. Strategy implementation lands in FP-006.
      </p>
    </div>
  );
}