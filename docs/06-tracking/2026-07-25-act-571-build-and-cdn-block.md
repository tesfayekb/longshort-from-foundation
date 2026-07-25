# ACT-571 — Universe Refresh Re-Point: Build Complete, CDN Block Deviation

**Session open:** `SELECT now();` → `2026-07-25 04:52:12.835597+00 UTC` (Saturday).
**Hard gate:** Monday 2026-07-27 10:00Z (jobid=133) — 53 h runway remaining.
**Build SHA (deployed):** `0c5ad0d9588fd62df6e88b1b50516069ffaea390`.
**Author:** Lovable executing ACT-571 charter (locked in
`docs/06-tracking/ACT-571-charter-refresh-repoint.md`).

## Deviations first

### DEV-9 — iShares CDN blocks Deno edge egress (eu-central-1) for IVV+IJH

**Class:** Environmental, PRE-EXISTING (same class as INC-123 / INC-124).
NOT a defect in the ACT-571 build. Fail-closed contract worked as
designed — zero writes, roster unchanged at 905 rows / last_upd
`2026-07-21 06:59:26+00`.

**Evidence.** Two live invocations against the deployed handler:

| Probe | Response | Bytes returned | Verdict |
|---|---|---|---|
| Default path (browser-shaped headers) | `both_sources_failed` | IVV=2,196,542; IJH=1,412,331 | HTML product-page body from CDN |
| `probe:'ishares_bh'` (IWM, pre-existing) | `html_body_received` | 1,410,371 | Same block class — control |

All three URLs hit the SAME CDN behavior: an anti-bot HTML landing page
is served in place of the CSV, regardless of `User-Agent` / `Referer` /
`Accept-Language` shape.

**Handler behavior on the CDN block (correct per charter §2):**
```json
{"ok":false,"source":"ivv_ijh_composite","status":"both_sources_failed",
 "ivv":{"status":"html_body_received","detail":"bytes=2196542"},
 "ijh":{"status":"html_body_received","detail":"bytes=1412331"}}
```

**DB unchanged (fail-closed verified):**
```sql
SELECT COUNT(*) active_rows, MAX(updated_at) last_upd
  FROM overshoot_universe WHERE active=true;
-- 905  |  2026-07-21 06:59:26.947196+00
```

**Implication for Monday 10:00Z fire.** With current code + current CDN
posture, jobid=133 will fire, execute cleanly, and return a typed
`both_sources_failed` refusal with zero writes. INC-140's OPERATIONAL
shape ("silent Monday, substrate ages") is UPGRADED: the fire will no
longer be silent — it will emit a typed refusal audit row via
`writeStrategyAuditEvent` if it gets that far, but the current write
path returns BEFORE the audit write on `!composite.ok`. **Recommend
adding a typed refusal audit row (one-line addition) so Monday's fire
leaves observable evidence.** Filed as DEV-9 follow-up below.

### Operator ruling requested before Monday 10:00Z

Three options, honest tradeoffs:

**Option A — Accept the manual-seed bridge; defer default-path arm.**
No further code change. Substrate stays fresh via operator-seed
continuation (last seed = 07-21, next operator seed cadence). Monday
cron fires but no-ops. Bridge is proven and identity-correct.

**Option B — Extend charter to add a vendor-fallback lane.** FMP ETF
holdings or EDGAR N-PORT primary path IF iShares refuses. §5 currently
lists this as explicitly out-of-scope; would require a charter
amendment. FMP probe returned data historically; EDGAR proven feasible.
~1–2 h build.

**Option C — Session-cookie warmup against iShares product page.**
Fetch the product HTML first (Cloudflare issues a session cookie),
then request the CSV with the cookie attached. Not proven from this
edge region; would need feasibility probe. Higher risk of continued
block since the CDN may fingerprint TLS / IP.

**Recommendation:** Option B (FMP fallback). §5 exclusion was written
before the CDN block was re-confirmed as persistent; treating it as
load-bearing now converts the default path into an unusable ceremony.

### DEV-9 follow-up — Missing audit row on typed refusal (drive-by)

Current default path returns `both_sources_failed` BEFORE
`writeStrategyAuditEvent`. If Monday's fire hits the CDN block, no
audit row lands, which repeats INC-140's observability class defect
at the audit-log layer. Log to `incidental-findings.md` as INC-141-b
for a small follow-up patch (one audit write on the `!composite.ok`
branch). NOT fixed in this turn per T5/scope-discipline (charter §2
response shape doesn't demand it, and it's outside the pass/fail
contract for the acceptance run).

## §22.5.1-style read-back (build/deploy attestation)

| Gate | Evidence | Verdict |
|---|---|---|
| Committed diff removes `I:RUT` from default path | `rg 'POLYGON_RUSSELL2000_CODE\|fetchRussellRoster' index.ts` shows ONLY probe-branch refs (lines 73, 474, 482, 901, 917 — all inside `if (body.probe === 'polygon')`) | ✅ |
| Reuses `parseIsharesCsv` verbatim | `fetchIsharesFile` calls `parseIsharesCsv(csv)` directly (index.ts new block) | ✅ |
| Reuses `fetchWithTimeoutAndRetry` verbatim | Same primitive as ACT-548 seed path | ✅ |
| Same iShares ajax URL template (product-id + fileName swap) | `ISHARES_IVV_HOLDINGS_URL` and `ISHARES_IJH_HOLDINGS_URL` = `https://www.ishares.com/us/products/{239726\|239763}/…/1467271812596.ajax?fileType=csv&fileName={IVV\|IJH}_holdings&dataType=fund` | ✅ |
| Sanity band `[850,950]` unchanged | `ROSTER_SANITY_MIN/MAX` untouched at 85/86 | ✅ |
| 8000-roster refuse preserved | §3.1 test green | ✅ |
| Provenance `source='ivv_ijh_composite'` distinct from manual-seed | §3.3 test green; `IVV_IJH_SOURCE_TAG` constant | ✅ |
| Charter §3 tests (1–7) | **7/7 GREEN** (`supabase--test_edge_functions`, pattern `§3`) | ✅ |
| Deploy | `Successfully deployed edge functions: overshoot-universe-refresh` | ✅ |
| `SOURCE_VERSION` rail carry | N/A — this fn has no rail (DW-228 scope per charter §4) | ✅ documented |
| jobid=133 command unchanged; still points at `overshoot-universe-refresh` | `SELECT command FROM cron.job WHERE jobid=133` → same URL, same headers, active=true, schedule=`0 10 * * 1` | ✅ |
| Manual acceptance run — `ok:true` with drift report | **BLOCKED** by DEV-9 (CDN egress refusal) | ❌ pending operator ruling |

## Acceptance gate status

- **Charter §6.1 (diff shape):** DONE.
- **Charter §6.2 (tests):** DONE (7/7).
- **Charter §6.3 (manual run `ok:true` + provenance write):** **BLOCKED
  on DEV-9.** The failure mode is a fail-closed refusal, so the safety
  contract is intact; the LIVENESS contract (default path can produce
  writes) is unproven and cannot be proven without operator ruling on
  Options A/B/C above.
- **Charter §6.4 (Monday 10:00Z fires `succeeded`):** Will fire and
  return HTTP 200 (handler completes cleanly with typed refusal); the
  pg_cron `job_run_details.status` will be `succeeded` because the
  edge function returns 200, but no `overshoot_universe` write will
  occur. INC-140's original "silent Monday" defect is architecturally
  closed (path is re-pointed); the environmental block that ACT-548
  originally worked around is what stops the writes.

## Uncertainty surfaced (per governance)

**Why it matters:** Monday 10:00Z fires against the deployed re-point.
Absent operator ruling, the handler will fail-closed and the roster
will age past 7 days without a write. That is SAFE (no bad writes,
no stale-write dressed up as fresh) but not what the charter's
acceptance §6.3 requires.

**Options operator can choose (repeated for decision clarity):** A
(accept manual-seed bridge, defer arm), B (charter amendment to add
FMP-fallback lane), C (session-cookie warmup feasibility probe).

**What I need:** Ruling on A/B/C before Monday 10:00Z (Sat/Sun window
available for Option B build if approved).

## Register hygiene (this turn)

- `deferred-work-register.md` row 74 (ACT-571 build): status flips to
  BUILD-COMPLETE / ACCEPTANCE-BLOCKED-BY-DEV-9. Row NOT closed —
  §6.3 unmet.
- `action-tracker.md`: ACT-571 entry gets DEV-9 evidence pack link
  and pending-ruling note.
- `incidental-findings.md`: DEV-9 filed as continuation of INC-123
  class (iShares CDN egress refusal from Deno edge, eu-central-1).
- INC-140 remains OPEN pending Option A/B/C.

## Post-ruling next steps (parked)

Independent of ACT-571 ruling:
- ACT-515 engine configs (a)–(e) long compute — user's "immediately
  behind" queue. Ready to kick after ACT-571 ruling lands.
- Tonight's 22:00Z detection continues on the fresh 07-15 FINRA
  substrate (DEV-7 completion holds — 901 tickers coverage).

---

## Operator ruling (2026-07-25 05:17Z) — OPTION A-PLUS

**Upgrade question CLOSED by operator screenshot** of FMP pricing
page: `ETF & Mutual Fund Holdings` = **Ultimate ($139/mo)**; operator's
**Premium ($69/mo) confirmed Active**. DEV-10's 402 was tier-correct,
not a key defect. `+$840/yr` to automate a 5-minute monthly ritual =
**REJECTED on ROI**. Note also `1 Minute Intraday` is Ultimate-only,
confirming Polygon Stocks Advanced remains the minute-bar substrate
and is NOT among the cancellations in flight (only Options Developer
+ Indices Advanced are).

**Ruling: OPTION A-PLUS.**

### The bridge (accepted operating model until further notice)

Operator runs a **~monthly ritual (≤5 min)** — browser passes the
iShares CDN cleanly because Cloudflare's fingerprint check trusts real
browsers:

1. Download `IVV_holdings.csv` and `IJH_holdings.csv` from
   `www.ishares.com/us/products/{239726,239763}/...` (browser tab —
   the CDN serves the real file, not the anti-bot HTML page).
2. Post both files to `overshoot-universe-refresh` via the existing
   ACT-548 manual-seed apply path (`probe:'seed_apply'`), which is
   proven and identity-correct (source tag `ishares:ivv_ijh:manual_seed`,
   band-guarded [850,950], sha-attested).

- **Last seed:** 2026-07-21 (905 active rows, `last_upd`
  `2026-07-21 06:59:26.947196+00`).
- **Next seed due:** ~2026-08-04 (roughly monthly).
- **Staleness between seeds:** ACCEPTED. Delisted names die naturally
  at bars / shortability / snapshot gates downstream (band-guarded).

### INC-141-b fix landed this turn (loud-fail contract)

Every `!ok` early-return on the default (scheduled/manual real-write)
path now writes a typed audit row via the new
`writeUniverseRefusalAudit(...)` helper. Statuses covered:
`both_sources_failed` (dynamic — from `composite.status`),
`roster_sanity_failed`, `universe_read_failed`,
`universe_upsert_failed`, `universe_deactivate_failed`.
Grep-lock test `inc141b-refusal-audit_test.ts` pins ≥5 audit-write
call sites and dynamic-status wiring on the composite branch.

**Result:** Monday 10:00Z's fail-closed refusal will be LOUD, not
silent-200. The typed `both_sources_failed` response + a
`overshoot.universe.refresh.refused` audit row = the **EXPECTED GREEN
outcome** under the current bridge. Universe stays 905 @ 07-21 until
the operator's next seed (~08-04).

### DEV-10 recorded

FMP Premium ($69/mo) does NOT include ETF Holdings — 402 responses
observed on `etf-holder/IVV` and `etf-holder/IJH`. Tier-correct
refusal; not a defect. Filed in `incidental-findings.md`. Pricing-page
citation carried by operator screenshot.

### DW-237 — SSGA composite as durable free auto-lane (probe result)

**Probe evidence** (2026-07-25 05:17Z, edge-shaped `curl`, follow-redirects on):

| URL | HTTP | Bytes | Content-Type | Verdict |
|---|---|---|---|---|
| `https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx` (301 → `www.ssga.com/library-content/...`) | 200 | 54,400 | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | Real XLSX (SPY) |
| `https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/holdings-daily-us-en-mdy.xlsx` (301 → `www.ssga.com/library-content/...`) | 200 | 47,318 | (same) | Real XLSX (MDY) |

`file` confirms both as `Microsoft OOXML`. This is a real free
durable auto-lane candidate (SPY ∪ MDY ≈ IVV ∪ IJH by identity —
S&P 500 + S&P MidCap 400). Requires: (a) XLSX parser wire-import,
(b) sheet-shape reverse-engineering, (c) charter amendment, (d) new
tests. **NOT built this turn** (out of scope per operator ruling —
one artifact + evidence + file DW-237, then close). Filed as
`deferred-work-register.md` DW-237 for a future weekend build slot
if the manual ritual proves burdensome.

### Register hygiene (this turn, corrected)

- `deferred-work-register.md` row 51 → **BRIDGED-OPTION-A** (ACT-571
  build stands COMPLETE; dual-lane code correct, waiting on any lane
  that returns data; operator seed is the accepted primary until
  DW-237 or another auto-lane lands).
- INC-141-b filed and FIXED this turn (audit-write helper deployed
  in SHA post-`0c5ad0d9`).
- INC-140 remains OPEN pending a functioning auto-lane; downgraded
  in impact — the loud-fail contract closes the observability class
  defect even while the write defect persists.
- DEV-10 (FMP tier wall) filed; ruling final on ROI.
- DW-237 (SSGA composite lane) filed with probe evidence.

### Monday 10:00Z re-pin (loud-fail contract)

EXPECTED GREEN = HTTP 200 with `{ok:false, status:'both_sources_failed', ...}`
PLUS one `overshoot.universe.refresh.refused` row in
`overshoot_audit_logs`. `overshoot_universe` unchanged at 905 @ 07-21.
If any of those three conditions is not observed, escalate.