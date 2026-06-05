/**
 * Within-sector GICS z-score normalization, clipped at ±3.
 *
 * Applied uniformly across all 9 Phase 2 signals — Phase 2.1 (FP-009 Bucket A
 * Commit A1) establishes the pattern; Phases 2.2 through 2.9 import this
 * module unchanged. Per FP-009 survey §4 this is shared infrastructure.
 *
 * The ±3 clip is presentation, not a statistical truncation choice: values
 * beyond ±3 in a sector typically indicate either a true outlier (legitimate
 * but extreme reading) or a data-quality issue (where the sector mean / std
 * is unreliable for that ticker). Custom `clipAt` is accepted for future
 * signal-specific tuning but defaults to 3 per §4.4.1.
 *
 * Typed-absence semantics (mirrors signal-types.ts `SignalSkipReason`):
 *   - Ticker with `gics_sector === null` → not in any sector group → output
 *     `value: null` (sector required for within-sector normalization;
 *     orchestrator-side: `missing_sector` skip).
 *   - Sector with 1 member (or all-equal values, std=0) → z-score undefined
 *     → output `value: null` for that member (`singleton_sector` skip).
 *   - Ticker with input `value === null` (e.g., insufficient history
 *     upstream) → output `value: null` (passthrough; preserves the
 *     upstream typed-absence rather than reassigning a fabricated zero —
 *     anti-phantom-default rule).
 *
 * Determinism: pure function. No `Date.now()`, no random, no I/O. Iteration
 * over `Map.entries()` preserves insertion order per ES2015 spec — output
 * ordering is stable as long as input ordering is stable. Tests rely on this.
 *
 * Owner: longshort (FP-009 Bucket A Commit A1)
 * Classification: shared infrastructure (consumed by 9 signal modules).
 */

const CLIP_AT_DEFAULT = 3;

export interface ZScoreInput {
  ticker: string;
  value: number | null;
  gics_sector: string | null;
}

export interface ZScoreOutput {
  ticker: string;
  value: number | null;       // z-score clipped at ±clipAt; null per the semantics above
  gics_sector: string | null;
}

export function zScoreNormalizeWithinSector(
  inputs: ReadonlyArray<ZScoreInput>,
  opts: { clipAt?: number } = {},
): ZScoreOutput[] {
  const clipAt = opts.clipAt ?? CLIP_AT_DEFAULT;

  // 1) Group by sector. Tickers with null sector OR null value bypass the
  //    sector group and are emitted with value=null (typed-absence passthrough).
  const bySector = new Map<string, Array<ZScoreInput>>();
  const passthrough: ZScoreInput[] = [];
  for (const input of inputs) {
    if (input.gics_sector === null || input.value === null) {
      passthrough.push(input);
    } else {
      const bucket = bySector.get(input.gics_sector) ?? [];
      bucket.push(input);
      bySector.set(input.gics_sector, bucket);
    }
  }

  // 2) Compute mean + std + z-score within each sector. Singleton sectors
  //    (n=1 → std=0) and all-equal-values sectors (variance=0 → std=0)
  //    both yield undefined z-scores → null for all members.
  const results: ZScoreOutput[] = [];
  for (const [sector, members] of bySector) {
    const values = members.map((m) => m.value as number);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sumSqDiff = values.reduce((a, v) => a + (v - mean) ** 2, 0);
    // Sample std (Bessel-corrected); n-1 denominator. For n=1 → 0 → singleton path.
    const std = members.length > 1 ? Math.sqrt(sumSqDiff / (members.length - 1)) : 0;

    if (std === 0) {
      for (const m of members) {
        results.push({ ticker: m.ticker, value: null, gics_sector: sector });
      }
      continue;
    }

    for (const m of members) {
      const raw_z = ((m.value as number) - mean) / std;
      const clipped = Math.max(-clipAt, Math.min(clipAt, raw_z));
      results.push({ ticker: m.ticker, value: clipped, gics_sector: sector });
    }
  }

  // 3) Append passthrough (null-sector / null-value) entries with value=null.
  for (const input of passthrough) {
    results.push({ ticker: input.ticker, value: null, gics_sector: input.gics_sector });
  }

  return results;
}