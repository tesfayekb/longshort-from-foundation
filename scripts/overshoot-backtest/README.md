# scripts/overshoot-backtest/ — Portfolio Backtest Engine

**Status:** SCAFFOLD (2026-07-14). **Classification:** ANALYSIS TOOLING — not money-path.
**Governance:** operator ruling 2026-07-14 (Option A, amended, item 2) — build discipline
applies (durable, tested, deterministic-fixture-replay validation gate) but no
money-path operator ratification blocks are required to run.

## Purpose

Land a reproducible portfolio-backtest engine as the corrective to INC-103 (ACT-514
`PROVENANCE-UNKNOWN`). Once the engine passes its deterministic-fixture-replay validation
gate against a hand-checkable sub-period, it will re-derive:

1. **ACT-515 (a)** — 1.0× capped baseline (cash-deployable).
2. **ACT-515 (b)** — 2.0× Reg-T-consistent margin (interest + call flags).
3. **ACT-515 (c)** — SPY buy-and-hold benchmark.
4. **ACT-515 (d)** — regime-exit counterfactuals (d1 full-exit, d2 tail-only, d3 halved).
5. **ACT-516** — H1-2022 window re-run on existing bar corpus.
6. **ACT-514** — the original readout — as the FIRST validation target (provenance heals
   where matches, diverges to a finding where not).

## Layout (planned)

```
scripts/overshoot-backtest/
├── README.md                       (this file)
├── engine/
│   ├── types.ts                   (Lot, EquitySnapshot, Config, Result — public types)
│   ├── clock.ts                   (deterministic replay clock — NO wall clock in kernel)
│   ├── config.ts                  (tri-config schema: 1x/2x/spy + d1/d2/d3)
│   ├── admit.ts                   (rank-order admission w/ aggregate wallet cap)
│   ├── size.ts                    (constant-notional + compounding sizing variants)
│   ├── margin.ts                  (Reg-T 25% maintenance flag, 50 bps/mo interest line)
│   ├── regime.ts                  (SPY-drawdown regime bands; d1/d2/d3 counterfactuals)
│   ├── replay.ts                  (day-by-day loop over bars + arrivals)
│   └── report.ts                  (5×12 leverage table + per-config detail matrices)
├── fixtures/
│   └── validation-2023-Q2/        (hand-checkable sub-period — 3 months, ≤30 lots)
│       ├── arrivals.jsonl         (frozen arrival stream)
│       ├── bars.jsonl             (frozen bar snapshots)
│       ├── spy.jsonl              (frozen SPY closes)
│       ├── expected.json          (hand-computed expected results — the gate)
│       └── README.md              (derivation notes for the expected values)
├── run.ts                         (CLI entry — reads config + fixture, writes report)
└── tests/
    ├── admit_test.ts
    ├── size_test.ts
    ├── margin_test.ts
    ├── regime_test.ts
    ├── replay_test.ts
    └── validation-2023-Q2_test.ts  (THE GATE — must produce expected.json exactly)
```

## Validation gate (pre-committed BEFORE first a/b/c/d run)

`tests/validation-2023-Q2_test.ts` MUST pass byte-for-byte identity against
`fixtures/validation-2023-Q2/expected.json` on a clean `deno test` run before ANY tri-
config or counterfactual number is quoted as decision input.

The fixture window is a **hand-checkable 3-month sub-period** (target: 2023-Q2, a
quiet-regime window where slot admissions are sparse and hand-verification is tractable).
Expected values are computed **by hand** (spreadsheet) from the frozen arrivals + bars,
not by the engine itself — the gate proves the engine matches hand-arithmetic.

## Anti-phantom-default discipline

- **NO `Date.now()` / `new Date()` in engine/ kernels.** All time comes from injected
  `Clock` (`engine/clock.ts`).
- **NO silent zero defaults in money paths.** Missing bars → `Optional<Bar>` + explicit
  refusal, never `bar?.close ?? 0`.
- **Boundary sources are prime.** Bar data + arrival data come in as immutable fixture
  streams; engine derives everything else. No back-writes.
- **Deterministic across runs.** Same fixture in → same JSON out. Any variance is a bug.

## Downstream

Once the validation gate passes, the engine runs:

1. **ACT-515 (a)** first (per operator "partial measured results beat complete plans").
2. **ACT-515 (b)/(c)/(d)** as budget permits.
3. **ACT-516** H1-2022 window (bars already in corpus).
4. **ACT-514** re-derivation (INC-103 provenance heal).

**END README.**