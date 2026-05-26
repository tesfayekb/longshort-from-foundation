# Halt-Feed Unavailable Runbook

> **Component:** longshort universe (Phase 1) | **AC anchor:** AC-23 | **Sub-step:** FP-008 / 8.12 / ACT-118 | **Artifact:** ART-022

## Symptoms

v1 reality per DW-063: the §3.3c halt-feed integration is a deferred placeholder. `rule3_3c_Halts` accepts a `halt_history: ReadonlyArray<HaltEvent>` parameter, but the continuous hard-exclusion refresh job supplies an empty array at v1. No halt data flows currently; the rule is wired but inert.

- No `firing_rules` entries containing `'3.3c'` appear in `hard_exclusions` rows (regardless of actual halt activity in the market).
- The job_registry seed for `hard_exclusion_refresh_3_3c` (MIG-049) remains `enabled=false` per intentional deferral.
- No alerts; the absence is silent per DW-063 risk acknowledgment.

## Detection

Confirm the deferred-placeholder state:

```bash
# Rule body wired but inert
rg -n 'HaltEvent|halt_history' src/features/longshort/services/universe/hard-exclusions/rule-3-3c-halts.ts
# Refresh-jobs supply empty array at v1
rg -n '3.3c|halt_history' src/features/longshort/services/universe/refresh-jobs/
```

```sql
-- Sub-step 8.6 / ACT-110 hard_exclusions schema; firing_rules text[] contains rule entries when populated
SELECT COUNT(*) FILTER (WHERE '3.3c' = ANY(firing_rules)) AS rule_3_3c_firings,
       COUNT(*) AS total_rows
FROM public.hard_exclusions
WHERE as_of_date >= now()::date - 30;
-- expect rule_3_3c_firings = 0 at v1
```

## Diagnosis

Per DW-063 verbatim: *"Rule body is wired correctly; activation is automatic when a real `HaltHistoryProvider` implementation lands."* The v1 state is intentional deferral per FP-008 R4 risk register entry. Per DW-058 B2 Phase 7 dependency: a real-time halt-feed data source (Polygon halt-feed channel, NYSE/Nasdaq halt subscription, or equivalent) MUST be procured before any live-order code paths wire. Per ACT-097 audit reconciliation finding B2 HIGH/BLOCKING: a phantom non-halt fetcher would be structurally worse than the explicit absence of a halt check (per anti-phantom-defaults guardrail).

## Action

v1 reality has NO automated action — the rule is intentionally inert per DW-063. Signal-layer filtering at Phase 2+ provides defense-in-depth via signal-quality checks on recently-halted names (degraded volume + spread) per DW-063 risk acknowledgment.

At Phase 7: when `HaltHistoryProvider` lands, activation is automatic — the rule body is already wired and consumes the new provider's output via the existing `halt_history` parameter. No operator action required at activation time.

## Verification

- **v1 verification:** empty-array supply in refresh-jobs confirms deferred state (see Detection grep block). `hard_exclusions` rows show zero `'3.3c'` firings.
- **Phase 7 verification:** `HaltHistoryProvider` implementation landed (out-of-scope at v1); the corresponding sub-step (TBD Phase 7) wires the real-time halt feed; integration test against live halt source confirms `'3.3c'` firings appear in `hard_exclusions` when halts occur.

## Escalation

- **v1 escalation:** NONE — the deferred state is intentional and operator-acknowledged.
- **Phase 7 escalation:** per DW-058 B2 HIGH/BLOCKING — if halt-feed external data procurement fails at Phase 7 planning, live-order code paths cannot wire.

Escalation contact: TBD per operator on-call rotation; placeholder pending operator population at 8.13 closure OR Phase 7.

## Cross-references

- DW-063 — §3.3c halt 5-trading-day lookback — deferred placeholder per R4 — `docs/08-planning/deferred-work-register.md`
- DW-058 — B2 HIGH/BLOCKING halt-feed external data procurement (Phase 7) — `docs/08-planning/deferred-work-register.md`
- FP-008 R4 risk register entry — `docs/08-planning/feature-proposals.md`
- ACT-097 audit reconciliation finding B2 — `docs/06-tracking/action-tracker.md`
- ACT-107 sub-step 8.3 rule-3.3c landing as deferred placeholder — `docs/06-tracking/action-tracker.md`
- CROSSWIND §3.3c (halts hard-exclusion rule) — `docs/04-modules/longshort/design-source/`
- `docs/04-modules/longshort/universe/universe.md` — Failure Modes section "§3.3c halt-feed unavailability (v1)" entry
- `src/features/longshort/services/universe/hard-exclusions/rule-3-3c-halts.ts` — rule wiring