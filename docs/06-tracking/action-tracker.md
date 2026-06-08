

### ACT-149: FP-037 — Top-N Selector (20/30/50) on Rankings

| Field | Value |
|---|---|
| **ID** | ACT-149 (ACT-130 explicitly NOT consumed — still reserved for FP-018 Bucket C; ACT-148 used by FP-036). |
| **Mode** | execution. |
| **Tier** | C (frontend, presentational, read-only). |
| **Branch** | feature/FP-037-top-n-selector. |
| **HEAD before / after** | before: post-FP-036 (ACT-148) baseline / after: pending at execution commit. |
| **Authority** | FP-037 (approved 2026-06-08). |
| **Scope** | EDIT `src/pages/trading/longshort/signals/RankingsTab.tsx` — replace `TOP_N = 20 / BOTTOM_N = 20` constants with `TOP_N_OPTIONS = [20, 30, 50] as const` and a `topN` state (default 20); add compact `<Select>` in filter toolbar; update `slice`, `SignalDistributionBand` props, table titles, and `startingRank` to read `topN`. EDIT `src/pages/trading/longshort/signals/__tests__/RankingsTab.test.tsx` (+1 test — selector changes cutoff to 50, titles update). Docs same-PR: `docs/08-planning/feature-proposals.md` (FP-037), `docs/06-tracking/action-tracker.md` (this entry), `docs/07-reference/component-inventory.md` (RankingsTab description + FP-037 note), `docs/07-reference/route-index.md` (signals hub description + related tests). |
| **Related Tests** | `RankingsTab.test.tsx` (+1 test): top-N selector defaults to 20; selecting 50 updates both table titles to "Top 50" / "Bottom 50". |
| **Evidence** | (a) **Pre-task verification** — confirmed `TOP_N = 20 / BOTTOM_N = 20` are used at exactly 6 sites in `RankingsTab.tsx` (lines 36-37 constants, 99 top slice, 102 bottom slice, 197-198 band props, 207 top title, 214 bottom title, 218 startingRank). Confirmed `SignalDistributionBand` already accepts numeric `topN` / `bottomN` props. Confirmed `Select` + `SelectItem` primitives are already imported in `RankingsTab.tsx` (used for signal/date/sector selectors). (b) **Gate-4 full run** — `bunx vitest run` returned `Test Files 49 passed (49) / Tests 383 passed (383)` (+1 vs FP-036 baseline 382); `bunx eslint .` returned `0 errors / 15 warnings` (all 15 pre-existing — same set as ACT-148). (c) **No `any` discipline** — `TOP_N_OPTIONS` typed `as const`; `topN` typed `number`; test uses existing typed mock fixtures. (d) **Out-of-scope guarantees by diff inspection** — zero data-query change (same `usePaginatedRankings` call, same select list, same mock shape); zero touch to edge functions, migrations, RLS, cron, `sql/14`, signal-math, FP-018 Bucket C deliverables, `jobid:51`, RBAC, audit code, façade, trading-navigation, `App.tsx` routing; zero new permissions / events / configs / env-vars / migrations / routes / dependencies. (e) **ID discipline** — ACT-130 untouched; ACT-149 next-free after ACT-148. No DEC required; no migration. (f) **Rule 6 same-PR** — component-inventory + route-index + feature-proposals + this register updated in same diff as the code. |
| **ROI Impact** | **Positive on operator UX** — lets the operator preview top-30/top-50 against live momentum data today, before 9 signals compete for screen space; applies automatically to every future signal because the Rankings page is already signal-generic. **Zero on prediction / signal / sizing / execution logic** — no money-path code touched; no signal-math change. |
| **Status** | Gate-4 verified (vitest 383/383, eslint 0 errors). |
