# ACT-572 — IBKR Shadow Lane (Mirror, Isolated, Evidence-Generating)

**Status:** CHARTERED (charter-before-build per INC-136).
**Chartered:** 2026-07-24 evening (operator "TWO NEW CHARTERS + weekend slate").
**Owner:** overshoot module (new isolated sub-lane).
**Related:** ACT-565 (IBKR comparison artifact — becomes ACT-572's
baseline), Phase-L (formerly projection-driven; now evidence-driven via
this lane), DEC-034 clause 4 (wall-clock discipline), DEC-023 (edge
function envelope), Constitution Rule T5 (strategy carve-out — this
lane is a sub-feature of the overshoot strategy, not a new strategy),
Catalog #65 (NO ARTIFACT, NO ASSERTION).

## 0. Prime directive (READ FIRST)

**The shadow lane NEVER feeds any decision path.** The Alpaca paper
lane remains the sole source of truth for money-path state (admits,
exits, sizing, kill-switches, dial breadth, reconciliation, dominance
floor). The shadow lane exists to accumulate real-broker evidence
(fills, spreads, borrow availability, margin behavior) so Phase-L
becomes a decision on EVIDENCE, not projections. Any code path that
causes a shadow-lane fault to influence the primary lane is a defect.

## 1. Scope

Build an isolated IBKR paper mirror lane that:

1. Observes every Alpaca admit/exit fill emitted by the primary lane
   (via existing `overshoot_events` / broker-fill stream — READ-ONLY).
2. Submits the same `(symbol, side, qty)` to IBKR paper with the same
   time-in-force conventions as the Alpaca lane.
3. Records IBKR fills to its own tables.
4. Runs a nightly comparator producing per-fill evidence rows:
   `{ibkr_fill_px, alpaca_fill_px, reference_minute_px, spread_bps,
   slippage_bps, borrow_status (shorts), notes}`.
5. Runs an A5-style nightly reconciliation vs IBKR paper account
   (positions, cash, equity) — divergences typed-logged only, NEVER
   paging as MEDIUM+ on the primary rail.

## 2. Design constraints (non-negotiable)

| Constraint | Enforcement |
|---|---|
| Completely isolated schema | Own tables: `ibkr_shadow_lots`, `ibkr_shadow_orders`, `ibkr_shadow_equity`, `ibkr_shadow_reconciliation_events` |
| Own kill-switch | `ibkr_shadow_enabled` in `system_config` (default `false` at first deploy); primary lane has NO reference to this flag |
| Own crons | `overshoot_ibkr_shadow_mirror` (event-driven / short poll of primary fills), `overshoot_ibkr_shadow_reconcile` (nightly, own slot) |
| Fail-open | Any IBKR error path returns typed-logged no-op; primary handler NEVER awaits shadow-lane RPCs |
| No cross-import into money path | CI guard extended: money-path files MUST NOT import `_shared/overshoot-shadow-ibkr/*` |
| Two-rail deploy discipline | Shadow functions carry own `SOURCE_VERSION` literal + OPTIONS probe |
| Provenance | Every `ibkr_shadow_orders` row stamps `mirror_of_alpaca_client_order_id`, `mirror_of_alpaca_lot_id`, `mirror_reason ∈ {admit, exit_senior, exit_morning, exit_kill}` |
| Wall-clock (DEC-034) | Injected clock in all shadow handlers |

## 3. IBKR access path (edge-compatible)

**Chosen route: IBKR Client Portal Web API (REST).** Reason: Deno edge
functions cannot run `ib-insync` (Python) or the TWS Java gateway
directly. Client Portal Web API is REST/JSON, sessioned, and callable
from Deno with `fetch`. The IBKR-supplied gateway (Java) runs in a
customer-owned container or IBKR's cloud-hosted equivalent; edge
functions call the gateway's REST endpoints with a session token.

Endpoints used (documented, not implemented until skeleton):

| Purpose | Endpoint |
|---|---|
| Session auth | `POST /iserver/auth/ssodh/init` (via gateway) |
| Order submit | `POST /iserver/account/{accountId}/orders` |
| Order status | `GET /iserver/account/orders` |
| Positions | `GET /portfolio/{accountId}/positions/0` |
| Cash + equity | `GET /portfolio/{accountId}/ledger` |
| Market data snapshot | `GET /iserver/marketdata/snapshot?conids=…&fields=…` |
| Contract search (symbol → conid) | `GET /iserver/secdef/search?symbol=…` |
| Borrow / shortability | `GET /iserver/secdef/info?conid=…` |

Alternative FIX/TWS route REJECTED — not reachable from serverless Deno
without a gateway anyway; REST is strictly simpler.

## 4. OPERATOR TO-DO (the only human steps — verbatim)

1. Open an IBKR paper account (Client Portal → New Account → Paper).
2. Enable Client Portal API access (Account Settings → API → enable;
   accept CP Web API T&Cs).
3. Enable market data as required for equities snapshot.
4. Provision an IBKR CP Gateway instance reachable from Supabase edge
   egress; capture its base URL.
5. Provision the following secrets via Dashboard (§22.5.3 names):
   - `IBKR_PAPER_GATEWAY_URL`
   - `IBKR_PAPER_ACCOUNT_ID`
   - `IBKR_PAPER_USERNAME`
   - `IBKR_PAPER_PASSWORD` (or session-token issuance path if SSO)
   - `IBKR_PAPER_SESSION_TOKEN` (optional; else handler re-auths on 401)
6. Confirm in chat: "IBKR paper provisioned, secrets set." Then flip
   `ibkr_shadow_enabled=true` via `system_config` (one SQL, audited).

Until step 6, the lane deploys but stays dormant.

## 5. Test set (skeleton weekend)

1. Mirror-order enqueue on Alpaca admit fill → shadow row inserted
   with correct `mirror_reason='admit'` and provenance.
2. Mirror-order enqueue on Alpaca exit fill → `mirror_reason='exit_senior'`.
3. IBKR 500 during submit → typed error, primary lane unaffected.
4. IBKR 401 mid-session → auto-reauth path exercised (mocked).
5. Reconciliation comparator produces per-fill row with `spread_bps`,
   `slippage_bps`, `borrow_status` fields.
6. `ibkr_shadow_enabled=false` → mirror handler no-ops with
   `status:'shadow_disabled'`.
7. CI separation guard rejects a synthetic bad money-path import.

## 6. Baseline evidence dependency

**ACT-565 lands TONIGHT as chartered.** ACT-565's comparison artifact
becomes ACT-572's evidence baseline — the "before we mirrored, this
is what we projected" delta reference. All comparator rows carry
`baseline_ref='ACT-565'`.

## 7. Weekend skeleton deliverables (not full build)

1. Charter doc (this file). ✓
2. Migration draft: `sql/MIG-XXX_ibkr_shadow_tables.sql` — four tables
   + grants + RLS (service_role only for writes).
3. Edge function skeletons:
   - `overshoot-ibkr-shadow-mirror/index.ts` (returns `{status:'shadow_disabled'}`).
   - `overshoot-ibkr-shadow-reconcile/index.ts` (same dormant behavior).
4. Shared client stub `_shared/overshoot-shadow-ibkr/cp-client.ts` —
   typed error surface, session/reauth scaffolding, NO live calls.
5. CI separation guard extension.
6. `system_config` seed `ibkr_shadow_enabled=false`.

Full mirror wiring + comparator lands in ACT-572-Phase-1 (post
skeleton acceptance).

## 8. Acceptance (skeleton)

1. Charter doc committed.
2. Migration file present with grants/RLS reviewed.
3. Two edge-function skeletons deploy and echo `SOURCE_VERSION` via
   OPTIONS probe.
4. Kill switch defaults `false`; manual invoke returns
   `{status:'shadow_disabled'}`.
5. CI separation guard rejects a synthetic bad import.
6. Operator TO-DO §4 published.

## 9. Explicitly out of scope

- Feeding IBKR fills into ANY primary-lane decision.
- Cross-broker arbitrage / routing.
- Live-money IBKR path (paper only; live-money Phase-L is a separate
  DEC downstream).
- Options / futures — equities only.
