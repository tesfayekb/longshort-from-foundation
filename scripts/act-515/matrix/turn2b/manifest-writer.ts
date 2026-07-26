// ACT-515 Matrix — Turn-2B: manifest-writer.
//
// Emits the standing-grammar Turn-2B manifest at
// scripts/act-515/matrix/turn2b/turn-2b-manifest.json. Consumed by the
// R1 receipt turn as the sealed-set provenance record.

import type { PartitionParityResult } from './parity-harness.ts';

export interface Turn2BManifest {
  readonly generatedAtMs: number;      // caller injects Clock.now
  readonly source_version: string;     // matrix-export fn source_version
  readonly window: { start: string; end: string };
  readonly stageA: {
    readonly pairs_total: number;
    readonly pages: number;
    readonly bars_rows: number;
    readonly file_sha256: string;
  };
  readonly stageB: {
    readonly lots_by_side: { long: number; short: number };
    readonly windows_total: number;
    readonly batches: number;
    readonly bars_rows: number;
    readonly file_sha256: string;
    readonly clamped_lot_count: number;
  };
  readonly spy: {
    readonly rows: number;
    readonly file_sha256: string;
  };
  readonly parity: {
    readonly partitions_sampled: number;
    readonly all_green: boolean;
    readonly per_partition: ReadonlyArray<{
      readonly session: string; readonly side: string;
      readonly rows: number; readonly admits: number;
      readonly stops: number; readonly passed: boolean;
      readonly typed_skips: Readonly<Record<string, number>>;
    }>;
  };
  readonly mark_gap_days: number;
  readonly prune_risk_sessions: number;
  readonly call_count: number;
  readonly rip_probe: {
    readonly attempted: boolean;
    readonly persists_under_triad: boolean;
    readonly oneshot_removed: boolean;
  };
}

export async function writeManifest(path: string, m: Turn2BManifest): Promise<void> {
  await Deno.writeTextFile(path, JSON.stringify(m, null, 2) + '\n');
}

export function foldPartitions(
  results: ReadonlyArray<PartitionParityResult>,
): Turn2BManifest['parity']['per_partition'] {
  return results.map(r => ({
    session: r.session, side: r.side,
    rows: r.rowsChecked, admits: r.denoAdmits.length,
    stops: r.stops.length, passed: r.passed,
    typed_skips: { ...r.typedSkipsByClass },
  }));
}