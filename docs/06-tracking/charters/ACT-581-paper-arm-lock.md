# ACT-581 — S5-L PAPER-ARM LOCK (charter, DESIGN-VALIDATED-NOT-BUILT)

**SELECT now():** 2026-07-27 03:45:42 UTC (status-correction re-header)
**Original filing:** 2026-07-26 07:33:05 UTC

**Status: DESIGN-VALIDATED-NOT-BUILT.** Per operator redirect
(2026-07-27), the paper-arm question is DEFERRED. Nothing builds,
nothing trades, no Monday target. The five-box operator-word
checklist at the foot of this charter is **WITHDRAWN**; the shipping
configuration table below is retained as **design record only** — it
documents what would ship *if* the paper-arm were greenlit, not a
commitment to build. Momentum holdout 2026 H1 is SPENT
(`ACT-580-S5L-HOLDOUT.md`); k=12 reservation for the 8-week gate is
VACATED and will be re-consumed if/when the arm is greenlit under a
new pre-registration.

## Deviations first
- None from the S5-L finalization train. Shipping config is BARE
  per G-1 FAIL, G-2 FAIL, cadence-grid monthly-incumbent WIN, C20
  DD-FAIL rulings (receipts:
  `ACT-580-S5L-{G1-GOVERNOR,G2-VOL-TARGET,CADENCE-GRID,C20-VARIANT}.md`).

## Shipping configuration (frozen, no knobs)
| parameter | value | source |
|---|---|---|
| signal | 12-1 cross-sectional momentum, D10 decile | charter §S5 |
| construction | equal-weight long-only, 79–84 names/leg | ROBUSTNESS §4 |
| cadence | monthly, first-Monday rebalance | charter §S5 |
| entry pricing | first-Monday open | charter §S5 |
| exit pricing | rebalance day open (roll into new D10) | charter §S5 |
| cost model | 38 bps round-trip per leg (ACT-506 slippage + half-spread) | ACT-506 |
| leverage | 1.0× (bare — no G-1) | G-1 receipt |
| vol governor | none (no G-2) | G-2 receipt |
| holdout | 2026 H1 locked/consumed (single-look PASS) | HOLDOUT receipt |

## Lane separation (mandatory, CI-guarded)
1. **Feature module: `src/features/momentum/`** — brand-new lane;
   MUST NOT import from `src/features/overshoot/` or
   `src/features/longshort/` internals; MUST NOT import platform's
   `_shared/audit.ts` (audit-writer trap T4). Uses
   `_shared/strategy-audit.ts` targeting `momentum_audit_logs`.
2. **Tables: `momentum_*`** — separate schema namespace. Per-strategy
   audit table `momentum_audit_logs` (never touches platform
   `audit_logs`).
3. **Edge functions: `momentum-*`** — DEC-023 envelope via
   `_shared/handler.ts`. No bespoke handlers.
4. **Jobs: `momentum_*`** — monthly cron at first-Monday 09:35 ET
   (post-market-open, pre-first-hour-close).
5. **RBAC: two-segment perms `momentum.view` / `momentum.manage` /
   `momentum.execute`** (T3). Registered via `trading-navigation.ts`
   façade-import only.
6. **CI guard**: extend `scripts/check-src-imports.ts` +
   `scripts/check-edge-imports.ts` to enforce
   `momentum ↔ {overshoot, longshort}` separation. Land in same PR
   as the lane skeleton.

## Execution constraint (ARMED, activates only if D10 ships as-is)
**Top-40-ADV execution cap** (per name): rebalance day child-order
notional per name capped at **40% of trailing-20-day ADV**. Rationale:
D10 is 79–84 names/leg at $50k gross — mean per-name notional is
$50k / 80 ≈ $625 — well under 40% ADV for any composite-universe
name. Cap is a defense-in-depth guard against paper-execution
inflating positions above ADV headroom during holdout-anomaly
regimes; NOT a rebalance-size knob. Confirmed active in ACT-581
armed state.

## Capital
- **$50k paper default** — **PENDING OPERATOR WORD**.
- Broker: paper account (Alpaca paper, per ACT-506 wiring).
- Nothing trades without operator sign-off on notional.

## Weekly cadence
- Every Monday post-close: **fill-vs-model receipt** at
  `docs/06-tracking/receipts/ACT-581-week-NN-fill-vs-model.md`
- Contents:
  - Names / weights entered (paper actuals)
  - Fill prices vs modeled first-Monday-open
  - Slippage in bps (per-name and aggregate)
  - Realized month-to-date NAV vs modeled NAV
  - Any execution-cap trips
- Cost-model check: weekly cumulative slippage must stay within
  ±15 bps of the 38 bps RT model per side. Trip → halt-review.

## 8-week promotion gate (pre-registered)
After Monday 2026-08-03 → Monday 2026-09-28 (8 first-Monday
rebalances, ~2 months):
- **PROMOTE-TO-LIVE clause:** paper realized CAGR ≥ 12%
  (annualized from 8-week window) AND max intra-window DD ≥ −8%
  AND cumulative slippage ≤ 45 bps RT per side.
- **HALT-REVIEW clause:** paper realized CAGR ≤ −10% (annualized)
  OR DD ≤ −15% OR slippage > 60 bps RT.
- **CONTINUE-PAPER clause:** everything in between.
- All three clauses evaluated at the 8-week receipt; no interim
  peeking beyond the weekly fill-vs-model receipts (multiple-look
  discipline).
- k-ledger: 8-week gate consumes **k=12** (the first look after the
  §11.KL search-phase k=11 close).

## Kill-switch integration
- `momentum` participates in DEC-028 panels.trading MFA policy.
- `kill_switch_soft_pause('momentum', ...)` and hard-pause paths
  wired via standard `kill_switches` table.
- Auto-hard-pause trigger: paper DD ≤ −15% intra-window OR any
  execution-cap trip fires 3× in the same week.

## Ledger row (charter §11 addendum)
```
ACT-581  S5-L Paper Arm  ARMED-PENDING-OPERATOR / config-locked /
first-execution 2026-08-03 / capital $50k pending / 8-week promotion
gate pre-registered / k=12 reserved for gate eval
```

## Operator-word checklist
- [ ] Approve $50k paper notional (or specify alternative)
- [ ] Approve first-execution date 2026-08-03 (or defer)
- [ ] Approve 8-week promotion gate clauses as pre-registered
- [ ] Approve momentum lane separation PR before it lands
- [ ] Approve `momentum.execute` perm assignment to paper-broker
      service role

**Until all five boxes ticked in writing, ACT-581 is ARMED but
does not trade.**

## Cross-references
- Search-phase close: `docs/08-planning/ACT-580-strategy-search.md`
  §11.KL (k=11 consumed, 1 survivor)
- Survivor build receipt: `ACT-580-S5-TREND.md` + `ACT-580-S5L-*.md`
- Holdout co-sign: `ACT-580-S5L-HOLDOUT.md`
- Blend receipt (for optional 65/35 momentum/overshoot future
  variant, NOT part of ACT-581 paper-arm): `ACT-580-S5L-R1-BLEND.md`
