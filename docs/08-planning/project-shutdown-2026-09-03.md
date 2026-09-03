# Project Shutdown — Census & Restart Plan

> **Applied:** 2026-09-03 | **Mode:** cold storage, fully reversible | **Nothing deleted**

## 1. Census — what was running

| Surface | Count | State before | State now |
|---|---|---|---|
| `pg_cron` schedules | 47 | all active | **0 active** (definitions retained) |
| `job_registry` real jobs | 45 | 43 enabled | **0 enabled** |
| `alert_configs` (email rules) | 3 | 3 enabled | **0 enabled** |
| Kill switches | 2 strategies | overshoot `soft_paused`, longshort none | **both `hard_paused`** |
| GitHub Actions on a schedule | 3 | active | **schedules commented out** |
| Open overshoot lots | 40 | — | untouched (paper) |
| Alert dispatch rows, last 7d | 7,375 | — | source stopped |

Highest-cadence writers that are now silent: `longshort.queue.slice` and the two
health jobs (every minute), `overshoot-fill-sweep` (every minute during RTH),
five warm-up jobs (every 4 minutes), the alerts dispatcher (every 5 minutes).

Largest retained tables: `signal_queue_feed_items` 3.66M, `combiner_feature_vectors`
2.01M, `overshoot_daily_bars` 1.08M, `overshoot_short_volume_daily` 1.00M,
`audit_logs` 546K. Total ~10M rows, all preserved.

## 2. What stops now

- **Database growth** — every automated writer is gated twice (cron inactive
  *and* registry disabled), plus a third gate for strategy code (kill switch
  `hard_paused`).
- **Strategy / monitoring email** — the alerts dispatcher and all three health
  alert rules are off. This was the entire high-volume email source.
- **GitHub Actions notification email** — the three scheduled workflows no
  longer fire, so no scheduled-run failure mail.

## 3. What deliberately still works

- **Auth email** (signup, password reset, invitations) — left on by choice, so
  you can still sign in and reset a password. Turn it off in the Supabase
  dashboard (Auth → Providers → disable signups / Auth → Emails) if wanted.
- **The app itself** — read-only dashboards still render historical data.
- **Edge functions** — deployed and callable, but every one refuses via the
  registry/kill-switch gates. No caller remains.
- **Push-triggered CI** (`overshoot-guards`, `strong-evidence`,
  `deploy-edge-functions`) — only fires if someone pushes code.

## 4. Residual cost while dormant

Supabase storage for ~10M rows plus the paused project baseline. No provider
API spend (Polygon/FMP/Finnhub/Alpaca/Resend calls all originated from the
frozen jobs). Consider downgrading the Supabase plan; do **not** let the
project be auto-paused-and-deleted if the retained data matters.

## 5. Restart — phased, not a single switch

Full runnable recipe lives in `sql/45_project_shutdown_freeze.sql`. Summary:

| Phase | Action | Gate before moving on |
|---|---|---|
| **R0** | Re-verify API keys and broker vs ledger state | Keys valid, drift understood |
| **R1** | Re-arm ingest/compute jobs only — no orders possible | 3-5 clean sessions of fresh rows |
| **R2** | Re-arm health jobs + alert rules (email resumes here) | Monitors green; expect a first-tick alert burst |
| **R3** | Resume one strategy at a time via Admin → Kill Switch | Clean A5 reconciliation before entry crons |
| **R4** | Uncomment the three GitHub Actions schedules | — |

Key property: because no schedule was ever `cron.unschedule()`d, resume needs
**no re-pasting of `CRON_SECRET`, anon key, or project ref**. Each of the 47
rows already holds its resolved command; re-arming is `active := true`.

## 6. Freeze verification (read back 2026-09-03)

```
cron_active   = 0   (of 47 total)
jobs_enabled  = 0
alerts_enabled= 0
switches      = overshoot=hard_paused, longshort=hard_paused
```
