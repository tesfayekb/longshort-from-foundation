# Overshoot Emergency Kill Runbook

**Purpose:** one-page, two-tap path from phone → strategy halted. Linked from the operator console (`/trading/overshoot` header). No prose beyond the taps and the disarm one-liners.

## Two-tap kill (phone, browser signed in)

1. **Tap 1** — open `/trading/overshoot` → header → **KILL SWITCH** button → confirm dialog.
2. **Tap 2** — enter reason (free-text, ≥1 char) → **HARD PAUSE** (state → `hard_paused`; blocks all overshoot writes; requires superadmin re-auth to resume).

Effect: `kill_switches` row for `strategy_key='overshoot'` transitions to `hard_paused`; all overshoot edge functions fail-closed on the read predicate; open lots are NOT touched (no market orders sent). For forced flat, chain **MANUAL LIQUIDATE** as tap 3.

## SQL disarm one-liners (operator, service-role)

```sql
-- HARD PAUSE (blocks entries + exits; open lots untouched)
SELECT public.kill_switch_hard_pause('overshoot', 'emergency: <reason>');

-- MANUAL LIQUIDATE (state=liquidating; Phase-5 execution loop TBD)
SELECT public.kill_switch_manual_liquidate('overshoot', 'emergency: <reason>');

-- RESUME (superadmin only; only from soft_paused)
SELECT public.kill_switch_resume('overshoot', 'operator resume: <reason>');
```

## Cron-level disarm (belt + suspenders)

```sql
-- Disarm every overshoot cron in one shot
UPDATE public.job_registry
   SET enabled = false, updated_at = now()
 WHERE owner_module = 'overshoot' AND enabled = true;
```

## Post-emergency checklist

- [ ] `audit_logs` row for `kill_switch.hard_pause` exists (evidence).
- [ ] `overshoot_alert_dispatch` fired (or Resend delivery confirmed by hand).
- [ ] Open-lot inventory snapshotted (`SELECT count(*), sum(deployed_notional) FROM overshoot_lots WHERE status='open'`).
- [ ] Incident filed under `docs/06-tracking/incidental-findings.md` (INC-NNN).