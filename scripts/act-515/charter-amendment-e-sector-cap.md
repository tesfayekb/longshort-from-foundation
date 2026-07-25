# ACT-515 Charter Amendment — (e) Sector-Cap Config

**Filed:** 2026-07-25T05:34:12Z. Executes operator ruling B2: amend
charter to add (e) sector-cap with pre-committed levels; evidence-
first on sector-metadata availability; do NOT fabricate GICS
classifications.

## 1. Amendment scope

Charter §1 currently defines configs (a)–(d):

| Row | Config | Sizing / posture |
|---|---|---|
| R1 | 1.0x const | baseline |
| R2 | 1.0x comp | baseline compounded |
| R3 | 2.0x const | leverage flat notional |
| R4 | 2.0x comp | leverage compounded |
| R5 | SPY buy-and-hold | benchmark |
| d1/d2/d3 | regime-exit counterfactual | overlay on R4 |

**This amendment adds (e):** sector-concentration cap overlay,
applicable to any of R1..R4. Primary read overlays R4; R1 overlay is
the uncoupled comparison.

## 2. Pre-committed cap levels

| Level | Cap | Rationale |
|---|---|---|
| e0 | uncapped (baseline) | matches R1..R4 as filed — required for delta computation |
| e1 | **30% notional per GICS sector** | industry-standard concentrated-but-diversified ceiling; ~3x SPY's largest sector weight (Technology ~28% as of 2026-07) |
| e2 | **20% notional per GICS sector** | tighter concentration ceiling for stress reads; near SPY's largest sector weight |

**Cap enforcement:** at admit time, refuse a new lot if adding it
would push that lot's sector notional above the cap. Refusal class:
`sector_cap_reached`. Refusal does NOT re-attempt at next-best
sector — the admit is dropped for the day (preserves ranking
integrity; matches DEC-084 short-pacing semantics).

**Book concentration reporting:** per day, per sector, report the
realized max sector weight. Baseline for context (live book's current
max sector concentration) NOT YET CITED — blocked on §3.

## 3. Sector-metadata evidence — the blocker

**Grep against the overshoot substrate:**

| Table | Sector column? | Source |
|---|---|---|
| `public.overshoot_universe` | **NO** — schema is `(ticker, source, added_as_of, active, created_at, updated_at)` only | `supabase/migrations/20260703044900_...` CREATE TABLE overshoot_universe |
| `public.overshoot_daily_bars` | NO (bars have no sector) | same MIG |
| `public.overshoot_short_interest` | NO | ACT-509 substrate |
| Any `overshoot_*` reference/lookup table | NONE found | `rg 'sector' sql/ supabase/migrations` — only longshort universe hits |

**Cross-lane comparator:** `public.universe_membership` (longshort
lane) carries `gics_sector text` (MIG `20260605065818_...`), but its
ticker set is the longshort universe, not the overshoot
`ivv_ijh_composite` universe. Overlap is partial; using longshort
GICS as a proxy would silently drop overshoot-only tickers into
`sector = NULL` — a fabricated-classification failure mode.

**Verdict:** **(e) is BLOCKED on a sector-metadata ingest for the
overshoot universe.** No compute this weekend; no proxy from
longshort. Honest gate, not a punt.

## 4. Ingest candidates (documented; NOT scheduled without operator OK)

| Source | Coverage | Access | Cost | Notes |
|---|---|---|---|---|
| **Polygon `/v3/reference/tickers/{ticker}`** | `sic_code` + `sic_description` (SIC, not GICS) | Polygon Stocks Advanced — already licensed | $0 incremental | SIC != GICS; needs a SIC->GICS mapping table (public mappings exist; reviewer required) |
| **FMP `/stable/profile?symbol=`** | `sector` + `industry` (FMP taxonomy, close-to-GICS) | FMP Premium — already licensed (ACT-548, DEV-10 CAT#65 Active) | $0 incremental | 900 tickers x 1 call ~ 90s at 10 rps. Monthly refresh sufficient. **Recommended primary.** |
| **iShares CSV** already used for universe | includes `sector` column per iShares taxonomy | free (ACT-571 manual-seed CSV path) | $0 | Piggybacks on operator's monthly ritual. Taxonomy close to GICS. |
| SSGA XLSX (DW-237 candidate) | includes sector | free (DW-237 auto-lane pending) | $0 | Same shape as iShares; contingent on DW-237 build. |

**Recommended path:** FMP `/stable/profile` as primary, iShares CSV
as verification cross-check. Adds `sector_source` and `sector_asof`
provenance columns to `overshoot_universe` (or sibling table — MIG
design turn decides). Estimated build: ~1 turn migration + ~1 turn
ingest + ~1 turn backfill/verify = **3 turns** before (e) can compute.

**Not fabricated:** no GICS strings written into the substrate until
the ingest lands and provenance stamps every row.

## 5. Landing plan

- (a)/(b)/(c)/(d) compute proceeds as chartered once kernel + Layer-1
  fixtures are green (compute-plan.md §5 B1/B3).
- (e) is a **charter addendum**, filed here, gated on sector-metadata
  ingest. Verdict-table rows added with cells stamped
  `PENDING-SECTOR-INGEST` (distinct from `PENDING`, so the gate is
  legible in the template).
- Register row for the ingest workstream filed in
  `deferred-work-register.md` as `ACT-515(e)-sector-ingest`.

**No compute this turn. No fabricated sectors. Amendment is the deliverable.**