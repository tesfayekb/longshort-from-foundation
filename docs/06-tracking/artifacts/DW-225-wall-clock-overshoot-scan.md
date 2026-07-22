# DW-225 — Wall-Clock Scanner Overshoot-Scope Extension: Step (a) SCAN-ONLY Report

> **Charter:** DW-225 (filed 2026-07-22, this turn).
> **Step:** (a) SCAN-ONLY — scanner is NOT armed yet.
> **Scope probed:** `supabase/functions/overshoot-*`, `supabase/functions/_shared/overshoot*`, `src/features/overshoot/`.
> **Method:** `rg` for the four DEC-034(4) banned patterns (`Date.now()`, no-arg `new Date()`, `performance.now()`, `Temporal.Now.*`), single-line-comment lines stripped, test files excluded, JSDoc prose excluded.
> **Rule:** INC-125 raw-evidence-only — every hit below is a verbatim grep line.

## §1 Findings (INC-108 taxonomy)

Legend — classification:
- **T** = Telemetry (duration; not a value that enters a decision surface).
- **P** = Ingest-provenance stamp (the timestamp IS what is being recorded, not derived).
- **W** = Alert/lookback window (wall-clock IS the query axis).
- **S** = Operator-security freshness window (manual-confirm token TTL).
- **U** = UI display clock ("as of", "days held" chip).
- **X** = **True §2-axiom-4 defect** (wall-clock leaks into financial-computation decision).

| # | file:line | verbatim | class | rationale |
|---|---|---|---|---|
| 1 | `overshoot-detection-run/index.ts:395` | `const t0 = performance.now();` | T | `durations_ms.total_ms`. |
| 2 | `overshoot-detection-run/index.ts:418,442` | `performance.now()` around bars ingest | T | `durations_ms.bars_append_ms`. |
| 3 | `overshoot-detection-run/index.ts:424` | `VALUES ('bars', ${new Date().toISOString()}::timestamptz, ...)` | P | `overshoot_backfill_runs.started_at`. |
| 4 | `overshoot-detection-run/index.ts:455,487` | `performance.now()` around earnings ingest | T | `durations_ms.earnings_append_ms`. |
| 5 | `overshoot-detection-run/index.ts:464,486` | `new Date().toISOString()::timestamptz` | P | Earnings backfill `started_as_of`/`completed_as_of`. |
| 6 | `overshoot-detection-run/index.ts:529,543` | `performance.now()` around kernel | T | `durations_ms.kernel_ms` — AROUND kernel, not inside. |
| 7 | `overshoot-detection-run/index.ts:565,584` | `performance.now()` around SI read | T | `durations_ms.si_read_ms`. |
| 8 | `overshoot-detection-run/index.ts:777,779` | `performance.now()` around detector | T | `durations_ms.detector_ms` — AROUND detector, not inside. |
| 9 | `overshoot-detection-run/index.ts:869` | `const nowIso = new Date().toISOString();` | P | Detection-run row `detected_at` write. |
| 10 | `overshoot-detection-run/index.ts:888` | `performance.now()` final | T | Closing `durations_ms.total_ms`. |
| 11 | `overshoot-detection-run/index.ts:964` | `VALUES (${args.asOfDay}::date, ${new Date().toISOString()}::timestamptz, ...)` | P | `overshoot_detection_runs.detected_at`. |
| 12 | `overshoot-entry-run/index.ts:468` | `const cutoff = new Date(Date.now() - OVERSHOOT_MANUAL_CONFIRM_WINDOW_MS).toISOString();` | S | DEC-023 manual-confirm 15-min TTL; cron path exempt (`manualConfirm !== true`). |
| 13 | `overshoot-exit-run/index.ts:472` | (same pattern as #12) | S | Same DEC-023 gate. |
| 14 | `overshoot-study-run/index.ts:244,374,426,494` | `performance.now()` t0 + totalMs | T | Study-run is offline research; telemetry only. |
| 15 | `overshoot-study-run/index.ts:421` | `completed_at: new Date().toISOString()` | P | Study-run completion stamp. |
| 16 | `overshoot-alerts-dispatcher/index.ts:248,275,318,350,585` | `new Date(Date.now() - 24*3600*1000).toISOString()` (and 7d) | W | Dispatcher scan windows — the alert-query axis. |
| 17 | `overshoot-alerts-dispatcher/index.ts:444,495` | `const now = new Date();` | W | `dispatched_at` stamp on alert rows. |
| 18 | `overshoot-alerts-dispatcher/index.ts:608` | `const bucket = new Date().toISOString().slice(0,10);` | W | Daily throttle bucket key. |
| 19 | `overshoot-equity-snapshot/index.ts:62` | `const nowTs = new Date();` | P | `overshoot_equity_snapshots.fetched_at`. |
| 20 | `overshoot-tradier-chain-probe/index.ts:114` | `const todayIso = new Date().toISOString().slice(0,10);` | T | Read-only probe; no money path. |
| 21 | `overshoot-portfolio-positions-readonly/index.ts:44` | `const ts = new Date();` | P | Read-only view timestamp. |
| 22 | `src/features/overshoot/components/portfolio/reconcile.ts:65` | `daysHeldFrom(entryIso, now: Date = new Date())` | U | Injected-`now` param; UI "days held" chip only. |
| 23 | `src/features/overshoot/components/OvershootOverview.tsx:101` | `const now = new Date();` | U | UI "as of" render clock. |

**Kernel modules (`_shared/overshoot/*`) — CLEAN.** Zero raw pattern hits in `polygon-short-interest-fetcher.ts`, `polygon-grouped-daily-fetcher.ts`, `earnings-calendar-fetcher.ts`, `polygon-daily-ohlcv-fetcher.ts`. Only JSDoc prose warnings ("no new Date() in this module") — the discipline is already conventionally enforced in the kernel layer.

## §2 Verdict

| bucket | count | disposition |
|---|---|---|
| **X (Tier-A defect on money path)** | **0** | 🟢 No wall-clock leakage into detection kernel, entry decision, exit decision, or sizing surfaces. |
| T (telemetry) | 12 | Legitimate — measures the run, doesn't feed the run. |
| P (ingest-provenance) | 6 | Legitimate — the timestamp IS the value. |
| W (dispatcher lookback) | 7 | Legitimate — wall-clock is the alert-query axis. |
| S (operator-security TTL) | 2 | Legitimate — DEC-023 manual-confirm; cron path exempt. |
| U (UI display) | 2 | Legitimate — Vite-tree render only. |
| **total** | **29** | |

**Headline: NO §2-axiom-4 defects on money paths.** The overshoot tree observes the DEC-034(4) discipline in practice; the kernel is clean; handler-layer hits are all T/P/W/S/U classifications with prior ADR precedent (ADR-002 wall-clock harness; ADR-003 per-line override — the pattern ACT-554-a used).

## §3 Step (b) plan — ADR-003 override annotations

All 29 hits are ADR-003-eligible under the comment pattern
`// allow-now-in-business-logic: ADR-003 <class> — <one-line-rationale>`
appended to each hit. **No code fix required — no defect exists.** Annotation pass is mechanical and lands in the same commit as the scanner extension.

## §4 Step (c) plan — scanner arm

1. Extend `SCOPE_GLOB_PREFIXES` in `scripts/check-wall-clock.ts:43-48` to add:
   - `supabase/functions/overshoot-`
   - `supabase/functions/_shared/overshoot`
   - `src/features/overshoot/services/` (defer `components/` until a UI clock policy is written — DW-225.a follow-up)
2. Regenerate `scripts/check-wall-clock_test.ts` scope cases (positive + excluded overshoot fixtures).
3. Land §3 annotations in the same commit so CI stays green on arm.
4. Update `docs/banned-patterns.md:18` scope line to include the overshoot prefixes.

**Gate:** step (b) annotations must land BEFORE step (c) enables the scanner, else CI reds immediately.

## §5 Standing rule

DW-225(a) is the reproducible protocol for future strategy modules: SCAN → classify → annotate → arm. Do NOT arm scope before annotation lands; do NOT annotate a hit as ADR-003 without recording the class letter and rationale.
