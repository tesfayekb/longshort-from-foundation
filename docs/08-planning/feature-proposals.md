

### FP-037: Top-N Selector (20/30/50) on Rankings

| Field | Value |
|---|---|
| **ID** | FP-037 (next-free verified by grep at HEAD — 0 prior references). |
| **Status** | approved (operator-directed forward 2026-06-08 — Tier C; frontend-only, presentational, read-only, Monday-safe). |
| **Problem** | The top/bottom cutoff on the Rankings page is hardcoded to TOP_N = 20 / BOTTOM_N = 20. The operator cannot preview what top-30 or top-50 looks like before 9 signals compete for screen space. |
| **Resolution** | Replace constants with a single `topN` state (default 20), driven by a compact `<Select>` (options 20 / 30 / 50). Long and short cutoffs move together symmetrically (bottomN = topN). All existing usages (slice, `SignalDistributionBand` props, table titles, `startingRank`) read the state value. |
| **Scope** | EDIT: `src/pages/trading/longshort/signals/RankingsTab.tsx` (constants → state + selector; all usages read state). EDIT: `src/pages/trading/longshort/signals/__tests__/RankingsTab.test.tsx` (+1 test — selector changes cutoff to 50, titles update). Docs same-PR: `docs/08-planning/feature-proposals.md` (this entry), `docs/06-tracking/action-tracker.md` ACT-149, `docs/07-reference/component-inventory.md` (RankingsTab description + FP-037 note), `docs/07-reference/route-index.md` (signals hub description + related tests). |
| **Out of Scope** | Any data/query change (server-paginated full list unchanged; only top/bottom CUTOFF changes). Any other tab. Any new dependency. Any edge function, migration, cron, sql/14, signal-math, FP-018 Bucket C surface touch. ACT-130 (still reserved for FP-018 Bucket C). |
| **Reference Impact** | component-inventory.md: RankingsTab description + FP-037 note. route-index.md: signals hub description + related tests update. feature-proposals.md: this entry. action-tracker.md: ACT-149. No new permissions, events, configs, env-vars, migrations, routes, edge functions, or shared helpers. No new npm dependency. |
| **Decision ID** | None — frontend, presentational, within existing UI-design-system discipline. |
| **Reviewed By** | Operator |
| **Review Date** | 2026-06-08 |

**Closure** — Landed at execution commit (HEAD pending). Rankings page shows a 20/30/50 selector (default 20) controlling the top/bottom cutoff; titles and distribution-band accents update dynamically; full Gate-4 green. Zero data/query change. Zero Monday/edge/migration touch.

Authority: ACT-149.

### FP-037: Top-N Selector (20/30/50) on Rankings

| Field | Value |
|---|---|
| **ID** | FP-037 (next-free verified by grep at HEAD — 0 prior references). |
| **Status** | approved (operator-directed forward 2026-06-08 — Tier C; frontend-only, presentational, read-only, Monday-safe). |
| **Problem** | The top/bottom cutoff on the Rankings page is hardcoded to TOP_N = 20 / BOTTOM_N = 20. The operator cannot preview what top-30 or top-50 looks like before 9 signals compete for screen space. |
| **Resolution** | Replace constants with a single `topN` state (default 20), driven by a compact `<Select>` (options 20 / 30 / 50). Long and short cutoffs move together symmetrically (bottomN = topN). All existing usages (slice, `SignalDistributionBand` props, table titles, `startingRank`) read the state value. |
| **Scope** | EDIT: `src/pages/trading/longshort/signals/RankingsTab.tsx` (constants → state + selector; all usages read state). EDIT: `src/pages/trading/longshort/signals/__tests__/RankingsTab.test.tsx` (+1 test — selector changes cutoff to 50, titles update). Docs same-PR: `docs/08-planning/feature-proposals.md` (this entry), `docs/06-tracking/action-tracker.md` ACT-149, `docs/07-reference/component-inventory.md` (RankingsTab description + FP-037 note), `docs/07-reference/route-index.md` (signals hub description + related tests). |
| **Out of Scope** | Any data/query change (server-paginated full list unchanged; only top/bottom CUTOFF changes). Any other tab. Any new dependency. Any edge function, migration, cron, sql/14, signal-math, FP-018 Bucket C surface touch. ACT-130 (still reserved for FP-018 Bucket C). |
| **Reference Impact** | component-inventory.md: RankingsTab description + FP-037 note. route-index.md: signals hub description + related tests update. feature-proposals.md: this entry. action-tracker.md: ACT-149. No new permissions, events, configs, env-vars, migrations, routes, edge functions, or shared helpers. No new npm dependency. |
| **Decision ID** | None — frontend, presentational, within existing UI-design-system discipline. |
| **Reviewed By** | Operator |
| **Review Date** | 2026-06-08 |

**Closure** — Landed at execution commit (HEAD pending). Rankings page shows a 20/30/50 selector (default 20) controlling the top/bottom cutoff; titles and distribution-band accents update dynamically; full Gate-4 green. Zero data/query change. Zero Monday/edge/migration touch.

Authority: ACT-149.
