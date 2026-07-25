// ACT-515 fixture-ii sha-stamp registry — INC-135 pre-commit anchor.
//
// The four SHAs below are BYTE-PINNED constants computed from the emitted
// jsonl files IMMEDIATELY AFTER `deno run scripts/act-515/build-fixture-2023q2.ts`
// and BEFORE any kernel replay against them (per INC-135 pre-fire commit gate).
// The gate test (`gate-fixture-ii_test.ts`) reads each fixture from disk,
// computes its SHA-256, and asserts equality against these pins. Any drift =
// a caller regenerated the fixture without updating this file (or vice versa);
// the gate fails hard.
//
// Committed 2026-07-25T23:20:13Z (SELECT now() = gate_turn2_open), TURN-2 FULL RE-PICK.
// Supersedes ALL prior DRAFT-INVALID sha-stamps of these files (two jointly
// repaired defects: SHORT LONG-generalization + LONG off-by-one — see
// build-fixture-2023q2.ts SUPERSESSION NOTE and INC-143 instance #3).

export const FIXTURE_II_SHAS: Readonly<Record<string, string>> = Object.freeze({
  '2023-Q2-hand-truth.jsonl':  '0cd0d6f921814444a577b8508d8e77f1c76383a34f6632504bc3c85c67112c17',
  '2023-Q2-bars.jsonl':        '34fc80857120898c0b98be67d1eb44376965732aeb67fa36c7a122777a1322a9',
  '2023-Q2-calendar.jsonl':    'fc94971a56aa0967e1f4448ee16f63d42f07f8aa357029c211203c7442ccbc7f',
  '2023-Q2-checkpoints.jsonl': 'c10fe3064e51b811710921f1667ad853cb9f927a1927fdf932fea6c7d6167601',
});