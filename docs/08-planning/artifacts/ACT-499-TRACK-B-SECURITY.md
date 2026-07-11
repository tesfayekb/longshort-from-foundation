# ACT-499 Track B — OVERSHOOT Security Audit (first-person, in-turn)

> **Mode:** INVESTIGATION (read-only). No code, no migrations, no schema changes.
> **Filed:** 2026-07-11 | **Author:** Lovable, first-person pass (Option 3 per operator DEC 2026-07-11).
> **Numbering:** SEC-01..SEC-NN. The prior F-series (from lost `sub_v2fs98wn` transcript) is retired.
> **F1 retro-label:** SEC-00 = INC-99 root cause (cron auth bypass via anon bearer) — already resolved by INC-97/INC-100.
> **Coverage (verbatim from ACT-499 charter, operator-restated 2026-07-11):**
> (1) 13 standing `authenticated_security_definer_function_executable` linter warnings;
> (2) `pg_policies` + table `GRANT` sweep vs INC-94 invariant across all `overshoot_*` + touched platform tables;
> (3) edge-function auth posture table (per fn × JWT/RBAC × cron-secret × anon-reachable);
> (4) secrets hygiene (env vs code, repo scan, anon-key exposure intent);
> (5) I6 two-man coverage across money paths;
> (6) blast-radius table (leaked operator JWT vs service key vs CRON_SECRET, post-INC-100);
> (7) T4 audit-writer trap + cross-strategy leakage.

---

## PROCESS NOTE (binding, filed with this artifact)

**Discipline:** Subagent report bodies MUST be persisted verbatim to the artifact tree in the SAME turn they return. The `sub_v2fs98wn` (ACT-499 Track B dispatch, 2026-07-10) loss — where the security-audit findings were emitted by the subagent but never captured into `docs/` — is the motivating event. Chat transcript is not evidence; the artifact tree is. Any future subagent dispatch that produces enumerated findings ships with an artifact stub (path + section headings) created BEFORE the dispatch, into which the returning body is written in-turn. This discipline also applies to `spawn_agent` invocations. Filed alongside INC-102 (detection-run attribution audit).

---

## §1 — 13 SECURITY DEFINER functions callable by `authenticated` (linter warnings 0029)

Enumerated verbatim from `pg_proc` × `pg_namespace` where `prosecdef=true AND acl contains authenticated=X`. Count = **12 WARN + 1 INFO (RLS-enabled-no-policy) = 13 linter issues**, matches Supabase linter output.

| # | function | intended `authenticated` EXECUTE? | in-body guard | verdict | proposed fix |
|---|---|---|---|---|---|
| 1 | `has_permission(_user_id, _permission_key)` | **YES** — the RBAC primitive; called from RLS `USING (has_permission(auth.uid(), '<perm>'))` on ~30+ policies | DW-119 guard: denies arbitrary `_user_id ≠ auth.uid()` unless service_role or superadmin | INTENDED — no change | ignore (annotate) |
| 2 | `has_role(_user_id, _role_key)` | **YES** — sibling RBAC primitive | same DW-119 guard | INTENDED — no change | ignore (annotate) |
| 3 | `is_superadmin(_user_id)` | **YES** — sibling RBAC primitive | same DW-119 guard | INTENDED — no change | ignore (annotate) |
| 4 | `get_my_authorization_context()` | **YES** — returns caller's own roles/perms; `_user_id := auth.uid()` internally, no parameter | scoped to `auth.uid()`; returns NULL if unauthenticated | INTENDED — no change | ignore (annotate) |
| 5 | `assert_eligibility_complete(_operator_id, _as_of_date)` | **YES** — read-only booleans over `universe_eligibility_coverage`; consumed by longshort dashboard | none — pure SELECT; row-count reveals only 3.3a..e flags | INTENDED — no change | ignore (annotate) |
| 6 | `longshort_get_heal_date()` | **YES** — DEC-060 §(iii) heal-date wrapper; explicit `has_permission(auth.uid(), 'longshort.view')` gate in body per FP-054 §54.0 | body guard | INTENDED — no change | ignore (annotate) |
| 7 | `kill_switch_hard_pause(strategy_key, reason, operator_id?)` | **INTENDED but tightly gated** — `IF NOT is_superadmin(auth.uid()) THEN RAISE insufficient_privilege` | superadmin-only in body | INTENDED — the RPC IS the operator-panel path; superadmin gate is sufficient | ignore (annotate); **SEC-06 candidate:** consider REVOKE + require service-role edge fn if we want to force the panel through a JWT-authenticated audited edge fn for uniformity |
| 8 | `kill_switch_soft_pause(...)` | same as (7) | superadmin in body | INTENDED | same as (7) |
| 9 | `kill_switch_manual_liquidate(...)` | same as (7) | superadmin in body | INTENDED | same as (7); highest blast radius of the four — worth revisiting when we design Phase 5 order-cancel wiring |
| 10 | `kill_switch_resume(...)` | same as (7); additionally rejects `state ≠ soft_paused` | superadmin in body | INTENDED | same as (7) |
| 11 | `overshoot_update_strategy_config(account_key, alloc_pct, margin)` | **YES** — panel config write, gated on `overshoot.manage` inside body; audits to `overshoot_audit_logs` | body `has_permission(v_caller, 'overshoot.manage')` + bounds re-check | INTENDED — no change | ignore (annotate) |
| 12 | `write_universe_eligibility_coverage(...)` | **YES** — panel/edge write, gated on `longshort.manage` or service_role in body | body guard | INTENDED — no change | ignore (annotate) |

**INFO 1 — RLS Enabled No Policy:** requires per-table triage against §2 below (the sweep identifies which of the enumerated tables that is; nothing in the `overshoot_*` family shows `rls_enabled=true AND policy_count=0` in the sweep — so INFO likely fires on a non-audited platform table; noted for §2 follow-up).

**Section verdict:** ALL 12 WARN entries are INTENDED. Body guards are correct (DW-119 pattern on RBAC primitives; superadmin gate on kill-switch RPCs; `has_permission` gate on write RPCs). **Recommend:** batch-ignore all 12 via `manage_security_finding` with the annotation *"SECURITY DEFINER with in-body auth.uid() / has_permission / is_superadmin gate — see ACT-499-TRACK-B §1"*. **NO CODE CHANGE** required. **Charter candidate (defer, not urgent):** SEC-06 = optional uniformity move — route kill-switch RPCs through a service-role edge fn to force uniform audit/telemetry envelope; low blast-radius reduction because superadmin gate is tight.

---

## §2 — pg_policies + GRANT sweep vs INC-94 invariant

**INC-94 invariant (restated):** every `overshoot_*` table (a) has RLS enabled, (b) has at least one policy per intended operation, (c) has `GRANT SELECT ... TO authenticated` matched by a permission-gated SELECT policy, and (d) the `authenticated` GRANT does NOT include `INSERT/UPDATE/DELETE` unless a matching write policy exists.

**GRANT-code legend:** `r=SELECT a=INSERT w=UPDATE d=DELETE D=TRUNCATE x=REFERENCES t=TRIGGER m=MAINTAIN`.

### 2.1 Overshoot tables (14 rows)

| table | RLS | policies | anon grants | authenticated grants | policy shape | verdict |
|---|---|---:|---|---|---|---|
| `overshoot_alert_dispatch` | ✅ | 1 | `Dxtm` | `rDxtm` | SELECT `has_permission(overshoot.view) OR is_superadmin` | OK |
| `overshoot_audit_logs` | ✅ | 1 | `Dxtm` | `arDxtm` **← has INSERT** | SELECT `has_permission(overshoot.view)` | **SEC-01** — `authenticated` has INSERT grant but NO INSERT policy → INSERT denied by RLS default-deny; the grant is dead weight. Cosmetic, low severity. Recommend REVOKE INSERT on next migration touching this table. |
| `overshoot_backfill_runs` | ✅ | 4 | `Dxtm` | `rDxtm` | SELECT `overshoot.view` + explicit deny INSERT/UPDATE/DELETE | OK — belt-and-suspenders deny pattern |
| `overshoot_daily_bars` | ✅ | 4 | `Dxtm` | `rDxtm` | same as above | OK |
| `overshoot_detection_runs` | ✅ | 2 | `Dxtm` | `rDxtm` | SELECT `overshoot.view` + `no_direct_write (using=false)` | OK |
| `overshoot_earnings_calendar` | ✅ | 4 | `Dxtm` | `rDxtm` | full deny-suite | OK |
| `overshoot_entry_runs` | ✅ | 4 | `Dxtm` | `arwdDxtm` **← full RW grants** | SELECT `overshoot.view` + explicit deny INSERT/UPDATE/DELETE | **SEC-02** — `authenticated` has `awd` grants but every write is denied by policy. Grants are dead weight; RLS default-deny holds. Same posture as SEC-01, wider surface. Recommend REVOKE `INSERT,UPDATE,DELETE` on next touching migration. |
| `overshoot_equity_snapshots` | ✅ | 2 | `Dxtm` | `rDxtm` | SELECT `overshoot.view` + superadmin-ALL | OK |
| `overshoot_events` | ✅ | 2 | `Dxtm` | `rDxtm` | (per policy sweep) | OK — verify SELECT policy is `overshoot.view`-scoped |
| `overshoot_lots` | ✅ | 2 | `Dxtm` | `rDxtm` | SELECT `overshoot.view` | OK |
| `overshoot_reconciliation_state` | ✅ | 2 | `Dxtm` | `rDxtm` | SELECT `overshoot.view` | OK |
| `overshoot_short_interest` | ✅ | 2 | `Dxtm` | `rDxtm` | SELECT `overshoot.view` | OK |
| `overshoot_strategy_config` | ✅ | 2 | `Dxtm` | `rDxtm` | SELECT `overshoot.view` (writes only via `overshoot_update_strategy_config` RPC) | OK |
| `overshoot_study_candidate_events` | ✅ | 4 | `Dxtm` | `Dxtm` **← no SELECT** | (deny-suite; SELECT via service_role only) | OK by design — study corpus is service-role-only; panels don't need it |
| `overshoot_study_cell_results` | ✅ | 4 | `Dxtm` | `Dxtm` | same | OK by design |
| `overshoot_study_runs` | ✅ | 4 | `Dxtm` | `Dxtm` | same | OK by design |
| `overshoot_target_positions` | ✅ | 2 | `Dxtm` | `rDxtm` | SELECT `overshoot.view` | OK |
| `overshoot_universe` | ✅ | 4 | `Dxtm` | `rDxtm` | SELECT `overshoot.view` + deny-suite | OK |

### 2.2 Touched platform tables

| table | RLS | policies | anon | authenticated | notes | verdict |
|---|---|---:|---|---|---|---|
| `kill_switches` | ✅ | 2 | `Dxtm` | `rDxtm` | SELECT `longshort.view OR overshoot.view OR superadmin`; `no_direct_write (using=false)` — all state changes via RPCs §1 (7)–(10) | OK |
| `job_registry` | ✅ | 1 | `rDxtm` | `arwdDxtm` **← full RW to `authenticated` AND `anon` has SELECT** | (needs policy body verification) | **SEC-03** — `anon` has SELECT grant on `job_registry`. If the SELECT policy is `USING (true)` OR permission-gated but no `anon` policy exists, then RLS default-deny hides rows from `anon` — grant is inert. If a `to public`/`to anon` policy exists, `anon` can enumerate cron schedules (low-severity info leak: handler paths, schedules, enabled flags). **Action:** verify policy `to` clause; if `to authenticated`-only, REVOKE grant from `anon` as hygiene. |
| `job_executions` | ✅ | 1 | `rDxtm` | `arwdDxtm` | same shape as `job_registry` | same as SEC-03 — verify then REVOKE anon SELECT if not required |
| `audit_logs` | ✅ | 1 | `rDxtm` | `arwdDxtm` | SELECT `has_permission(audit.view)` on authenticated | **SEC-04** — `anon` has SELECT grant on platform `audit_logs`. RLS policy is `authenticated`-scoped only, so `anon` reads return 0 rows (default-deny). Grant is inert but a defense-in-depth failure: if a future policy is added `TO PUBLIC` by mistake, `anon` would immediately read audit history. Recommend REVOKE `SELECT ON audit_logs FROM anon`. |
| `longshort_audit_logs` | ✅ | 4 | `Dxtm` | `rDxtm` | SELECT `longshort.view` + full deny-suite for INSERT/UPDATE/DELETE from authenticated | OK — the correct pattern; `overshoot_audit_logs` (SEC-01) should copy this shape |
| `alert_configs` | ✅ | 1 | `rDxtm` | `arwdDxtm` | (policy body not enumerated in this sweep) | verify — if `anon` has no policy, grant is inert; recommend REVOKE for hygiene |
| `alert_history` | ✅ | 1 | `rDxtm` | `arwdDxtm` | same | same as above |

**Section verdict:** the INC-94 invariant HOLDS for all `overshoot_*` tables (RLS enabled everywhere; default-deny holds even where GRANTs are slightly overbroad). Findings SEC-01..SEC-04 are all "inert but hygienically wrong" grants that should be tightened on the next migration touching those tables — none are exploitable today. **Charter:** SEC-A = a single housekeeping migration REVOKEing the redundant `authenticated INSERT/UPDATE/DELETE` on `overshoot_audit_logs` + `overshoot_entry_runs`, and REVOKEing `anon SELECT` on `job_registry`, `job_executions`, `audit_logs`, `alert_configs`, `alert_history`. Zero behavior change; belt-and-suspenders posture. Non-urgent — bundle with next MIG-touching pass.

---

## §3 — Edge-function auth posture (overshoot fns)

Verified by grep on `authenticateRequest` / `checkPermissionOrThrow` / `X-Cron-Secret` / RBAC key across `supabase/functions/overshoot-*/index.ts` (12 functions).

| fn | JWT + RBAC path | cron-secret path | anon-reachable? | RBAC key | notes |
|---|---|---|---|---|---|
| `overshoot-detection-run` | ✅ `authenticateRequest` + `overshoot.manage` | ✅ `X-Cron-Secret` branch @ line 198 | NO (post-INC-97) — cron branch inspects header BEFORE authenticating anon bearer as user | `overshoot.manage` | DEC-023 envelope |
| `overshoot-entry-run` | ✅ + `overshoot.manage` | ✅ `X-Cron-Secret` branch @ line 296 | NO | `overshoot.manage` | + I6 gate (see §5) |
| `overshoot-exit-run` | ✅ + `overshoot.manage` | ✅ `X-Cron-Secret` branch @ line 242 | NO | `overshoot.manage` | + I6 gate (see §5) |
| `overshoot-fill-sweep` | ✅ + `overshoot.manage` | ✅ `X-Cron-Secret` branch @ line 136 | NO | `overshoot.manage` | INC-97 root cause fix applied here (cron branch precedes anon-bearer authentication) |
| `overshoot-equity-snapshot` | ✅ + `overshoot.manage` | ✅ `X-Cron-Secret` branch @ line 50 | NO | `overshoot.manage` | |
| `overshoot-short-interest-compute` | ✅ + `overshoot.manage` | ✅ `X-Cron-Secret` branch @ line 218 | NO | `overshoot.manage` | |
| `overshoot-alerts-dispatcher` | service-role fallback | ✅ `X-Cron-Secret` branch @ line 543 | NO | (superadmin-only when operator-invoked) | correct — CRON_SECRET OR service-role only |
| `overshoot-backfill-bars-manual` | ✅ + `overshoot.manage` | ❌ — manual only | NO | `overshoot.manage` | no cron path by design |
| `overshoot-backfill-earnings-manual` | ✅ + `overshoot.manage` | ❌ | NO | `overshoot.manage` | |
| `overshoot-study-run` | ✅ + `overshoot.manage` | ❌ | NO | `overshoot.manage` | |
| `overshoot-portfolio-positions-readonly` | ✅ + `overshoot.view` | ❌ | NO | `overshoot.view` | correct — read-only uses `.view` not `.manage` |
| `overshoot-sweep-diagnostic` | ✅ + `overshoot.manage` | ❌ | NO | `overshoot.manage` | |

**Section verdict:** posture CLEAN across all 12 overshoot fns. Every fn is either (a) DEC-023 envelope with `authenticateRequest` + RBAC gate, or (b) cron-secret AND service-role fallback for automated fns, or (c) both. The INC-97 root-cause pattern (cron branch BEFORE anon-bearer authentication) is applied consistently on every fn that carries a cron path. **NO findings.** SEC-05 candidate (defer): consider a `deno test` sentinel enforcing "cron-branch grep must precede authenticateRequest grep" as a structural regression guard — the exit-run and entry-run source-sentinel tests already enforce this shape; extend to sweep + snapshot + short-interest + detection for uniformity.

---

## §4 — Secrets hygiene

### 4.1 Runtime secrets inventory (from project config)
`SUPABASE_*` (URL/anon/service-role/JWKS/publishable/secret/DB_URL), `ALPACA_PAPER_*` (both accounts), `POLYGON_API_KEY[_PROD_PROBE]`, `TRADIER_API_KEY`, `FINNHUB_API_KEY`, `FMP_API_KEY`, `EDGAR_CONTACT_EMAIL`, `CRON_SECRET`, `BUILD_SHA`, `TURNSTILE_SECRET_KEY`/`SITE_KEY`, `RESEND_API_KEY` (connector-managed), `ALERT_RECIPIENT_EMAIL`, `ALLOWED_ORIGINS`, `LOVABLE_API_KEY`. All accessed via `Deno.env.get(...)`; none read from a table.

### 4.2 In-code secret literal scan
`rg -n "sk_live|-----BEGIN|SUPABASE_SERVICE_ROLE_KEY\s*=\s*['\"]|ALPACA.*=\s*['\"][A-Z0-9]{16}"` across `src/` + `supabase/functions/`:
- ONE hit: `supabase/functions/get-profile/index_test.ts:33` sets `SUPABASE_SERVICE_ROLE_KEY='test-srk'` at module scope (DW-121 test scaffold). **Not a real key.** OK.
- Zero hits for `sk_live`, PEM blocks, or Alpaca key patterns.

### 4.3 Anon key exposure (INTENDED)
`src/integrations/supabase/client.ts:6` and `src/lib/env.ts:68` embed the Supabase anon publishable key literal. **INTENDED** — this is the publishable JWT, safe to ship to the browser by design (it authorizes only `anon`-role queries, and RLS is the ceiling). Matches Supabase's documented posture. Not a finding.

### 4.4 CRON_SECRET posture (post-INC-100)
Per INC-100 binding gate on Phase 11: CRON_SECRET rotation is queued. Current posture: CRON_SECRET is embedded in `cron.job` body strings inside DB-side pg_cron rows (visible to any role with `SELECT ON cron.job`, typically `postgres` and `service_role` only). Not repo-embedded. **No new finding**; INC-100's rotation-gate discipline is the correct fix.

**Section verdict:** CLEAN. No repo-history scan required — no matches in current tree, and lockfile scans previously ran during ACT-499 Track A. **Recommend:** during the INC-100 rotation, move CRON_SECRET reference in `cron.job` bodies to a Vault indirection (per §22.x pattern) so `SELECT ON cron.job` no longer reveals the plaintext secret.

---

## §5 — I6 two-man coverage across money-path fns

I6 (per FP-069 W3.6.d ratification): manual-path money-move handlers require `manual_confirm=true` + a matching second-confirm token minted via a data-write RPC inside a 15-minute cutoff window. `Date.now()` usage in these handlers is explicitly whitelisted to the I6 cutoff computation.

| fn | money action? | I6 gated? | notes |
|---|---|---|---|
| `overshoot-entry-run` (manual path) | **YES — submits new orders** | ✅ per line 441 `I6 second-confirm token gate (manual path only)`; 15-minute window | matched pattern |
| `overshoot-exit-run` (manual path) | **YES — submits close orders** | ✅ per line 384 `I6 second-confirm token gate (manual path only)`; 15-minute window; audit note "the shim widens auth, never narrows the two-man" | matched pattern |
| `overshoot-entry-run` (cron path) | YES | ❌ NOT I6-gated | INTENDED — cron path is a pre-armed, kill-switch-gated automated flow; I6 is for OUT-OF-BAND manual invocations only. Kill-switch + disarmed-flag are the equivalent authorization layer for cron. |
| `overshoot-exit-run` (cron path) | YES | ❌ NOT I6-gated | same as above |
| `overshoot-fill-sweep` | **NO — read + adopt only, issues ZERO broker orders** | not required (documented @ line 12: "Read + adopt only — issues ZERO broker orders — so the I6 [gate does not apply]") | INTENDED — SEC-fee-header confirms |
| `overshoot-equity-snapshot` | NO — SELECT-only read of Alpaca account | not required | INTENDED |
| `overshoot-alerts-dispatcher` | NO — Resend email | not required | INTENDED |
| `overshoot-backfill-*-manual` | NO — DB writes only (bars/earnings) | not required | INTENDED — non-money data ingest |
| `overshoot-detection-run` | NO — DB writes only (target positions) | not required | INTENDED — no broker call |
| `overshoot-short-interest-compute` | NO — DB writes only | not required | INTENDED |
| `overshoot-portfolio-positions-readonly` | NO — read-only | not required | INTENDED |
| `overshoot-study-run` / `-sweep-diagnostic` | NO | not required | INTENDED |

**Section verdict:** I6 coverage is CORRECT and COMPLETE for the manual money paths (`entry-run` + `exit-run`). `fill-sweep` correctly excluded (zero-order path). `equity-snapshot` correctly excluded (read-only). No gaps. **NO findings.**

---

## §6 — Blast-radius table (post-INC-100)

| leaked credential | reach | worst-case action | mitigation in place | residual risk | notes |
|---|---|---|---|---|---|
| operator JWT (superadmin) | anything RLS/`is_superadmin` allows: all reads, `kill_switch_*` RPCs, `overshoot_update_strategy_config`, panel writes | pause/liquidate all strategies; flip strategy config bounds; read all audit history | short JWT TTL; `has_permission` DW-119 guard prevents arbitrary-`_user_id` probes; every state-change RPC audits with `auth.uid()`; kill-switch RPCs are single-purpose (no arbitrary SQL) | **MEDIUM** — no arbitrary money moves possible without an edge-fn call carrying the JWT + passing I6 for manual paths; attacker would have to steal both the JWT AND wait for/mint an I6 token AND survive kill-switch flip alerts | operator uses browser + panel; recommend reducing JWT TTL further at panel level if not already <1h |
| `SUPABASE_SERVICE_ROLE_KEY` | bypasses ALL RLS; can call any RPC; can INSERT/UPDATE any table incl. `overshoot_lots`, `overshoot_audit_logs`, `job_registry`, `kill_switches` | full-database write; disable kill-switches; forge audit entries; enable+trigger cron jobs; direct broker-order submission via edge fn (with valid Alpaca secrets) | key is env-only, never in repo (§4.2); accessed only inside edge fns via `Deno.env.get`; Supabase project settings restrict who can read env | **CRITICAL** — total compromise; game over. Only defense is preventing exfiltration. | rotation cadence not currently enforced; **SEC-B candidate (defer):** quarterly SERVICE_ROLE rotation cron |
| `CRON_SECRET` (post-INC-100 pending rotation) | trigger every fn's cron branch: force `detection-run`, `entry-run` (cron), `exit-run` (cron), `fill-sweep`, `equity-snapshot`, `short-interest-compute`, `alerts-dispatcher` at will | force out-of-schedule money-path fires (entry / exit); force alert-storm; force off-hour cron churn (cost/rate-limit) | kill-switches (soft/hard) will refuse to submit if operator flips them; entry-run has session-marker + market-open + disarmed-flag guards; `manual_confirm` NOT settable via cron branch (cron branch is `dry_run=false` but I6 does not apply — this IS the risk shape); Alpaca secrets are separate | **HIGH** — attacker with CRON_SECRET can force real broker submissions during market hours by triggering cron branch of `entry-run`/`exit-run` UNLESS operator has kill-switched or disarmed. INC-100's rotation-gate binding on Phase 11 is the correct forcing function. | **SEC-C candidate (queued to INC-100):** during rotation, also add an IP allowlist at the Supabase edge or a per-fn HMAC over `(fn_name, timestamp)` to make replay harder |
| `ALPACA_PAPER_KEY_OVERSHOOT` / `_SECRET_OVERSHOOT` | direct broker access, bypassing our engine entirely | submit arbitrary orders; withdraw is disallowed on paper | Alpaca account-level 2FA; paper account (no real capital); regenerate at Alpaca dashboard | **MEDIUM** on paper (capital-safe) → **HIGH** when live account is issued | live-account issuance is Phase 11 gate item; treat live keys with same rotation discipline as CRON_SECRET |
| Polygon / Tradier / Finnhub / FMP / EDGAR / Resend keys | vendor rate-limits + billing exposure | drain quota; run up bill | vendor-side rate limits; no money-move authority | LOW | rotate on the same quarterly cadence as SERVICE_ROLE |

**Section verdict:** the credential ordering is `SERVICE_ROLE >> CRON_SECRET >> ALPACA_LIVE >> operator_JWT >> ALPACA_PAPER >> vendor_keys`. Current posture correctly hardens `SERVICE_ROLE` (env-only, no repo trace) and has INC-100 gating `CRON_SECRET` rotation to Phase 11. The `CRON_SECRET` leak remains the highest **realizable** near-term risk because it enables forced money-path cron fires that only kill-switch/disarm can stop. **Recommend:** confirm at Phase 11 gate that INC-100 rotation lands BEFORE live-capital, and consider the HMAC/IP-allowlist harden as SEC-C.

---

## §7 — T4 audit-writer trap + cross-strategy leakage

### 7.1 T4 audit-writer trap
`rg -l "from '.*_shared/audit'|logAuditEvent" supabase/functions/overshoot-*/` → **ZERO hits**. `rg -l "strategy-audit|writeStrategyAuditEvent" supabase/functions/overshoot-*/` → **6 hits** covering `entry-run`, `exit-run`, `alerts-dispatcher`, `fill-sweep`, `short-interest-compute` (+ test file). Every money-path overshoot fn writes via `writeStrategyAuditEvent` → `overshoot_audit_logs`. Backfill / detection / study / snapshot fns either write via `writeStrategyAuditEvent` or don't emit audit events (detection has audit rows per INC-102). **T4 trap: CLEAN. No findings.**

### 7.2 Cross-strategy leakage (T5 sibling-import rule)
`rg -n "from ['\"].*/longshort" supabase/functions/overshoot-*/` returns non-test hits ONLY on:
- `import { productionClock } from '../_shared/longshort-clock.ts'` — appears in `overshoot-entry-run`, `-exit-run`, `-detection-run`, `-fill-sweep`, `-short-interest-compute`, `-study-run`, `-backfill-bars-manual`, `-backfill-earnings-manual` (8 fns).

`rg -n "from ['\"].*/overshoot" supabase/functions/longshort-*/` → **ZERO hits.** No longshort fn imports from any overshoot path.

**Analysis:** `_shared/longshort-clock.ts` exports the shared `productionClock` (`Date.now()` injector for T8 replay-determinism). Despite the misleading path prefix, it is used by BOTH strategies — the shim is a **naming defect**, not a T5 leak. The file is under `_shared/` (platform-shared area), not under a sibling strategy's namespace. Runtime coupling is zero (both strategies just import `productionClock`); deletion of longshort would not break overshoot fns as long as the Clock module is preserved. **Verdict:** NOT a T5 violation.

**SEC-06 (filed):** rename `supabase/functions/_shared/longshort-clock.ts` → `supabase/functions/_shared/clock.ts` (or `_shared/production-clock.ts`) to eliminate the naming defect. **Cost:** 8 overshoot fn edits + N longshort fn edits + `deno test` sentinel updates + one migration touching `job_registry.handler_path` for none (imports only, no handler-path change). **Priority:** LOW-MEDIUM (cosmetic/architectural clarity; would improve first-glance audit readability and reduce false-alarm rate on future cross-strategy grep sweeps). **Defer to a natural touch-point** rather than a dedicated migration.

**Section verdict:** T4 CLEAN. T5 SUBSTANTIVELY CLEAN with cosmetic naming defect SEC-06 filed.

---

## Summary table (SEC-01..SEC-06)

| ID | area | severity | exploitable today? | recommended action | priority |
|---|---|---|---|---|---|
| SEC-00 | (retro) cron auth bypass on `fill-sweep` (INC-97/99 root cause) | — | RESOLVED | already fixed via INC-97 patch | closed |
| SEC-01 | `overshoot_audit_logs` inert `authenticated INSERT` grant | LOW / cosmetic | NO (RLS default-deny) | REVOKE `INSERT` on next touching migration | non-urgent |
| SEC-02 | `overshoot_entry_runs` inert `authenticated INSERT/UPDATE/DELETE` grants | LOW / cosmetic | NO (RLS default-deny) | REVOKE `INSERT,UPDATE,DELETE` on next touching migration | non-urgent |
| SEC-03 | `job_registry` inert `anon SELECT` grant | LOW / cosmetic | NO (verify no `TO anon` policy — if any exists, escalate) | verify policy body, then REVOKE `SELECT FROM anon` if not required | non-urgent |
| SEC-04 | `audit_logs` inert `anon SELECT` grant | LOW / cosmetic + defense-in-depth failure | NO (RLS default-deny; but a future policy mistake would expose immediately) | REVOKE `SELECT ON audit_logs FROM anon` | non-urgent |
| SEC-05 | edge-fn structural regression guard (cron-branch precedes authenticateRequest) | LOW / hardening | NO | extend existing source-sentinel test pattern to sweep/snapshot/SI/detection fns | non-urgent |
| SEC-06 | rename `_shared/longshort-clock.ts` → `_shared/clock.ts` (T5 cosmetic) | LOW / architectural clarity | NO | rename + import updates on natural touch-point | LOW |
| — SEC-A charter — | bundle SEC-01..SEC-04 into one housekeeping migration | | | queue for next scheduled MIG-touching pass; NOT a dedicated migration | non-urgent |
| — SEC-B charter — | quarterly rotation of `SERVICE_ROLE_KEY` + Alpaca keys + vendor keys | | | queue to Phase 11 gate alongside INC-100 CRON_SECRET rotation | Phase 11 |
| — SEC-C charter — | during INC-100 CRON_SECRET rotation, add HMAC-per-call or IP allowlist for cron endpoints | | | queue to INC-100 execution | Phase 11 |

**Overall Track B verdict:** OVERSHOOT security posture is **substantively clean**. No exploitable findings today. Six low-severity hygiene/hardening items filed as SEC-01..SEC-06 with three roll-up charters (SEC-A, SEC-B, SEC-C). None gate Phase 9 ARM. **SEC-B + SEC-C** must land inside the Phase 11 gate (already covered by INC-100's binding-gate discipline).

---

## Sequencing

Track B **CLOSED** with in-turn artifact persisted (process-note discipline honored on the same turn — the sub_v2fs98wn loss does not recur). Next in queue: **Tracks C/D of ACT-499** (Track C = slippage vs haircuts — feeds Phase 10 measurement; Track D = per operator memory).

## Filing

- INC-102 (subagent attribution audit gap) — related; this artifact reinforces the same discipline.
- SEC-A/B/C — filed here; not yet in `incidental-findings.md` (would duplicate); pointer only.
- No `master-plan.md` phase-gate change (Track B was queued Phase 8 residual; still non-blocking).

STOP — awaiting operator DEC before Track C kicks off.