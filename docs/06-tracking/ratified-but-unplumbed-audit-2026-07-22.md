# Ratified-But-Unplumbed Audit — 2026-07-22

**Charter:** operator ruling in the DEC-504-4 wire ruling (2026-07-22). Named
defect class: **ratified-but-unplumbed** — an exported helper whose runtime
call-sites are all zero, despite being ratified by a DEC / ACT and marked
"live" in its module docstring.

**Method (deterministic, re-runnable):**

```
cd supabase/functions
grep -rE "^export (async )?function [A-Za-z_]+" \
     _shared/overshoot/ _shared/overshoot-execution/     # enumerate exports
# For each export name, grep for consumers, EXCLUDING:
#   - the definition file itself
#   - its co-located *_test.ts
#   - docs/ paths
grep -rn "<name>" --include="*.ts" .                     # count real call-sites
```

A name is **GAP** iff zero call-sites survive the exclusion rules AND the
function is money-path or audit-path (i.e., landing it would change engine
behavior). Type re-exports, purely-test helpers, and pass-through wrappers
are classified **intentionally-dormant** and do not open an INC.

---

## Sweep results

| Export | Site | Call-sites (runtime) | Class | Notes |
|---|---|---:|---|---|
| `decideSleeveReallocation` | `_shared/overshoot-execution/sizing.ts:129` | **0** → 0 | **GAP → CLOSED** | Original DEC-504-4 finding. The DEC-504-4 wire lands `_shared/overshoot/sleeve-reallocation-writer.ts` + detection-run consumer; the sizing.ts export is now redundant and slated for removal on the next housekeeping pass (kept for one deploy cycle so any external caller surfaces before deletion). |
| `overshootSleeveAllocation` | `_shared/overshoot/si-freshness.ts:238` | 0 → 1 | **wired (this commit)** | Consumed by `overshoot-detection-run/index.ts` post-wire. |
| `siStaleActive` | `_shared/overshoot/si-freshness.ts:68` | prior 0 → 1 | **wired (this commit)** | Consumed by `overshoot-detection-run/index.ts` post-wire for the book-level flag. Prior consumers were per-row (`isSiRowStale`) only. |
| `siCalendarDaysBetween` | `_shared/overshoot/si-freshness.ts:31` | multi | wired | Consumed by sibling predicates and detector. |
| `isSiRowStale` | `_shared/overshoot/si-freshness.ts:45` | multi | wired | Detector per-ticker squeeze gate. |
| `analystRevisionStaleActive` | `_shared/overshoot/si-freshness.ts:145` | multi | wired | Detector three-guard bundle. |
| `analystRevisionStaleWarnActive` | `_shared/overshoot/si-freshness.ts:169` | 1 | wired | Detection-run warn emitter. |
| `maStaleActive` | `_shared/overshoot/si-freshness.ts:188` | multi | wired | Detector three-guard bundle. |
| `withinCalendarDayWindow` | `_shared/overshoot/si-freshness.ts:204` | multi | wired | Detector proximity gates. |
| `buildBarsAppendRows`, `appendForwardEarnings`, `isEarningsCalendarStale`, `bandLabelFor`, `runDetector`, `computeRegime`, `shouldThrottleUnderRegime` | detector + append/regime | multi | wired | Detection-run kernel. |
| `sideAllocationPct`, `computeTargetSizing`, `assertBuyingPowerCoversNotional` | `_shared/overshoot-execution/sizing.ts` | multi | wired | Entry-run sizing overlay. |
| `evaluateI5PreOpenRecheck`, `constructEntryLimitPrice`, `constructExitLimitPrice`, `computeOpenMVBySide`, `evaluateAllocationCap`, `evaluateDailyBudget`, `computePriorSpySessionDate`, `resolveDetectionRunForEntry`, `computeSessionAge`, `reconcileOpenPositions` | overshoot-execution | multi | wired | Entry / exit / reconciliation engines. |
| `buildOvershootClientOrderId`, `parseOvershootClientOrderId`, `incrementAttempt` | client-order-id | multi | wired | Alpaca CID emitter. |
| `isOvershootIntent`, `holdingSessionsForSide`, `flowForIntent`, `isOvershootTerminal`, `legalTerminalsFor`, `newAttempt`, `transition`, `retryShape` | intents / state-machine | multi | wired | Engine state machine. |
| `fetchWithTimeout`, `fetchWithTimeoutAndRetry`, `parseCsvLine`, `findHeaderRowIndex` | csv-fetch-primitives | multi | wired | Backfill utilities. |

**GAP count after wire: 0.** The DEC-504-4 finding is closed by this commit.
`decideSleeveReallocation` is retained for one deploy cycle (see notes) and
is tracked for removal in the next housekeeping ACT.

---

## Follow-ups

- **HK-001 (housekeeping):** delete `decideSleeveReallocation` from
  `_shared/overshoot-execution/sizing.ts` after one deploy confirms no
  surprise external caller. No INC opened (superseded, not defective).
- **Standing rule (added to the class catalog):** any new `export function`
  added under `_shared/overshoot*` MUST have at least one runtime consumer
  in the same PR, or a co-located `INTENTIONALLY-DORMANT.md` marker
  explaining the deferred plumbing plan. Enforcement is manual pending a
  CI grep-gate.