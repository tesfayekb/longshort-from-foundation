# ACT-571 — Overshoot Universe Refresh: Source Re-Point to IVV+IJH Composite

**Status:** CHARTERED (charter-before-build per INC-136).
**Chartered:** 2026-07-24 evening (operator turn "BOTH ACCEPTED").
**Hard gate:** MUST land + be armed BEFORE Monday 2026-07-27 10:00:00Z
(else jobid=133's maiden scheduled fire is a 4th silent Monday —
fail-closed on `I:RUT` → no writes → substrate ages another week).
Weekend build/deploy slot is fine; the operational gate is the 10:00Z
Monday cron window.
**Owner:** overshoot module.
**Related:** INC-140 (this charter's defect statement), INC-126
(identity ratification), INC-139 (cron re-arm proof-point), ACT-548
(universe-identity seeding work — reuse target), DEC-034 clause 4
(wall-clock discipline), DEC-023 (edge-function handler envelope),
Catalog #65 (NO ARTIFACT, NO ASSERTION — every source/behavior claim
in this charter cites the committed code line).

## 1. Scope

Re-point the DEFAULT (non-probe) refresh path in
`supabase/functions/overshoot-universe-refresh/index.ts` from Polygon
`/v3/reference/tickers?index=…` with `POLYGON_RUSSELL2000_CODE='I:RUT'`
(current `index.ts:73`) to the SAME ratified IVV+IJH composite source
that the ACT-548 operator-seed path used.

**Reuse — no re-implementation.** ACT-548 already established the
ingest primitives:

| Concern | Existing artifact (reuse verbatim) |
|---|---|
| iShares CSV parsing | `parseIsharesCsv(csv)` — `index.ts:204–243` |
| Fetch + retry + timeout | `fetchWithTimeoutAndRetry` — `_shared/overshoot/csv-fetch-primitives.ts` |
| IVV product URL shape | derived from `ISHARES_IWM_HOLDINGS_URL` template at `index.ts:96–97` (swap product-id + fileName; identical `1467271812596.ajax` route) |
| IJH product URL shape | same template family (S&P MidCap 400 iShares Core ETF) |
| Sanity band | `ROSTER_SANITY_MIN=850`, `ROSTER_SANITY_MAX=950` — `index.ts:85–86` — STAYS EXACTLY |
| Ticker dedup + hash | `normalizeTickers` + `tickersSha256Hex` — `index.ts:163–195` |
| Upsert + soft-deactivate | existing default-path writer block (below `probe:'seed'` handler) |
| Cross-check reference | `_shared/longshort-universe/constituent-ingestion/ishares-constituent-fetcher.ts` (longshort quarterly-refresh precedent — READ-ONLY reference for shape parity; do NOT import cross-module) |

**Out of scope.** Polygon `I:RUT` path is DELETED from the default
refresh (not gated behind a flag — it is misconfigured for our
identity; leaving it in as a fallback re-arms the bug). The
`probe:'polygon'` diagnostic MAY be retained as a probe-only sanity
read against Polygon's index-membership feed — flagged as diagnostic
only, not writable.

## 2. Contract

### Input (POST body — additive, backward-compatible)
```
{
  probe?: 'polygon' | 'ishares' | 'fmp_etf' | 'edgar_nport' | 'staleness' | 'seed',  // unchanged
  dry_run?: boolean,
  as_of?: 'YYYY-MM-DD',
}
```
Default path (no `probe`, no `dry_run=false-with-body-fields`) now
fetches IVV + IJH holdings CSVs live from iShares, unions the
deduped ticker sets, sanity-checks, and writes.

### Output (default path — non-probe, non-dry-run success)
```json
{
  "ok": true,
  "source": "ivv_ijh_composite",
  "roster_count": <int in [850,950]>,
  "sanity_band": [850, 950],
  "per_source_counts": { "ivv": <int>, "ijh": <int>, "union": <int>, "overlap": <int> },
  "csv_sha256_provenances": ["<sha256_of_ivv_csv>", "<sha256_of_ijh_csv>"],
  "as_of_from_source": { "ivv": "<iShares as-of>", "ijh": "<iShares as-of>" },
  "drift_report": {
    "added":      [<ticker>, ...],
    "removed":    [<ticker>, ...],
    "unchanged_count": <int>,
    "prior_active_count": <int>,
    "next_active_count": <int>
  },
  "writes": { "upserted": <int>, "deactivated": <int> },
  "correlationId": "<uuid>"
}
```

### Provenance stamp on written rows
`overshoot_universe.source = 'ivv_ijh_composite'` (kept distinct from
`ishares:ivv_ijh:manual_seed` so operators can distinguish a scheduled
refresh row from a manual ACT-548-style backfill row at a glance).

### Failure modes (all fail-closed, no writes)
| Class | Response |
|---|---|
| Either CSV fetch returns HTML / non-CSV | `status:'html_body_received'` per file |
| Header row missing | `status:'header_row_not_found'` per file |
| Combined roster outside `[850, 950]` | `status:'roster_sanity_failed'` + `roster_count` + `per_source_counts` |
| Only one file succeeds | `status:'partial_source_failure'` + which file + upstream reason |

## 3. Test set

Committed alongside code (mirroring `overshoot-entry-run/index_test.ts`
conventions):

1. **Sanity-band fail-closed preserved.** Fixture: mock a fetch that
   returns 8000 IVV rows + 400 IJH rows. Expect
   `status:'roster_sanity_failed'`, zero writes.
2. **Happy-path drift report shape.** Fixture: mock IVV=500, IJH=400,
   overlap=0 → union=900. Expect `ok:true`, `roster_count:900`,
   `source:'ivv_ijh_composite'`, `drift_report` with populated
   `added`/`removed`/`unchanged_count`, `csv_sha256_provenances`
   length 2.
3. **Source-provenance stamp.** After a successful write (mocked
   supabaseAdmin), assert every upserted row carries
   `source='ivv_ijh_composite'` (not `ishares:ivv_ijh:manual_seed`,
   not `polygon:russell2000`).
4. **Partial failure.** IVV fetch returns 500; IJH ok. Expect
   `status:'partial_source_failure'`, zero writes, upstream error
   surfaced in `detail`.
5. **Idempotency.** Second identical fetch (same CSV bytes) →
   `drift_report.added=[]`, `drift_report.removed=[]`, `writes.upserted`
   equals full roster (upsert is idempotent on ticker PK).
6. **HTML body classification.** IVV returns iShares product-page HTML
   instead of CSV → `status:'html_body_received'`, per-file `bytes`
   count. Zero writes.
7. **Cross-reference-index / dedup.** IVV row and IJH row for the same
   ticker (rare but happens on multi-cap membership) collapse to one
   ticker in `roster_count`; `per_source_counts.overlap >= 1`.

## 4. Deploy-truth rail

If the fn carries `SOURCE_VERSION` (currently it does not; the rail
has only been extended to money functions per DW-228), this charter
does NOT add it — that is DW-228 scope. Deploy attestation for
ACT-571 is:

1. `code--exec` grep-proof that `POLYGON_RUSSELL2000_CODE` is DELETED
   from the default path in the committed source.
2. Deploy via `supabase--deploy_edge_functions
   ['overshoot-universe-refresh']`.
3. ONE manual invoke as acceptance run — expect small honest drift
   after 23 days (07-21 → 07-24+) with per-ticker reasons where
   possible (added / removed).
4. Confirm jobid=133 command string still points at the correct
   function name (unchanged — function name is stable across this
   charter; only in-function fetch source changes).

## 5. Deferred / explicitly out-of-scope

- **Polygon `I:RUT` fallback flag.** Not added — leaving the bug
  behind a flag re-arms it. If future business need requires a
  Polygon read, land as a NEW `probe:` sub-command.
- **FMP / EDGAR sources.** Existing probes stay probe-only; not
  wired into the default path.
- **SOURCE_VERSION rail extension.** DW-228 scope.
- **UI chip re-render on refresh success.** The "stale Nd" chip is
  code-correct today (INC-139 confirmed); after ACT-571 lands and the
  Monday 10Z fire writes fresh, the chip will collapse to "stale 0d"
  on next React-Query refetch. No chip code change needed.

## 6. Acceptance

Charter is DONE when (all four required):

1. Committed diff removes `I:RUT` from default path; adds IVV+IJH
   fetcher block; reuses `parseIsharesCsv` verbatim.
2. Test set §3 (1–7) green.
3. Manual acceptance run returns `ok:true` with populated
   `drift_report`; provenance `source='ivv_ijh_composite'` verified
   via `SELECT DISTINCT source FROM overshoot_universe WHERE
   updated_at > '<charter-apply-time>';`.
4. `cron.job` row for jobid=133 unchanged (command string still
   correct); Monday 2026-07-27 10:00:00Z fire produces a real
   `cron.job_run_details` row with `status='succeeded'` — this is
   INC-139's empirical proof-point and INC-140's closure evidence.

On acceptance: INC-140 closes; INC-139 closes (jobid=133 fires
successfully); INC-126's code-side downstream is DONE.