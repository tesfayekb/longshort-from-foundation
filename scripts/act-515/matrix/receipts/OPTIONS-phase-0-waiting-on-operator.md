# ACT-515 R1 · OPTIONS PHASE-0 DATA STAGE — WAITING-ON-OPERATOR

**Status:** BLOCKED-ON-CLICK.  No data pull, no expression backtest, no ambient work.
**Block owner:** operator (subscribe action on the Polygon Options Developer plan).
**Cost pin:** $79 / month, month-to-month cancellable (per Turn-4 fetch).

## What is waiting

The Turn-4 memo already ratified:
- **Provider:** Polygon Options Developer (Tradier NO-GO — no historical
  chains for expired contracts, as confirmed by the Turn-4 fetch).
- **History depth:** 4 years — covers the full sealed window
  (`2022-06-29 … 2026-07-10`, 1,011 sessions).
- **Cohort:** the 4,902-lot admitted set from `lots-1x-const.jsonl`, keyed
  on `(ticker, entryDate)`. Under Polygon's flat-file API this is one
  monthly zip per ticker-month, so the pull is bandwidth-bounded, not
  request-count-bounded — no rate-limit STOP expected.
- **Chain slice per lot:** strikes ±20% of entry_open, 21–30 DTE.
- **Expressions:** E1 debit call spread (LONG), E2 debit put spread (SHORT),
  E3 collar on T1 LONG. Pre-registered in the Turn-4 memo.
- **Gate:** Phase-1 eligibility clause (same grammar as V-A/V-C/V-B′) —
  cagr ≥ 15% AND max-dd ≤ 1.5×cagr AND worst-year > −5% AND lots ≥ 800.

## Action row (single click)

| # | actor | action | ETA |
|---|---|---|---|
| 1 | operator | Subscribe Polygon Options Developer ($79/mo) | manual |
| 2 | operator | Report "subscribed" in chat (API key not required — flat-file uses S3 creds provisioned on Polygon dashboard) | after (1) |
| 3 | agent    | Same-turn flat-file chain pull for 4,902 lots (± 20% strike, 21-30 DTE), sealed + sha'd under `scripts/act-515/matrix/cache/options-chains-*.jsonl` + `cache-shas.ts` addendum | on (2) |
| 4 | agent    | E1/E2/E3 expression backtest → receipt with Phase-1 gate verdict | same turn |

## Deviations (surfaced before block)

- **No web-fetch this turn.** The Tradier / Polygon research fetches were
  the Turn-4 deliverable and are already sealed in that memo — repeating
  them without a subscribed key would produce the same public docs.
- **No cost re-verify.** $79/mo pin lifted verbatim from Turn-4 memo.
  If Polygon posts a different price at checkout, operator surfaces before
  clicking.
- **Data-scope fence:** cohort is FROZEN to the sealed 4,902 lots. Any
  chain fetched for a ticker-date not in the cohort is a defect — the
  pull script will assert this before commit.

## Register

No receipt to file until (2). This row is the receipt that (1) is the
only outstanding blocker.