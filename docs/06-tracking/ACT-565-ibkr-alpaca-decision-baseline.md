# ACT-565 — IBKR vs Alpaca Decision Baseline (ACT-572 Comparator Substrate)

**Status:** LANDED (slip #6 closed; charter-owed since 2026-07-22 evening).
**Authored:** 2026-07-25.
**Owner:** overshoot (Phase-L decision-prep artifact).
**Consumer:** ACT-572 (IBKR shadow lane) — every fill row that lane emits
will populate the schema in §5. Phase-L thresholds in §6 are the
pre-committed verdict grammar; adopting IBKR later becomes a **table
read**, not a debate.
**Governance:** DEC-023 envelope, T5 carve-out (shadow lane is a sub-feature
of overshoot, not a new strategy), NO ARTIFACT / NO ASSERTION (Catalog #65).
**No code, no deploys** — evidence artifact only.

---

## 0. Prime directive

Alpaca paper is the sole money-path lane and remains so through Phase-K.
This artifact fixes what "**good enough to migrate**" means BEFORE the
shadow lane produces its first fill, so ACT-572's evidence is scored
against a pre-registered rubric rather than a post-hoc narrative.

All web citations dated. Our-side facts cite repo grep results and
prior ledger rows verbatim.

---

## 1. Margin economics

### 1.1 Public rate schedules (cited)

**Interactive Brokers Pro — USD margin loan tiers, blended tier method.**
Source: `https://www.interactivebrokers.com/en/trading/margin-rates.php`
(fetched 2026-07-25; BM = Benchmark Rate, published separately).

| Tier | USD balance | IBKR Pro | IBKR Lite |
|---|---|---|---|
| I   | 0 – 100,000                | **5.130% (BM + 1.5%)**  | 6.130% (BM + 2.5%) |
| II  | 100,000 – 1,000,000        | **4.630% (BM + 1.0%)**  | 6.130% (BM + 2.5%) |
| III | 1,000,000 – 50,000,000     | **4.380% (BM + 0.75%)** | 6.130% (BM + 2.5%) |
| IV  | 50,000,000 – 250,000,000   | 4.130% (BM + 0.5%)      | 6.130% (BM + 2.5%) |

IBKR blends across tiers: on a $200k loan, the first $100k is charged
at Tier I, the next $100k at Tier II (source-page verbatim).

**Alpaca Securities — flat margin schedule.** Source:
`https://files.alpaca.markets/disclosures/library/BrokFeeSched.pdf`
(fetched 2026-07-25).

| Product | Rate |
|---|---|
| Default Margin Lending Interest Rate       | **6.25%** |
| Alpaca Elite (≥ $100k) Margin Lending Rate | **4.75%** |

Alpaca does not tier below/above the $100k line; the rate applies flat
to the whole daily debit balance.

### 1.2 Worked deltas at our book sizes

Assumptions: 252 trading days annualization; margin used = notional −
equity (positive = debit). Alpaca default 6.25% is the honest baseline
because our current paper account has no Elite arrangement.

**Case A — $100K book, 1× today (Phase-K posture).** Overnight margin
debit is *structurally zero* (dominance-floor sizing keeps gross ≤ 1×
equity). Rate delta is **irrelevant to Case A**; the only cost that
moves is short borrow (§2). State this bluntly so no one launders a
phantom saving into the Phase-L case.

- Annual margin-interest delta: **$0.**

**Case B — $100K book, 2× Phase-L (approved posture at Phase-L gate).**
Assume average overnight debit = $100k (one turn of leverage held
overnight, book-wide).

- Alpaca default 6.25% on $100k → **$6,250/yr**.
- Alpaca Elite  4.75% on $100k → **$4,750/yr**.
- IBKR Pro tier I 5.130% on $100k → **$5,130/yr**.

Annual $ deltas vs Alpaca default 6.25%:
- IBKR Pro vs Alpaca default: **−$1,120/yr** (IBKR cheaper).
- IBKR Pro vs Alpaca Elite:   **+$380/yr**  (Elite cheaper at this size).

**Case C — Phase-L scaled ($500K book, 2× = $500k avg debit).**

- Alpaca default 6.25% flat on $500k → **$31,250/yr**.
- IBKR Pro blended: $100k @ 5.130% + $400k @ 4.630%
  = $5,130 + $18,520 = **$23,650/yr**.
- IBKR Pro vs Alpaca default: **−$7,600/yr**.
- IBKR Pro vs Alpaca Elite 4.75% flat ($23,750/yr): **−$100/yr** (wash).

**Interpretation.** Below ~$500k avg overnight debit, Alpaca Elite is
competitive with or cheaper than IBKR Pro. The margin-rate lever alone
**does not justify migration at Phase-K sizes** and only opens a
meaningful gap once we cross the tier-II line ($100k → $1M). §6 uses
this to set the "annual $ savings" threshold honestly rather than
letting a headline "IBKR is cheaper" line drive the call.

---

## 2. Short-side infrastructure (the reason this artifact exists)

Monday 2026-07-27 13:35Z is the debut of `overshoot_short_daily_budget=1`
(DEC-084). SNDK is the presumptive first short. §2 is therefore the
load-bearing section — what we can and cannot observe on each lane
determines what evidence Phase-L can even collect.

### 2.1 Feature matrix

| Dimension | Alpaca (paper + live) | IBKR (paper + live) |
|---|---|---|
| Borrow universe breadth | ETB list only in paper; live borrow via `easy_to_borrow` bool on the asset object | Full IBKR shortability feed (`GET /iserver/secdef/info?conid=…`) including HTB with per-symbol fee bps |
| HTB fee transparency | **Not exposed** in paper; live account sees a per-day borrow fee accrual only after the fact | Real-time bid/offer borrow fees on Client Portal (`https://www.interactivebrokers.com/en/trading/short-securities-availability.php`, fetched 2026-07-25) |
| Locate mechanics | Auto-locate on ETB; **no locate API** for HTB; HTB symbol simply refuses at submit with `not_shortable` | Pre-borrow locate via CP Web API (`/iserver/marketdata/snapshot` fields include shortable flag); manual locate request flow available for HTB |
| Short-sale marking (SSR / Reg SHO) | Alpaca marks all sell-to-open as "short"; SSR compliance enforced silently at broker layer | IBKR marks explicitly; SSR uptick requirement returned as an order refusal reason, surfaced in CP order status |
| Recall risk visibility | None in paper; live account only learns via forced buy-in event | CP Web API exposes recall-risk category per symbol |
| Days-to-cover / SI data | Sourced separately from FINRA (`overshoot_short_interest`, our pipeline) | Same — both lanes rely on our FINRA feed |

### 2.2 What our paper lane can and cannot observe (honest gaps)

**Alpaca paper (what we already run).**
- CAN observe: fill price, fill quantity, `filled_avg_price`, submit→fill
  latency (our own timestamps), and the binary `not_shortable` refusal
  class (repo: `OvershootAlpacaShortabilityFetcher` in
  `supabase/functions/overshoot-entry-run/index.ts`; refusal class
  `shortability_refusals` in the entry accounting identity).
- CANNOT observe on paper: actual HTB fee, borrow-rate variability
  intraday, locate cost, recall risk category, or whether an ostensibly
  ETB name would have been unavailable at a different broker.
- CANNOT observe on paper: SSR-triggered price constraints on our fills
  (paper fills against snapshot, not the live NBBO uptick rule).

**IBKR paper (what ACT-572 will add).**
- CAN observe: shortability flag + fee bps at submit time (persist as
  `borrow_status`, `borrow_fee_bps` per §5), simulated locate
  acceptance, and per-fill fee footprint on the simulated ledger.
- CANNOT observe on paper (named honestly — §4.3): true queue position,
  liquidity-taker priority, and real recall events. IBKR paper
  simulates fills from top-of-book snapshots, so partial-fill behavior
  on thin names will look better than live.

### 2.3 Load-bearing consequence for Monday

On the Alpaca paper lane, SNDK short (or any first-fire short) will
either fill silently at snapshot mid or refuse `not_shortable` — we
never see whether it would have cost 50 bps or 500 bps to borrow. The
IBKR shadow lane closes that specific gap once ACT-572 §4 operator
secrets are in place; until then, borrow-cost realism is a
**known-unknown** and any short-side edge calculation must carry an
explicit borrow-cost haircut placeholder (Phase-L design item, §6.3).

---

## 3. Execution

### 3.1 Order types + extended hours

| Capability | Alpaca | IBKR |
|---|---|---|
| Market / Limit / Stop / Stop-Limit | Yes | Yes |
| Trailing stop | Yes | Yes |
| Bracket / OCO (native) | Yes | Yes (richer conditional set) |
| Marketable-limit (our current entry primitive) | Yes | Yes |
| Extended hours (pre/post) | Opt-in via `extended_hours=true` (repo grep: our entry uses `day` TIF — ETH **not currently used**) | Native RTH/ETH/OVERNIGHT modes on TIF; broader session coverage |
| Overnight-session equities (8pm–4am ET) | Limited symbol list | Full IBKR overnight venue |

Our lane's entry submits are LIMIT + DAY TIF (repo:
`OvershootAlpacaOrderSubmitter` in `overshoot-entry-run/index.ts`;
also cited in the ACT-464.e-ii ledger row). Nothing in Phase-K
requires ETH, so ETH parity is not a decision driver at this baseline.

### 3.2 Alpaca fill-quality baseline (our observed evidence)

**ACT-506 slippage decomposition** (repo:
`docs/08-planning/artifacts/ACT-506-RESULTS-slippage-decomposition.md`;
summary in `action-tracker.md`):

- n = 32 lots across 2026-07-08/09 cohorts.
- Weighted headline **close→fill = +143.9 bps ≈ 1.44%** — matches
  ACT-505's 1–2% ratifying prior.
- Decomposition: overnight (+24 to +164 bps), open→limit (+83 to +129
  bps), **limit→fill = −50 bps** (fills print INSIDE the limit —
  price-improvement, NOT queue-position indictment).
- Controllable bleed box (open→limit): **+33 to +79 bps per cohort**.
- Named gap: `snapshot_mid_at_construction` is NOT persisted on
  `overshoot.entry.submitted.entry`, so limit-vs-mid vs
  fill-vs-limit sub-split is not computable without a code change.
- Cited constant: `logged slippage_bps = 50.0` on every row is a
  construction constant, **NOT a measurement** — never cite as
  observed slippage anywhere (repeated to prevent recurrence).

**R-008 realized-slip calibration** (repo:
`docs/06-tracking/ACT-551-reproduction-ledger.md` §R-008; opened
2026-07-23; day-5 close due after the DEC-083 §(e) monitoring window):

- Metric: `realized_slip_bps = |broker_avg_fill_price - limit_price|
  / limit_price × 1e4` (MIG-168 monitor view).
- Bands (baked from DEC-083 §(e)): GREEN < 8.755 bps; YELLOW
  8.755–13.0; RED > 13.0 for ≥3 of 5 sessions ⇒ auto-rollback of
  morning-exit cron.
- R-007 conservative Δ prediction: **2.956 bps** vs 15:50 baseline.
- Supervisor pre-registered expectation: 4–7 bps pooled first-week
  mean.
- Reference-mid gap: `submit_reference_mid` is not persisted in the
  audit envelope; LAYER-1 falls back to `limit_price_at_submit` and
  labels `reference_source='limit_price_at_submit'` per operator
  ruling (MIG-168 ledger row).

**19:51Z senior-exit tick reference** (repo:
`docs/06-tracking/2026-07-24-midday-deviations.md:71`): lot
`60b84e8d` (qty 158) closed 2026-07-23 19:51Z; carried forward into
the Friday DELIVERED-INFERRED-CLEAN tick (ACT-534). Consistent with
the ACT-506 −50 bps limit→fill leg on senior-exit prints.

### 3.3 What IBKR paper will let us measure additively

- Per-fill spread capture from CP `snapshot` mid at submit vs IBKR
  paper fill.
- Per-symbol borrow-fee bps at admit time (persisted alongside the
  fill), which is the biggest blind spot on our current lane (§2.3).
- Order-status transitions (submitted → routed → filled) with venue
  attribution, decomposing the +33–79 bps controllable bleed box into
  router-side vs post-route drift.

What IBKR paper will NOT let us measure (named honestly, §4.3): true
queue position, price-improvement realism, or SSR-triggered
refusals — those require live money.

---

## 4. API surface for ACT-572

### 4.1 Auth model

| Property | Alpaca REST | IBKR Client Portal Web API |
|---|---|---|
| Auth primitive | Static `APCA-API-KEY-ID` + `APCA-API-SECRET-KEY` headers | Session token via `POST /iserver/auth/ssodh/init` against a running CP Gateway (Java or IBKR-hosted); session must be kept alive with periodic `/tickle` |
| Session lifetime | Effectively stateless (per-request) | Session expires (~24h idle, sooner on inactivity); re-auth flow required |
| Serverless friendliness | Excellent — Deno `fetch` with headers, done | Requires a gateway process reachable by URL from Deno; ACT-572 §3 chose gateway-in-front-of-CP model |
| Second-factor | Not on API path | 2FA required on gateway bring-up (initial paper account only) |

### 4.2 Rate limits + paper account parity

| Concern | Alpaca | IBKR CP Web API |
|---|---|---|
| Documented request rate | 200 req/min per account (data); 10k orders/day paper | ~10 req/s on CP; not per-endpoint documented — implicit throttling |
| Order simulation fidelity | Paper matches NBBO snapshot; partial fills conservative | Paper simulates against top-of-book with configurable latency; docs warn simulation "may differ materially from live execution" |
| Corporate action handling | Auto-applied on paper | Auto-applied on paper |
| Overnight ledger sweep | Real | Real |

### 4.3 Known IBKR paper gaps (honest)

- **Fill realism.** IBKR paper does not model queue position; a
  marketable-limit that would rest at back-of-book in live may fill
  instantly in paper.
- **HTB borrow cost.** IBKR paper *displays* the fee but the simulated
  ledger applies it as an accrual, not as a rejection event — a
  "would-have-been-recalled" scenario is invisible.
- **SSR uptick.** IBKR paper does not enforce Reg SHO uptick strictly
  on the simulator; short fills that would refuse in live may fill in
  paper.
- **Auction fills (MOO/MOC).** Simulated at last-print; live auction
  can print far from the simulator's assumption.

Gaps are stated so §5 knows which rows are trustable and §6 can weight
them.

### 4.4 Endpoint parity table (ACT-572 build reference)

| Purpose | Alpaca | IBKR CP |
|---|---|---|
| Submit order | `POST /v2/orders` | `POST /iserver/account/{accountId}/orders` |
| Order status | `GET /v2/orders/{id}` | `GET /iserver/account/orders` |
| Positions | `GET /v2/positions` | `GET /portfolio/{accountId}/positions/0` |
| Cash + equity | `GET /v2/account` | `GET /portfolio/{accountId}/ledger` |
| Market snapshot | `GET /v2/stocks/snapshots` (data plane) | `GET /iserver/marketdata/snapshot` |
| Symbol shortability | `GET /v2/assets/{symbol}` (`easy_to_borrow`, `shortable` bools) | `GET /iserver/secdef/info?conid=…` (flag + fee bps) |

---

## 5. Comparator schema (ACT-572-PREP seed)

**Contract.** Both lanes emit one row per (alpaca fill, ibkr shadow
fill) tuple, matched by `mirror_of_alpaca_client_order_id`. This is
the row Phase-L reads.

```sql
-- ACT-572-PREP seed (illustrative; DDL lands in ACT-572 Phase-1)
CREATE TABLE public.overshoot_broker_comparator_fills (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of_session_date              date NOT NULL,
  mirror_of_alpaca_client_order_id text NOT NULL,
  mirror_of_alpaca_lot_id         uuid,
  symbol                          text NOT NULL,
  side                            text NOT NULL,  -- 'long' | 'short' (lowercase invariant, INC-138)
  mirror_reason                   text NOT NULL,  -- 'admit' | 'exit_senior' | 'exit_morning' | 'exit_kill'

  -- fill facts (both lanes)
  alpaca_fill_qty                 numeric,
  alpaca_fill_px                  numeric,
  alpaca_submit_ts                timestamptz,
  alpaca_fill_ts                  timestamptz,

  ibkr_fill_qty                   numeric,
  ibkr_fill_px                    numeric,
  ibkr_submit_ts                  timestamptz,
  ibkr_fill_ts                    timestamptz,

  -- shared reference (one source of truth, both lanes)
  reference_minute_px             numeric,        -- Polygon 1m bar at fill minute
  reference_source                text NOT NULL,  -- 'polygon_minute_agg' | fallback labels

  -- derived metrics (NULL until both fills present)
  spread_bps                      numeric,        -- (ibkr_fill_px - alpaca_fill_px) / reference_minute_px * 1e4
  alpaca_slippage_bps             numeric,        -- |alpaca_fill_px - reference_minute_px| / reference * 1e4
  ibkr_slippage_bps               numeric,        -- |ibkr_fill_px   - reference_minute_px| / reference * 1e4
  slippage_delta_bps              numeric,        -- ibkr_slippage_bps - alpaca_slippage_bps (positive = IBKR worse)

  -- short-side only (NULL on longs)
  borrow_status                   text,           -- 'etb' | 'htb_fee_quoted' | 'not_shortable' | 'recall_yellow' | 'recall_red'
  borrow_fee_bps_ibkr             numeric,        -- IBKR-quoted at submit
  ssr_active                      boolean,

  -- provenance
  ibkr_source_version             text,           -- shadow lane SOURCE_VERSION literal
  alpaca_source_version           text,           -- primary lane SOURCE_VERSION literal
  notes                           text,           -- free-form incident refs (INC-NNN)
  created_at                      timestamptz NOT NULL DEFAULT now()
);
```

**Column semantics locked here so ACT-572 build has no drafting debate:**
- `side` is lowercase-only (INC-138 invariant).
- `reference_minute_px` is ALWAYS the Polygon 1m aggregate for the
  fill minute — one source, both lanes, no per-broker mid.
- `spread_bps` sign convention: **positive = IBKR paid more** (worse
  on buys, better on sells — Phase-L consumers respect side).
- `slippage_delta_bps` positive = IBKR worse (drives the migration
  threshold in §6 in the correct sign).
- Both `SOURCE_VERSION` columns are mandatory so any ACT-572 patch is
  attributable at row level (FIX-3 source-version rail discipline).

**Rollup view (planned, sibling of MIG-168):**

```sql
CREATE VIEW public.overshoot_broker_comparator_daily WITH (security_invoker = on) AS
SELECT
  as_of_session_date,
  side,
  count(*) FILTER (WHERE alpaca_fill_qty IS NOT NULL AND ibkr_fill_qty IS NOT NULL) AS paired_fills,
  count(*) FILTER (WHERE alpaca_fill_qty IS NOT NULL AND ibkr_fill_qty IS NULL)     AS alpaca_only,
  count(*) FILTER (WHERE alpaca_fill_qty IS NULL     AND ibkr_fill_qty IS NOT NULL) AS ibkr_only,
  avg(slippage_delta_bps)                                                            AS mean_slippage_delta_bps,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY slippage_delta_bps)                    AS median_slippage_delta_bps,
  avg(borrow_fee_bps_ibkr) FILTER (WHERE side = 'short')                             AS mean_borrow_fee_bps_short
FROM public.overshoot_broker_comparator_fills
GROUP BY as_of_session_date, side;
```

---

## 6. Decision frame (pre-committed verdict grammar)

**Purpose.** Fix — before ACT-572 emits its first row — the empirical
conditions under which Phase-L would recommend migrating the money
path from Alpaca to IBKR. Recording on the record so a symmetric
skepticism check can fire post-hoc (Standing Format Rule).

### 6.1 Evidence corpus size

- Minimum **8 weeks (40 trading sessions)** of paired fills before any
  migration recommendation is even eligible.
- Minimum **60 paired admit fills** and **20 paired senior-exit fills**
  in the window. Fewer ⇒ status quo (Alpaca) auto-continues; ACT-549
  status-quo-bias tie rule applies.
- Short-side sub-corpus requires **≥ 15 paired short admits** —
  without it, borrow economics are directional-only (matches ACT-573's
  honest-frame clause).

### 6.2 Numeric thresholds

Measured on the ACT-572 daily comparator rollup (§5).

| Dimension | Ratify-migration threshold | Ratify-stay threshold |
|---|---|---|
| Long-side mean `slippage_delta_bps` | ≤ −5.0 bps (IBKR meaningfully better) for ≥ 30 of 40 sessions | ≥ 0.0 bps or fewer than 20 of 40 sessions negative |
| Short-side mean `slippage_delta_bps` net of `borrow_fee_bps_ibkr` | ≤ 0.0 bps AND borrow fees actually observed on ≥ 10 fills | Net > +5.0 bps OR HTB fees not observable |
| Annual margin-interest saving at then-current book size | ≥ **$5,000/yr** projected on trailing-6-months avg debit | < $2,000/yr |
| Reconciliation divergence rate (positions, cash) | < 1 divergence per 200 shadow-mirror pairs | ≥ 1 per 100 |
| IBKR paper gap incidents (§4.3) | ≤ 2 incidents attributable to simulator gaps in 40 sessions | ≥ 5 |

**Ratify-migration** = ALL five ratify columns green simultaneously
for ≥ 40 sessions. Any single amber ⇒ **STAY on Alpaca, extend
window**. Any single ratify-stay column ⇒ **STAY on Alpaca, close
Phase-L consideration**; re-open only on a fresh charter.

### 6.3 Guard rails

- **Status-quo bias (n ≥ 1000-style rule, adapted).** With n < 1000
  paired fills (typical after 8 weeks), a tie or near-tie resolves to
  Alpaca. Migration is a one-way door in practice — the bar is
  intentionally asymmetric.
- **Borrow-cost realism placeholder.** Until §6.2 short-side row is
  filled with observed data, any short-side Phase-L calculation
  carries an explicit **200 bps annualized** borrow-cost haircut
  (matches observed HTB-fee upper end across small-cap tape;
  conservative-upward per SLICE-A methodology).
- **Kill-switch symmetry.** If the shadow lane triggers > 3
  divergences in a single session against the primary lane, the
  shadow lane auto-disables (`ibkr_shadow_enabled=false`) and Phase-L
  is suspended pending re-charter — the shadow lane's inability to
  keep up is itself evidence against migration.

### 6.4 What this artifact does NOT decide

- It does not authorize turning `ibkr_shadow_enabled` on. That gate
  remains ACT-572 §4 operator TO-DO (paper account + gateway URL + 5
  named secrets).
- It does not commit Alpaca Elite enrolment. §1.2 Case B shows Elite
  is cheapest at $100k; whether we enrol is a separate operator call
  once book size crosses $100k avg debit.
- It does not re-open the Alpaca-vs-IBKR question below the 8-week
  minimum, no matter how noisy the first-week evidence looks.

---

## 7. Cross-refs

- ACT-572 charter (`docs/06-tracking/ACT-572-charter-ibkr-shadow-lane.md`)
  — this artifact is its consumer-facing baseline.
- ACT-506 slippage decomposition
  (`docs/08-planning/artifacts/ACT-506-RESULTS-slippage-decomposition.md`).
- R-008 realized-slip calibration
  (`docs/06-tracking/ACT-551-reproduction-ledger.md` §R-008).
- MIG-168 morning-exit monitor
  (`docs/07-reference/database-migration-ledger.md`; action-tracker
  entry 2026-07-23 23:28Z).
- DEC-083 (morning-exit adoption) — cited threshold source.
- DEC-084 (short pacing) — the reason §2 is load-bearing.
- INC-138 (lowercase `overshoot_events.side` invariant) — §5 schema.
- Constitution Rule T5 — shadow lane sub-feature carve-out.

**Register:** deferred-work-register.md row 76 (ACT-565) flips
`A → C` (this turn) — artifact delivered against Slip-#6 close-out.
