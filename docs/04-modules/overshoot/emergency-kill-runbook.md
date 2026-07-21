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

## Universe seed (canonical) — Snippet #5b

Supersedes Snippet #5. Used to reseed `overshoot_universe` from operator-
attested IVV + IJH holdings CSVs (INC-126 Option C identity: IVV ∪ IJH).

Client-side extraction bypasses the shared 64 KB body cap
(`_shared/handler.ts` MAX_BODY_BYTES) by sending the compact `tickers[]`
payload with a client-computed `tickers_sha256`; the server recomputes and
refuses on mismatch. `csv_sha256_provenance` is operator-attested and
recorded in the `overshoot_audit_logs` row.

Steps:

1. Download the two current holdings CSVs (US, from your workstation —
   iShares blocks Supabase edge egress; the operator picker is the
   sanctioned ingest channel):
   - IVV: `https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf/1467271812596.ajax?fileType=csv&fileName=IVV_holdings&dataType=fund`
   - IJH: `https://www.ishares.com/us/products/239763/ishares-core-sp-midcap-etf/1467271812596.ajax?fileType=csv&fileName=IJH_holdings&dataType=fund`
2. Open the browser console on the app origin (signed in as superadmin) and
   run the Snippet #5b file-picker (extracts the `Ticker` column from both
   CSVs, unions, sorts, computes sha256, posts `probe:"seed"` dry-run then
   `probe:"seed_apply"`).
3. Expected dry-run: `roster_count` in `[850, 950]`, `sanity_band=[850,950]`,
   `would_upsert ≈ 900`, `would_deactivate` limited to names truly no longer
   in the composite.
4. Apply only after dry-run passes and operator verifies the
   `would_deactivate_sample` contains no live-book tickers.
5. Post-apply: verify `overshoot_audit_logs` row with
   `action='universe.seed_apply'`, `provenance_mode='client_attested'`,
   `tickers_sha256` matching what the client computed, and
   `csv_sha256_provenance` matching operator attestation. Then arm sql/39.