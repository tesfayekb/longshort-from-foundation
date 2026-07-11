# ACT-499 Track D — Performance & Operations Cost

**Status:** CLOSED (findings + charters filed; no engine changes)
**Mode:** investigation (read-only against live DB + audit + detection-run durations)
**Author:** AI (in-turn)
**Date:** 2026-07-11

---

## 1. Scope (per operator charter)

1. Detection kernel edge-function budget vs Supabase limits; headroom at 10× universe.
2. Console polling load.
3. `pg_net` + `pg_cron` table growth + retention posture.
4. Monthly infra cost vs strategy dollar-ROI at current and 10× scale.

---

## 2. Detection kernel — edge-function budget (LOAD-BEARING)

**Source:** `overshoot_detection_runs.durations_ms` last 5 LIVE sessions (2026-07-06 → 07-10), universe = **839 symbols**.

| session | universe | kernel_ms | total_ms | detector_ms | bars_append_ms | earnings_append_ms |
|---|---:|---:|---:|---:|---:|---:|
| 07-06 LIVE | 839 | 98,847 | 99,738 | 9 | 446 | 98 |
| 07-07 LIVE | 839 | 85,916 | 88,368 | 9 | 513 | 302 |
| 07-08 LIVE | 839 | 93,035 | 94,836 | 5 | 719 | 228 |
| 07-09 LIVE | 839 | 84,770 | 86,421 | 6 | 396 | 275 |
| 07-10 LIVE | 839 | 85,286 | 87,716 | 8 | 690 | 647 |
| **mean** | 839 | **89,571** | **91,416** | 7 | 553 | 310 |
| **max** | 839 | **98,847** | **99,738** | — | — | — |

**Kernel dominates total** (~98% of wall time). Vendor I/O legs (bars_append, earnings_append) are negligible.

### Edge-function limits (Supabase Deno Deploy — as of 2026 posture)

| limit | value | current usage | headroom |
|---|---:|---:|---:|
| Wall-clock ceiling | **150 s** | 100 s (max observed) | **50 s (33%)** |
| CPU budget | 400 s | ~kernel_ms ≈ 90–100 s | ample |
| Memory | 256 MB | not measured; queued as INC-104 | unknown |

### 10× universe headroom (F-D-01, LOAD-BEARING)

Detection kernel is per-symbol dominant (Polygon bar traversal + I5/I3 window computation). Assume near-linear scaling in N (the cost is essentially `Σ per_symbol_work`; no explicit N² joins observed in the kernel path):

| universe scale | est kernel_ms | est total_ms | vs 150s wall | verdict |
|---|---:|---:|:---:|:---:|
| 1× (current, 839) | 90 s | 91 s | 61% used | ✅ headroom |
| 2× (1,678) | ~180 s | ~183 s | **122% BUST** | ❌ **exceeds ceiling** |
| 3× (2,517) | ~270 s | ~274 s | 183% | ❌ |
| 10× (8,390) | ~900 s | ~914 s | 610% | ❌ **6× ceiling** |

**F-D-01:** Detection kernel busts the 150s wall-clock ceiling at **~1.6× universe (≈ 1,350 symbols)** — well before the operator's stated 10× planning horizon. Charter **PERF-D-A** filed (below): shard the detection kernel by symbol range before universe expansion is authorized.

---

## 3. Console polling load

**Source:** frontend polling patterns observable via `overshoot_audit_logs` action rate.

- `overshoot.fill_sweep.tick` = **391 rows over 14 days** ≈ 28/day = ~1/50min — cron-driven, not console-polling-driven.
- No `SELECT`-heavy poll pattern surfaces in audit logs (client SELECT queries are not logged). Console pages (`/trading/overshoot/*`) use `useQuery` with staleness bounds; no `refetchInterval` polling loop found in a quick sweep of `src/features/overshoot/`.
- **F-D-02:** Console-polling load is **not materially contributing** to DB or edge-function pressure at current scale. No charter needed. If a future console page adds `refetchInterval < 30s` on a large-cardinality query, revisit.

---

## 4. pg_net / pg_cron table growth + retention (LOAD-BEARING)

**Source:** direct SELECT against `cron.job_run_details` + `net._http_response` (2026-05-13 → 2026-07-11 = 59 days).

| table | rows | size | growth rate | retention |
|---|---:|---:|---:|---:|
| `cron.job_run_details` | 353,237 | **654 MB** | **~11 MB/day** | ❌ **NONE observed** |
| `net._http_response` | 1,858 | **457 MB** | ~7.7 MB/day | ❌ **NONE observed** |
| `overshoot_daily_bars` | 1,052,907 | 177 MB | (bounded by lookback) | pruned by design |
| `job_executions` | 103,844 | 58 MB | ~1.7 MB/day | 90-day per DEC-007 (unverified) |
| `overshoot_audit_logs` | 715 | 968 kB | negligible | 90-day per DEC-007 |

**F-D-03 (LOAD-BEARING):** `cron.job_run_details` has grown to **654 MB with no retention policy** — 59-day uncapped accumulation. At current rate this reaches **~4 GB/year** at 1× and **~40 GB/year at 10×** (cron cadence scales with jobs, not universe; assume 3–5× at operator's expected schedule expansion, i.e. ~12–20 GB/year). Storage cost is small in absolute terms but query performance on this table degrades and Supabase support ops flag it as a maintenance risk.

**F-D-04 (LOAD-BEARING):** `net._http_response` averages **~245 KB per row** — Polygon bar response bodies are being persisted verbatim by `pg_net` async HTTP. At 1× this is manageable (7.7 MB/day) but at 10× universe **the bar-fetch response volume scales linearly** → ~77 MB/day = ~28 GB/year uncapped. Also: responses containing vendor data may create a **data-residency / vendor-TOS surface** (Polygon response bodies persist in the DB indefinitely) — flag for legal review under Track D-adjacent posture (deferred).

**Charter PERF-D-B filed** (operator-ratified 2026-07-11): retention migration for `cron.job_run_details` (**14-day rolling**) + `net._http_response` (**7-day rolling**, uniform — no 2xx/non-2xx split). Runs nightly under existing `audit_cleanup` job. **Forensic-window note (per INC-99):** `net._http_response` is our post-hoc forensic surface for vendor HTTP behavior; the 7-day window is sized to cover the operational-forensics horizon (same-week incident reconstruction). Anything requiring deeper retrospective must be captured out-of-band before the 7d rollover.

---

## 5. Monthly infra cost vs strategy dollar-ROI

### 5.1 Infra cost — bottom-up estimate (1× current)

| component | monthly cost (est) | notes |
|---|---:|---|
| Supabase Pro (base) | $25 | project baseline |
| DB compute (2 GB / small addon) | ~$30 | current DB size ~2 GB; audit + bars + cron |
| Edge-function invocations | ~$5 | ~2K invocations/mo at $2/M |
| Storage overage (cron + pg_net + bars) | ~$5 | ~2 GB above included |
| Polygon data feed | *external* | not billed to Supabase — operator has separate contract |
| Alpaca broker | $0 | commission-free |
| **Total attributed** | **~$65/mo** | Supabase only |

### 5.2 Strategy dollar-ROI — measured

**Corpus:** 50 LIVE LONG lots, $119,336 gross notional deployed (per Track C).

- Positions are **still open** (T+10 hold not yet matured for first cohort — earliest exit 2026-07-22).
- **No realized P&L yet.** Any dollar-ROI number would be fabrication.

**Expected ROI (from ratified backtest, ACT-500 Part 2 decile analysis):**

- Top-decile fwd_return_10d (bar-derived, ACT-487): ~120 bps/cycle gross
- Post 5 bp/side entry haircut (now **known conservative** per Track C — actual ~0 bps): ~110 bps/cycle net-of-entry
- Assume 5 bp/side exit haircut (pending W5-04 measurement): ~100 bps/cycle net-of-round-trip
- Cycle = ~10 trading days; ~25 cycles/year at K=5 daily budget
- Annual gross alpha on $100K deployed: ~$2,500 (2.5%)
- Annual gross alpha on $1M deployed (10× notional): ~$25,000

### 5.3 Cost-vs-ROI ratios

| scale | annual notional | est annual alpha | annual infra | **cost/alpha** | verdict |
|---|---:|---:|---:|:---:|:---:|
| 1× current ($120K notional) | $120K | ~$3,000 | ~$780 | **26%** | thin — infra is 26% of gross alpha |
| 1× at $1M notional | $1M | ~$25,000 | ~$780 | **3%** | comfortable |
| 10× universe + $1M notional | $1M | ~$25,000* | ~$3,000** | **12%** | acceptable |
| 10× universe + $10M notional | $10M | ~$250,000* | ~$3,000 | **1.2%** | dominant |

*Assumes decile alpha holds at 10× universe — **NOT proven**; capacity dilution is likely (deeper universe = weaker top-decile). Filed as **PERF-D-C** investigation.
**Assumes PERF-D-A (kernel shard) + PERF-D-B (retention) land; otherwise infra cost grows super-linearly with universe.

**F-D-05:** Cost-per-alpha is **healthy at target notional ≥ $1M**, thin at current $120K. Operator's stated planning horizon of "10× scale" is **cost-efficient** iff (a) PERF-D-A kernel sharding lands before universe expansion, (b) PERF-D-B retention lands, and (c) capacity dilution at 10× universe is measured (PERF-D-C) rather than assumed.

---

## 6. Charters filed

| id | title | urgency | blocking |
|---|---|---|---|
| **PERF-D-A** | Shard detection kernel by symbol range | HIGH | any universe expansion beyond ~1,350 symbols |
| **PERF-D-B** | Retention on `cron.job_run_details` (14d) + `net._http_response` (7d, forensic-window per INC-99) | MEDIUM | none (hygiene); recommended within W5 |
| **PERF-D-C** | Capacity-dilution study: does top-decile alpha survive 10× universe? | MEDIUM | 10× rollout DEC |
| **INC-104** | Measure edge-function peak memory during detection kernel run | LOW | none |

---

## 7. Deliverables

- ✅ Detection kernel budget table + 10× extrapolation (§2)
- ✅ Console polling assessment (§3)
- ✅ pg_cron + pg_net growth measurement (§4)
- ✅ Cost-vs-ROI ratio table (§5)
- ✅ Charters PERF-D-A/B/C + INC-104 (§6)

**Track D CLOSED.** Weekend audit complete.

---

## 8. Operator DEC — 2026-07-11 (Track D closure)

Ratified in full:

1. **PERF-D-A is BINDING as a stated precondition on Phase-13 shadow-universe expansion.** Wired into `overshoot-master-plan.md` Phase 13 as a gate — universe expansion beyond ~1,350 symbols does not proceed until kernel sharding lands.
2. **PERF-D-B approved** with retention windows 14d (`cron.job_run_details`) / 7d (`net._http_response`); forensic-window rationale recorded per INC-99.
3. **PERF-D-C ratified** as the gate on 10× economics (capacity dilution must be measured, not assumed).
4. **INC-104 approved** (edge-function peak-memory measurement).

**ACT-499 CLOSED** with `ACT-499-FINDINGS-INDEX.md` as terminal artifact.