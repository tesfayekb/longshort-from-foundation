# Earnings-Calendar Feed Failure Runbook

> **Component:** longshort universe (Phase 1) | **AC anchor:** AC-23 | **Sub-step:** FP-008 / 8.12 / ACT-118 | **Artifact:** ART-023

## Symptoms

`PolygonEarningsCalendarFetcher.fetchUpcomingEarnings()` failure modes observable downstream of the §3.3a daily refresh:

- Constructor throws when `POLYGON_API_KEY` is missing or empty (per fetcher source: `throw new Error('PolygonEarningsCalendarFetcher: apiKey is required (POLYGON_API_KEY secret missing).')`).
- HTTP fetch failure to the Polygon API (network error / 5xx / rate-limit) — error propagates; no silent retry inside the fetcher.
- Polygon returns malformed events (non-`'earnings'` type, or missing `date` field) — fetcher silently skips per `if (evt.type !== 'earnings' || !evt.date) continue`. Produces partial-but-valid output; not an error.
- Persistent outage observable via consecutive failed §3.3a refresh cadences in job execution history.

## Detection

The continuous-refresh dispatcher (sub-step 8.5 / ACT-109) returns a per-rule outcome envelope. For rule 3.3a, a fetch failure surfaces as a per-rule error in the orchestrator's outcome envelope.

```bash
# Confirm fetcher class + behavior
rg -n 'PolygonEarningsCalendarFetcher|POLYGON_API_KEY' supabase/functions/_shared/longshort-universe/hard-exclusions/earnings-calendar-fetcher.ts
```

```sql
-- §3.3a rule firings via hard_exclusions schema (ACT-110)
SELECT COUNT(*) FILTER (WHERE '3.3a' = ANY(firing_rules)) AS rule_3_3a_firings,
       MAX(as_of_date) AS latest_3_3a_date
FROM public.hard_exclusions;
-- A stale latest_3_3a_date relative to expected daily cadence signals persistent feed failure.
```

Continuous-refresh execution-log review (when implemented at per-rule-fetcher landing per DW-071 forward deferral) OR existing `job_registry` execution history serves as detection surface in the interim.

## Diagnosis

Branch by failure mode:

- **`POLYGON_API_KEY` missing or empty** — Constructor throws on instantiation. Configuration error, not a runtime feed failure.
- **Transient HTTP fetch failure (5xx / rate-limit / network)** — Error propagates per fetcher source. Per DEC-038 clause (4) per-rule independence verbatim: *"failure of one rule does not block other rules from refreshing."* The universe pipeline proceeds with other §3.3 rules; rule 3.3a is deferred to the next daily refresh cadence per DEC-038.1 clause (4).
- **Polygon API malformed response** — Fetcher silently skips entries per `if (evt.type !== 'earnings' || !evt.date) continue`. NOT an error; produces a partial-but-valid result. No operator action required for individual malformed entries.
- **Persistent Polygon API outage** — multiple consecutive failed daily refresh cadences. Per DEC-038 clause (4) verbatim earnings-calendar daily refresh cadence: up to a 24-hour exposure window without fresh earnings data. Signal-layer filtering at Phase 2+ provides defense-in-depth.

## Action

Branch per Diagnosis:

- `POLYGON_API_KEY` missing/empty — operator configuration fix; re-deploy the edge function with the corrected secret.
- Transient HTTP fetch failure — NO operator action; per-rule independence ensures the universe pipeline proceeds; rule 3.3a is automatically retried at the next daily refresh cadence per DEC-038 clause (4).
- Malformed Polygon response — NO operator action; fetcher silent-skip is intentional behavior.
- Persistent Polygon API outage — operator monitoring; consider an operational decision on whether to widen the earnings-exclusion window manually OR accept Phase 2+ signal-layer defense-in-depth coverage. Per ACT-097 audit-reconciliation pattern: if outage exceeds standard runbook coverage, classification becomes operator-bespoke debugging per CROSSWIND §11.0.11.

## Verification

Confirm rule 3.3a re-activation after resolution:

```sql
SELECT as_of_date, COUNT(*) AS rule_3_3a_firings
FROM public.hard_exclusions
WHERE '3.3a' = ANY(firing_rules)
  AND as_of_date >= now()::date - 5
GROUP BY as_of_date
ORDER BY as_of_date DESC;
```

Expect non-zero firings on a recent date (assuming any earnings windows fall in scope). The hard_exclusions persister wiring at ACT-113 + sub-step 8.5 / ACT-109 dispatcher returns a non-failure outcome for rule 3.3a on the next successful cadence.

## Escalation

Per CROSSWIND §11.0.11 verbatim: runbook-driven action expected for transient failures; operator-bespoke debugging signals a bug. Persistent Polygon API outage exceeding standard runbook coverage: escalate to operator-bespoke debugging per §11.0.11.

Escalation contact: TBD per operator on-call rotation; placeholder pending operator population at 8.13 closure OR Phase 7.

## Cross-references

- `supabase/functions/_shared/longshort-universe/hard-exclusions/earnings-calendar-fetcher.ts` — `PolygonEarningsCalendarFetcher` source + behavior
- DEC-038 clause (4) per-rule independence verbatim — `docs/08-planning/approved-decisions.md`
- DEC-038.1 clause (4) job-registry seeds verbatim — `docs/08-planning/approved-decisions.md`
- CROSSWIND §3.3a (earnings-window hard-exclusion rule) — `docs/04-modules/longshort/design-source/`
- CROSSWIND §11.0.11 runbook-driven vs operator-bespoke distinction
- ACT-109 continuous hard-exclusion refresh dispatcher — `docs/06-tracking/action-tracker.md`
- ACT-113 `hard_exclusions` persister wiring — `docs/06-tracking/action-tracker.md`
- DW-071 continuous-refresh metric emission deferral — `docs/08-planning/deferred-work-register.md`
- `docs/04-modules/longshort/universe/universe.md` — Sub-modules section "Continuous hard-exclusion refresh" entry