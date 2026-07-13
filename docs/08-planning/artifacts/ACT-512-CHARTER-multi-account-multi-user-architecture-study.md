# ACT-512 — Multi-Account / Multi-User Architecture Study

**Mode:** INVESTIGATION (read-only). **Sequenced:** parallel, blocks nothing this week. **Deliverable:** design + migration path + cost table. **STOP after deliverables for operator ratification.**

**Filed:** 2026-07-13 (late evening, operator directive).
**Charter authority:** operator DEC (this record). Code/migration changes require a follow-on execution charter after ratification.

---

## 0. Problem framing (operator-stated)

**Future state:** one-or-few users, multiple accounts each. Alpaca paper today; IBKR paper / taxable / IRA later. IRAs prohibit margin AND shorts; carry T+1 cash-settlement discipline (good-faith-violation risk). Capacity is finite → account count stays deliberately small (single-digit).

**Design principle under evaluation (supervisor-proposed):** **ONE BRAIN, MANY WALLETS.**
- Detection + selection runs ONCE per strategy per day. Single book, single detector version, single ranked event set.
- A per-account **ALLOCATOR** maps that book through each account's **capability profile** (margin_max, shorts_allowed, settlement_regime, allocation_usd).
- Execution, fills, lots, reconciliation, equity snapshots are **account-scoped**.

This charter tests the principle against the six deliverables the operator enumerated. Adoption is NOT decided here — only the design, the migration path, and the honest cost of each alternative.

---

## 1. Deliverable (1) — Schema delta + honest single-account-today migration

### 1.1 New table: `public.accounts`

```sql
CREATE TABLE public.accounts (
  account_id             text PRIMARY KEY,            -- stable slug, e.g. 'alpaca_paper_overshoot'
  broker                 text NOT NULL,               -- 'alpaca' | 'ibkr' | ...
  broker_account_ref     text,                        -- last-4 or opaque handle; NEVER the full number in-clear
  account_type           text NOT NULL,               -- 'paper' | 'taxable' | 'ira_traditional' | 'ira_roth'
  owner_user_id          uuid REFERENCES auth.users(id),
  -- capability profile (evaluated by allocator; ENFORCED by DB CHECKs, not just app code)
  margin_max             numeric NOT NULL CHECK (margin_max >= 1.00 AND margin_max <= 2.00),
  shorts_allowed         boolean NOT NULL,
  settlement_regime      text    NOT NULL CHECK (settlement_regime IN ('margin','cash')),
  allocation_usd         numeric NOT NULL CHECK (allocation_usd >= 0),
  -- secrets pointer (INC-100 discipline — see §5)
  credentials_ref        text NOT NULL,               -- names the secret PAIR, not the value
  -- lifecycle
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- capability integrity: IRA regime lock (belt for the enforcement in §3)
  CONSTRAINT ira_no_margin   CHECK (account_type NOT LIKE 'ira%' OR margin_max = 1.00),
  CONSTRAINT ira_no_shorts   CHECK (account_type NOT LIKE 'ira%' OR shorts_allowed = false),
  CONSTRAINT ira_cash_settle CHECK (account_type NOT LIKE 'ira%' OR settlement_regime = 'cash')
);
GRANT SELECT ON public.accounts TO authenticated;
GRANT ALL    ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
-- policy sketch: owner_user_id = auth.uid() OR has_permission(auth.uid(),'overshoot.manage')
```

**Capability CHECKs are DB-level intentionally.** IRA compliance is not "app-code polite"; a bad row must be impossible to write. This is the same discipline as `overshoot_strategy_config`'s bounds.

### 1.2 `account_id` FK on strategy-scoped tables

Add `account_id text NOT NULL REFERENCES public.accounts(account_id)` on:

| Table | Rationale |
|---|---|
| `overshoot_lots` | Lots live IN an account. Reconcile/exit already need it. |
| `overshoot_entry_runs` | Sizing basis + BP snapshot are per-account. |
| `overshoot_target_positions` | Allocator output is per-account by construction. |
| `overshoot_equity_snapshots` | Equity curve is per-account; portfolio view aggregates. |
| `overshoot_reconciliation_state` | Broker truth is per-account. |
| `overshoot_audit_logs` | Audit trail must distinguish accounts. |
| `overshoot_alert_dispatch` | Alerts scoped to the account that produced them. |

**NOT tagged (stays global / brain-level):**

| Table | Why global |
|---|---|
| `overshoot_universe` | Universe is a market fact, not an account fact. |
| `overshoot_daily_bars` | Market data. |
| `overshoot_short_interest` | Market data. |
| `overshoot_earnings_calendar` | Market data. |
| `overshoot_detection_runs` | ONE brain — the detector runs once per day. |
| `overshoot_events` | Selection output — one canonical ranked book per day. Account-blind. |
| `overshoot_study_*` | Study corpus is universe-wide, not account-specific. |

This split IS the "one brain, many wallets" principle expressed in the schema.

### 1.3 Honest single-account-today migration

Today N=1. The migration MUST:

1. `INSERT INTO accounts` a single row: `account_id='alpaca_paper_overshoot'`, `broker='alpaca'`, `account_type='paper'`, `margin_max=1.50` (current config), `shorts_allowed=true`, `settlement_regime='margin'`, `allocation_usd=<current strategy_allocation × equity snapshot>`, `credentials_ref='ALPACA_PAPER_*_OVERSHOOT'`.
2. `ALTER TABLE ... ADD COLUMN account_id text` (nullable initially) on every table in §1.2.
3. Backfill: `UPDATE <table> SET account_id='alpaca_paper_overshoot' WHERE account_id IS NULL`.
4. Same-migration `SET NOT NULL` + `ADD CONSTRAINT ... FOREIGN KEY` + halt-on-fail `SELECT count(*) WHERE account_id IS NULL` = 0.
5. Fill-sweep adoption + entry-run inserts write `account_id` at row creation (same pattern as ACT-493 `tier` write-forward).

**Cost today = one migration + a constant literal at every INSERT site.** No allocator, no per-account loop; the engine still runs once, just tagged. This is the "cheap, future-proof" landing in the cost table §6.

### 1.4 W5 measurement-window interaction (the deadline the operator flagged)

**W5 (ACT-506/507/508) measures per-slot-per-day economics on live data starting the current window.** If `account_id` does NOT exist on `overshoot_lots` / `overshoot_entry_runs` / `overshoot_equity_snapshots` before that window closes, retrofitting later means either (a) rewriting hardened measurement queries with a `LEFT JOIN accounts` and a backfill assumption baked in, or (b) losing per-account attribution on the very window that ratifies live economics.

**Ruling requested from operator:** land the §1.3 single-account-today migration BEFORE W5's measurement window hardens (rough deadline: before the first W5 ratification checkpoint). Everything else in this charter can defer; §1.3 is the deadline-bound piece. The cost table §6 makes this explicit.

---

## 2. Deliverable (2) — Engine-touch census

Every site reading broker keys / margin_multiplier / capacity / sizingBase, and what changes when N > 1.

### 2.1 Per-account (must loop / must scope)

| Site | File(s) (indicative) | Change under N accounts |
|---|---|---|
| Broker client construction | `_shared/overshoot-broker/alpaca-paper-client.ts` | Constructor takes `account_id`; secret names derived from `accounts.credentials_ref`, not hardcoded `ALPACA_PAPER_*_OVERSHOOT`. |
| Buying-power / equity fetch | `_shared/overshoot-broker/alpaca-account-fetcher.ts` | Called once per account per pass; result tagged with `account_id`; `equity_snapshot_unavailable` refusal is per-account. |
| Sizing basis (I3) | overshoot entry engine | `capitalBase = accounts.allocation_usd` (not global equity × strategy_allocation_pct). Per-account. |
| `margin_multiplier` read | `overshoot_strategy_config` today, `accounts.margin_max` future | Move authoritative read from global config to per-account capability. Global config becomes DEFAULT for account creation, not the money-path input. |
| Cap arithmetic (ACT-510 / INC-96 LIFO) | entry-run planner | Per-account wallet. INC-96 convergence (T1 slots share the aggregate wallet within an account) applies WITHIN each account; NEVER cross-account. Sleeve rule holds. |
| A5 / reconciliation | `overshoot-portfolio-positions-readonly`, reconcile.ts | Broker call is per-account; reconcile join key becomes `(account_id, symbol, side)`. |
| Equity snapshots | `overshoot-equity-snapshot` job | One row per account per day. Aggregate "portfolio equity" is a `SUM` view, not a fabricated snapshot. |
| Exit engine | `overshoot-exit-run` | Reads `lot.account_id` → picks broker client → submits per-account. Existing tier-conditional lot-local reads (ACT-493) unchanged; `account_id` is another lot-local column. |
| Fill-sweep adoption | `overshoot-fill-sweep` | Writes `account_id` at lot creation, alongside `tier` write-forward (ACT-489/493 pattern). |
| Alerts dispatcher | `overshoot-alerts-dispatcher` | Alert payload tagged with `account_id`; email/log surfaces account. |

### 2.2 Global (stays single-run, account-blind)

| Site | Why global |
|---|---|
| Universe refresh | Market fact. |
| Short-interest ingest | Market fact. |
| Daily bars ingest | Market fact. |
| Detection run (`overshoot-detection-run`) | ONE brain — one detector version, one ranked event set per day. |
| Selection / `overshoot_events` write | ONE canonical book. Accounts do NOT re-rank. |
| Regime bands (ACT-473) | Market fact. |
| Study corpus (ACT-506/507/508/509/511) | Universe-wide, account-blind. |

### 2.3 New surface: the ALLOCATOR

A pure function `allocate(book: RankedEvent[], accounts: Account[]) → TargetPosition[]`:

- Filters each event through each account's capability profile:
  - `shorts_allowed=false` → drops short-side rows for that account.
  - `margin_max=1.0` → sizing capped at cash allocation.
  - `settlement_regime='cash'` → adds unsettled-funds gate (§3.2).
- Slot allocation per account uses that account's `allocation_usd` and its own T1/T2 tier caps.
- Emits `overshoot_target_positions` rows tagged with `account_id`.
- Deterministic given `(book, accounts_snapshot, as_of_date)` — replayable.

**The allocator is the ONLY new business-logic surface.** Everything else is a loop that already existed, now dimensioned by account_id.

---

## 3. Deliverable (3) — IRA capability enforcement

### 3.1 Enforcement layers (defense in depth)

1. **DB CHECK constraints** on `accounts` (§1.1) — IRA rows can NEVER carry `margin_max>1.0`, `shorts_allowed=true`, or `settlement_regime='margin'`.
2. **Allocator predicate** — before emitting a target for an IRA account: `if event.side='short' AND !account.shorts_allowed → drop with typed_refusal='ira_short_forbidden'`.
3. **Entry engine gate** — reads `accounts.margin_max` as sizing ceiling; IRA sizingBase = min(allocation_usd, cash_settled_available).
4. **Broker submission** — order placement for IRA account MUST reject `side=sell_short` at the client layer; typed refusal, never a silent skip.
5. **Reconciliation** — an IRA account showing any short position OR margin usage on the broker side is a P0 alert (money-path integrity breach).

### 3.2 The T1 4-day-turnover × unsettled-funds interaction (good-faith-violation math)

**Cash settlement rule (T+1 as of 2024 SEC change):** proceeds from a sale settle T+1. Buying with unsettled proceeds and then selling BEFORE those proceeds settle = **good faith violation (GFV)**. Three GFVs in 12 months → 90-day settled-cash-only restriction.

**T1 mechanics under ratified ACT-510:**
- Enter T+2, exit T+6 → holding period = 4 sessions.
- Turnover ≈ 63×/yr per slot (per ACT-510 economics).

**In a cash-settled IRA:** if slot proceeds from a T+6 exit are recycled into a new T+2 entry BEFORE T+6+1 settles, that new entry is bought on unsettled funds. If THAT position is then sold before ITS settlement chain completes → GFV.

**Math at ratified T1 slot size (indicative — needs IRA-slot-count parameter):**
- At 63 turns/yr × N slots, the recycle rate is roughly one settlement chain every `252/63 ≈ 4 sessions` per slot. Since the T+6 → T+2-of-next-slot gap is `~1 session`, the buy-side of the next slot is ALWAYS on unsettled funds absent explicit sequencing.
- GFV risk is realized ONLY IF the next slot is sold before settlement. With T+2 entry / T+6 exit (4-session hold) + T+1 settlement, the exit lands on `entry+4 sessions = settlement+3 sessions` — the funds from the PRIOR sale have settled by the time the CURRENT slot exits. **The exit-side sale is settled-cash-clean.**
- BUT: any partial exit, stop, or discretionary early sale WITHIN the 4-session window triggers GFV if that slot was bought on unsettled funds.

**Ruling to surface:** for IRA accounts, the allocator MUST maintain per-slot settled-cash accounting and BLOCK new entries whose funding source is not yet settled — OR accept a hard cap of `slots ≤ floor(allocation_usd / settled_cash_per_slot)` with no recycling faster than T+1. The precise cap requires an IRA-specific slot-count parameter; **flagged as a follow-on decision, not resolved in this charter.**

**Cross-reference:** ACT-510 T1 economics were measured on margin/paper. IRA/cash regime may compress T1 turnover meaningfully; **ACT-510 economics do NOT transfer to IRA without a cash-regime re-run.** This is a first-class caveat for the operator.

---

## 4. Deliverable (4) — Self-competition (same name across accounts)

**Problem:** brain says "buy AKAM T1 slot." Three accounts have AKAM in their allocator output. If all three market in at T+2 09:40 simultaneously, they compete against each other for liquidity, inflate their own entry slippage, and pollute W5's slippage decomposition.

### 4.1 Recommendation (design proposal, NOT ratified)

**Sequential-with-jitter, aggregate-cap-aware.**

- Entry engine iterates accounts in a **deterministic order** (e.g., `ORDER BY account_id` — stable across runs, replayable).
- Per-name **jitter** between accounts: minimum `Δt` (e.g., 30–60s) between successive account entries for the same symbol. Prevents synchronous marketable-limit clashes.
- Aggregate-AUM capacity gate: if `sum(target_notional across accounts for this name) > capacity_cap(name)`, PROPORTIONALLY reduce each account's slot (not first-come-first-serve — that's account-order-dependent and inequitable).
- Capacity cap sourced from W5 slippage decomposition (ACT-506) when it lands — **explicitly deferred: this charter cannot set the cap, only frame the question.**

### 4.2 What W5 must answer

- At what aggregate-AUM-per-name does slippage cross an unacceptable threshold? (ACT-506's decomposition gives the shape; the cap is a ratification input.)
- Does 30–60s jitter measurably reduce cross-account clash? (Live A/B once ≥2 accounts exist.)

**Until W5 lands:** aggregate-AUM cap is set conservatively (e.g., 1.5× current single-account cap) with a tripwire on realized slippage. Documented as provisional.

---

## 5. Deliverable (5) — Credentials pattern under INC-100 discipline

**INC-100 lessons (relevant excerpts):** secrets never live in code; secret NAMES are the seam, values are opaque; account separation is enforced UPSTREAM by secret-name divergence (see `alpaca-paper-client.ts` overshoot copy — the account #2 separation is a secret-name discipline, not a runtime check).

### 5.1 Pattern

- `accounts.credentials_ref` stores a **secret-name prefix** (e.g., `ALPACA_PAPER_OVERSHOOT` → resolves `ALPACA_PAPER_KEY_OVERSHOOT` + `ALPACA_PAPER_SECRET_OVERSHOOT`).
- Broker client factory: `makeClient(account) → new BrokerClient({ keyEnv: account.credentials_ref + '_KEY', secretEnv: account.credentials_ref + '_SECRET' })`.
- N accounts → 2N secrets. Under the 100-secret cap (§api-keys-and-secrets), N up to ~40 is fine; operator target is single-digit.
- **Runtime cross-check (upgrade from current):** at broker-call time, fetch `/v2/account` → assert `broker_account_ref` matches the account row's stored ref. If mismatch → typed refusal `account_ref_mismatch`, halt the money path. Closes the "operator swapped secret values" residual risk noted in the overshoot client's constructor comment.
- **Rotation:** rotate one account's key without touching others; per-account credential_ref makes the blast radius exactly one account.
- **IBKR later:** same pattern, different broker driver; `broker` column selects the driver, `credentials_ref` names the secret set.

### 5.2 What NOT to do (explicitly rejected)

- **Single "master" secret decrypting per-account keys.** Adds a KMS layer for no gain at N < 10; expands blast radius on compromise.
- **Storing full account numbers in DB.** Last-4 only in `broker_account_ref`; full number lives with the broker.

---

## 6. Deliverable (6) — COST TABLE

Three options, honest prices.

### 6.1 Option A — LAND `account_id` NOW, RUN SINGLE-ACCOUNT (recommended default)

**Scope:** §1.3 migration only. `accounts` table with one row; `account_id` NOT NULL FK on the 7 tables in §1.2; INSERT sites write the constant; engine still runs once.

**Cost now:**
- One migration (idempotent, halt-on-fail) — ~2 engineering hours.
- ~7 INSERT-site edits to write the constant `account_id='alpaca_paper_overshoot'` — mechanical, patch-shaped.
- W5 measurement queries acquire an `account_id` dimension for free (single-value today).
- Zero business-logic change. Zero new refusals. Zero allocator. Zero engine loop.

**Cost later (adding account #2):** the allocator (§2.3) + per-account loops (§2.1) + credentials wiring (§5) + IRA enforcement if applicable (§3) — but the SCHEMA does not move.

**Value:** W5's per-slot-per-day economics remain attributable per account for the whole life of the strategy. **No retrofitting hardened measurement queries.**

### 6.2 Option B — FULL MULTI-ACCOUNT NOW

**Scope:** §1 + §2 + §3 + §4 + §5 landed all at once.

**Cost now:**
- Allocator implementation + tests: ~1–2 weeks.
- Per-account loop conversion at every site in §2.1: another ~1 week.
- Credentials + runtime cross-check: ~2 days.
- IRA gates + settled-cash accounting (if any IRA joins immediately): ~3 days + a cash-regime economics re-run of ACT-510 before IRA slots trade.
- W5 disruption: measurement window pauses / re-baselines during rollout.

**Value:** ready-for-N-accounts, but there is NO N-account demand this week; work is speculative until the second account exists.

**Verdict:** premature. Adopt only when account #2 is a scheduled event.

### 6.3 Option C — DO NOTHING UNTIL IBKR

**Scope:** no schema change; strategy_allocation_pct stays global; broker key names stay hardcoded.

**Cost now:** zero.

**Cost later (retrofit AFTER W5 data accumulates):**
- Adding `account_id` to `overshoot_lots` / `overshoot_entry_runs` / `overshoot_equity_snapshots` AFTER they have live-window rows requires: (a) backfill of every historical row to a single account (same UPDATE as Option A but on much more data), (b) rewriting every hardened W5 query that assumed account-blind rows, (c) re-baselining any live ratifications that were computed on the account-blind data.
- Estimated retrofit cost: 3–5× Option A's cost, PLUS re-ratification risk on any decision W5 has already produced.

**Verdict:** most expensive path by construction. Only viable if IBKR is confirmed >12 months out AND W5 is abandoned — neither is true.

### 6.4 Summary

| Option | Now cost | Later cost | W5 attribution | Retrofit risk |
|---|---|---|---|---|
| **A — account_id now, single-run** | ~1 day | Full multi at real N | ✅ from day 1 | ✅ none |
| B — full multi now | 2–4 weeks | 0 | ✅ | ✅ |
| C — do nothing | 0 | 3–5× A + re-ratification | ❌ | ❌ high |

**Recommendation:** **Option A.** Lands before W5 measurement window hardens; costs one migration; buys full future optionality.

---

## 7. Cross-references

- **ACT-489** — `entry_ts` single-homing precedent (same principle now applied to `account_id`).
- **ACT-493** — `tier` on-lot with provenance; same migration shape reused for `account_id` write-forward.
- **ACT-510** — T1 economics ratified on margin/paper regime; DOES NOT transfer to IRA cash regime without re-run (§3.2 caveat).
- **ACT-506 (W5)** — slippage decomposition; provides the aggregate-AUM cap for §4.
- **ACT-511** — supply expansion; orthogonal to accounts (more names, not more wallets).
- **INC-96** — LIFO / aggregate-wallet convergence; applies WITHIN each account, NEVER cross-account.
- **INC-100** — secrets discipline; §5 pattern conforms.
- **DEC-068 (paper-only URL fence)** — unchanged; each account's broker client inherits the same fence.

---

## 8. STOP conditions (this charter)

This charter is **investigation-only**. It produces:
1. The schema design in §1.
2. The engine-touch census in §2.
3. The IRA enforcement design + GFV math frame in §3.
4. The self-competition design + W5 dependency in §4.
5. The credentials pattern in §5.
6. The cost table in §6.

**No code, no migrations, no adoption.** Operator ratification decides:
- Which option (A / B / C) to adopt.
- Whether Option A's migration lands BEFORE the W5 measurement window hardens (§1.4).
- Whether the IRA cash-regime re-run of ACT-510 is chartered before any IRA slot trades (§3.2).
- Whether self-competition sequencing (§4) is provisionally set to the recommended sequential-with-jitter or deferred.

A follow-on execution charter (ACT-513+) will implement whichever option is ratified.