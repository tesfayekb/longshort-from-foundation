# ACT-499 — Consolidated Findings Index (Weekend Audit)

**Bracket:** ACT-499 (Tracks A/B/C/D + Part 1/Part 2 side-quests + ACT-501/502)
**Window:** 2026-07-10 → 2026-07-11 (single weekend session)
**Author:** AI (in-turn)
**Date:** 2026-07-11

---

## 1. Bracket outcomes at a glance

| bracket | status | verdict | artifact |
|---|---|---|---|
| **ACT-500 Part 1** — 5-name budget policy | CLOSED | DEC ratified; ACT-501 executed | `ACT-500-PART1-DEC.md` (external), `ACT-501` engine change |
| **ACT-501** — daily-budget engine change | SHIPPED, VERIFIED CLEAN | K=5 admit cap live in `overshoot-entry-run` | engine files (verified by supervisor) |
| **ACT-500 Part 2** — ranking integrity | CLOSED | decile monotonic → RPSC candidate + RHA candidate filed to W5 | `ACT-500-PART2-RANKING-INTEGRITY.md` |
| **ACT-502** — same-session recycling | CLOSED **NO-GO** | rigorous frame +6.7 bps < 8 bp floor; TRIP-502-A filed | `ACT-502-RESULTS-...md` |
| **Track A** — live-DB reconciliation | CLOSED | INC-98 filed (job_registry stale row) | `docs/06-tracking/live-db-*` |
| **Track B** — security audit | CLOSED | substantively clean; SEC-A hygiene bundle queued | `ACT-499-TRACK-B-SECURITY.md` |
| **Track C** — ROI live numbers (slippage) | OPEN (entry leg CLOSED) | entry slippage ≈ 0 bps vs mid; exit/borrow/commission pending | `ACT-499-TRACK-C-ROI-LIVE-SLIPPAGE.md` |
| **Track D** — perf + ops cost | CLOSED | detection kernel busts wall-clock at 1.6× universe; retention gap filed | `ACT-499-TRACK-D-PERF-OPS-COST.md` |

---

## 2. Load-bearing measurements (the numbers that DEC-drove the night)

1. **Entry slippage vs mid = −0.22 bps** (90% CI [−0.76, +0.32]), n=50 — Track C §4
2. **Detection kernel = ~90s** on 839-symbol universe; **150s wall-clock ceiling busts at ~1.6× universe** — Track D §2
3. **Rank-decile fwd_return_10d monotonic** (top decile ~120 bps gross) — Part 2 §5
4. **Rigorous same-session recycling = +6.7 bps/cycle** [5.2, 8.2] — below 8 bp floor → NO-GO — ACT-502 §5
5. **`cron.job_run_details` = 654 MB uncapped**, growing ~11 MB/day — Track D §4

---

## 3. W5 candidate register (post-audit)

| id | title | source | priority |
|---|---|---|---|
| **W5-01** | (pre-existing) | prior bracket | — |
| **W5-02** | (pre-existing) | prior bracket | — |
| **W5-03** | RHA — rank-horizon alignment (5d vs 10d) | Part 2 refinement | precedes RPSC if both proceed |
| **W5-04** | Exit-slippage measurement | Track C §7 | **blocks TRIP-502-A** |
| **RPSC** | Rank-proportional sizing candidate | Part 2 | Era-3 gate |

---

## 4. Charter register (post-audit)

| id | title | track | urgency |
|---|---|---|---|
| **SEC-A** | REVOKE inert grants on 4 tables | B | bundle on next touching migration |
| **SEC-B** | Rotate SERVICE_ROLE_KEY quarterly | B | rides INC-100 Phase 11 |
| **SEC-C** | HMAC + IP-allowlist CRON_SECRET | B | rides INC-100 Phase 11 |
| **SEC-06** | Rename `_shared/longshort-clock.ts` → `clock.ts` | B | fold into next frontend/shared touch |
| **PERF-D-A** | Shard detection kernel by symbol range | D | **blocks any universe expansion beyond ~1,350** |
| **PERF-D-B** | Retention on `cron.job_run_details` + `net._http_response` | D | within W5 |
| **PERF-D-C** | Capacity-dilution study at 10× universe | D | 10× rollout DEC |
| **TRIP-502-A** | Re-run ACT-502 rigorous frame with measured slippage | C | fires on W5-04 delivery (~07-22) |

---

## 5. Incidental findings filed this bracket

| id | title | source |
|---|---|---|
| INC-98 | `job_registry` stale-row drift | Track A |
| INC-100 | (referenced — CRON_SECRET rotation gate; pre-existing) | prior bracket |
| INC-101 | (referenced — detection attribution audit gap) | Part 1 side |
| INC-102 | Detection-run attribution rows (dry + live) must carry handler-version echo; git_sha staleness | Part 1 side + Part 2 delta |
| INC-103 | Log `reference_mid` on `overshoot.entry.submitted.entry` metadata | Track C |
| INC-104 | Measure edge-function peak memory during detection kernel | Track D |

---

## 6. Standing discipline added this bracket

1. **Subagent-report in-turn persistence** — subagent report bodies MUST be persisted to the artifact tree in the same turn they return. Motivating event: `sub_v2fs98wn` (ACT-499 Track B first-attempt) report body was never persisted, forcing re-audit under Option 3. Added to prompt-playbook's subagent section (per operator DEC).
2. **Attribution audit row on every detection-run invocation** (dry + live) — per INC-102, closes the b69d95e5 attribution gap. Charter to be scheduled.
3. **RANK semantics changes are VERSION-HASH events** — carry fixture regeneration cost (documented under RHA / W5-03).

---

## 7. Deferred / parked

- **Pre-close entry** — parked permanently alongside same-session recycling under TRIP-502-A tripwire discipline.
- **Capacity-dilution proof at 10× universe** — PERF-D-C; blocks 10× go/no-go DEC.
- **Tax drag analytical pass** — deferred to Track D-adjacent or later.

---

## 8. Night verdict

**Weekend audit CLOSED.** Six brackets ratified, one Tier-A engine change shipped and verified clean, one NO-GO ratified with tripwire, security posture substantively clean, entry-slippage headline confirms W5 haircuts are conservative, operational headroom identified as the near-term bottleneck (PERF-D-A blocks universe expansion). Exit-slippage measurement window opens **2026-07-22**; TRIP-502-A fires or dies on that data.

**The night is done.**

---

## 9. Standing state into Monday (operator, 2026-07-11)

- Nothing executes over the weekend except the armed autonomous legs (dispatcher, SI, detection, snapshot, fill-sweep).
- **Next build priority:** ACT-493 (exit adoption + Option-B smoothing scope, deadline **2026-07-17**).
- **Monday attended bracket:** ACT-501 / cap-probe behavioral proof (last manual entry bracket → autonomous adoption proof).
- **PERF-D-A** wired as binding gate on Phase-13 shadow-universe expansion.
- **Exit-slippage window** opens 2026-07-22 → decides TRIP-502-A.