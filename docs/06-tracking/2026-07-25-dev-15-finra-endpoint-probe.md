# DEV-15 — FINRA Reg SHO Daily Endpoint Probe (ACT-570 Phase-1 GATE)

**Filed:** 2026-07-25 06:09Z  •  **Clock:** `SELECT now() → 2026-07-25 06:07:44Z`
**Verdict:** ⛔ **STOP — SURFACE DIFFERS FROM CHARTER ASSUMPTIONS.** History depth is ~1 year rolling, NOT 17 years as assumed. Pre-committed n≥200/quintile gate is UNREACHABLE on the Phase-0 runner corpus using this endpoint alone. Operator ruling required before MIG.

---

## §1 — WHAT THE ENDPOINT ACTUALLY IS

| dim | probe result |
|---|---|
| **Base URL** | `https://api.finra.org/data/group/otcMarket/name/regShoDaily` |
| **Auth model** | **OPEN / NO KEY REQUIRED**. Cloudflare-fronted, public regulatory dissemination. |
| **Method** | `POST` with JSON body preferred (GET works but IN/sort filters buggy via querystring urlencode). |
| **Response** | `text/plain` CSV, quoted values, header row. |
| **Schema** | `tradeReportDate, securitiesInformationProcessorSymbolIdentifier, shortParQuantity, shortExemptParQuantity, totalParQuantity, marketCode, reportingFacilityCode` |
| **Rate limit** | No 429 or Retry-After header observed in ~15 probes over 90s. `cf-ray` fronting; no documented limit hit. Conservative call plan: ≤2 req/s. |
| **Max page size** | `record-max-limit: 5000` |
| **Payload cap** | `response-payload-max-size: 3mb` |
| **Total records in dataset (right now)** | **6,794,652** |
| **Per-session rows (all tickers all venues)** | ~27,500 (07-22: 27,730; 07-23: 27,745; 07-24: 27,555) |
| **T-1 recency** | ✓ 07-24 published; 07-25 (today, Saturday) empty as expected |
| **Multi-venue rows per (ticker, date)** | typically 3 rows: `B/NCTRF` (TRF Chicago), `Q/NQTRF` (Nasdaq TRF), `N/NYTRF` (NYSE TRF); OTC names add `O/ORF`. **Must SUM across venues** to derive daily SVR. |

---

## §2 — TWO-TICKER LIVE PROBE (AAPL, 2026-07-22)

```json
POST /data/group/otcMarket/name/regShoDaily
{"limit":10,"compareFilters":[
  {"fieldName":"tradeReportDate","fieldValue":"2026-07-22","compareType":"EQUAL"},
  {"fieldName":"securitiesInformationProcessorSymbolIdentifier","fieldValue":"AAPL","compareType":"EQUAL"}
]}
```
**Response** (verbatim, record-total: 3):
```
"tradeReportDate","securitiesInformationProcessorSymbolIdentifier","shortParQuantity","shortExemptParQuantity","totalParQuantity","marketCode","reportingFacilityCode"
"2026-07-22","AAPL","89697.171560","10.000000","211410.188684","B","NCTRF"
"2026-07-22","AAPL","4422558.766562","56070.000000","9839906.069881","Q","NQTRF"
"2026-07-22","AAPL","146795.185430","100.000000","589918.117820","N","NYTRF"
```
**Derived AAPL 2026-07-22:**
- ΣshortParQuantity = **4,659,051.12**
- ΣtotalParQuantity = **10,641,234.38**
- **SVR = 43.78%**

NVDA IN-filter attempt failed: `{"fieldValues":["AAPL","NVDA"], "compareType":"IN"}` returns `400 "Unable to parse request body."` — same with comma-separated `fieldValue`. **IN unsupported via this shape** — must issue per-ticker or fetch full-day.

---

## §3 — 🔴 HISTORY DEPTH — CHARTER ASSUMPTION REFUTED

**Charter assumption:** "FINRA retains Reg SHO Daily from 2009-08-03 → T−1."
**Reality (probed):**

| date probed | record-total |
|---|---|
| 2009-08-03 | **0** |
| 2010-01-04 | **0** |
| 2015-01-05 | **0** |
| 2020-01-06 | **0** |
| 2024-01-03 (weekday) | **0** |
| 2025-01-02 | **0** |
| 2025-04-01 | **0** |
| 2025-07-01 | **0** |
| **2025-08-01** | **26,183** ← **FIRST FULL DAY** |
| 2025-09-02 | 26,588 |
| 2025-10-01 | 26,853 |
| 2025-11-03 | 27,921 |
| 2025-12-01 | 27,024 |
| 2026-01-02 | 27,462 |
| 2026-07-22 | 27,730 |
| 2026-07-24 | 27,555 |

**Retention window:** **~1 year rolling** (2025-08-01 → T−1). Math check: 6,794,652 total / 27,500 per session ≈ **247 trading days** ≈ ~11.5 months. Matches probe evidence exactly.

**This is a rolling-window regulatory-dissemination endpoint, not a historical archive.**

---

## §4 — IMPACT ON PRE-COMMITTED GATE

ACT-570 Phase-1 §7.2 pre-commit: **quintile-5 fwd-5d ≤ −100 bps ∧ rev ≥ 0.60 ∧ monotone; n≥200 per quintile**.

Runner corpus by year (from Phase-0 §4):

| year | n | covered by endpoint? |
|---|---|---|
| 2022 | 465 | ❌ |
| 2023 | 242 | ❌ |
| 2024 | 210 | ❌ |
| 2025 (Jan-Jul) | 389 | ❌ (endpoint starts 2025-08-01) |
| 2025 (Aug-Dec, estimated) | ~250 | ✓ |
| 2026 H1 | 387 | ✓ |
| **In-coverage total** | **~637** | ✓ |

**~637 / 5 quintiles ≈ 127/quintile.** Falls BELOW the pre-committed n≥200/quintile floor. Gate is **UNREACHABLE on the Phase-0 corpus with this endpoint alone**.

**Additionally:** 2022 bear-regime slice (n=465, the only year that showed reversal in Phase-0) is ENTIRELY OUT OF COVERAGE. The one regime where the runner-short thesis had a pulse is invisible to this ingest.

---

## §5 — OPTIONS FOR OPERATOR RULING

**Option A — Accept the surface, run steady-state forward.**
Ingest 2025-08-01 → present now (~247 days × ~6 pages = ~1,500 calls one-shot); daily cron thereafter. Phase-1 SVR-quintile gate DEFERRED until n≥1000 accrues (~2028 at current runner arrival rate). Strategy value survives (SVR is useful substrate for ACT-506 borrow-observability, ACT-572 shadow-lane, future short work) even if Phase-1 verdict is postponed.

**Option B — Sourcing pivot.**
FINRA also publishes **bulk historical daily files** at `cdn.finra.org/equity/regsho/daily/CNMSshvol{YYYYMMDD}.txt` (and per-facility variants) — public, no API, no key. Retention appears to be full history 2009-present. This is the archival lane FINRA regulators use. ~4,500 files for 2022-01-01 → present at ~200KB each. Would need HTML/CDN listing scrape then per-file GET. Higher build cost but unblocks the pre-committed gate. **Recommended for Phase-1 sourcing IF operator wants gate honored as pre-committed.**

**Option C — Loosen the gate.** Post-hoc weakening. Governance-forbidden absent explicit ruling.

**Option D — Hybrid (A + B).** Land Option A now (ingest + daily cron on api.finra.org for steady-state, real-time freshness). Chart Option B (CDN bulk archive) as ACT-570 Phase-1b for historical backfill. Two ingest lanes, distinct provenance stamps (`finra_api` vs `finra_cdn_archive`), Phase-1 gate runs on the union.

**Supervisor recommendation:** Option D. Steady-state lane is cheap and unblocks ACT-506/572 immediately; archive lane is the honest path to the pre-committed gate. No governance compromise; no waiting.

---

## §6 — WHAT PROBES DID NOT COVER (deferred until ruling)

- CDN archive endpoint probe (`cdn.finra.org/equity/regsho/daily/*`) — pending Option-B/D go.
- ADF (Alternative Display Facility) partition — appears in a different dataset `regShoDailyAdf`; not probed.
- SIP symbol → ticker mapping caveat (BRK.A vs BRK-A vs BRKA — exchange-specific); needs a normalizer.
- OTC-only names (`marketCode='O'`) — irrelevant to our exchange-listed universe but present in row counts.

---

## §7 — CALL-BUDGET RE-ESTIMATE (per option)

| option | one-shot backfill calls | steady-state daily calls | wall time est. |
|---|---|---|---|
| A | ~1,500 (247d × 6 pages) | ~6/day | ~15 min one-shot at 2 req/s |
| B (CDN archive) | ~4,500 files (2022-2026) at ~200KB each | (n/a — bulk files, mirrors API for T-1) | ~1 hr one-shot |
| D | A + B combined | ~6/day | ~1.25 hr one-shot |

All bounded; none are budget concerns. **The blocker is not compute, it is data coverage vs the pre-committed gate.**

---

## §8 — GATE STATE

⛔ **HALT.** No MIG, no ingest fn, no code changes this turn. Charter honored: "STOP if the surface differs from charter assumptions."

Next-turn deliverables (post-ruling):
- If Option A → MIG + `overshoot-finra-regsho-ingest` + one-shot backfill + coverage table + honest DEFERRED-N tag on Phase-1 SVR test.
- If Option B or D → additional CDN-archive probe (~5 min) BEFORE the D3-epoch MIG lands, so both provenance stamps ship together.