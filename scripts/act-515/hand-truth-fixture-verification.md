# ACT-515 Hand-Truth Fixture Verification — B1 evidence

**Filed:** 2026-07-25T05:34:12Z. Executes operator ruling B1: recover
from git, verify sha byte-exact, file INC-144.

## 1. Verification chain (four commands, verbatim outputs)

### (a) Locate any delete of `fixtures/**` across all refs

```
$ git log --all --diff-filter=D --oneline -- 'fixtures/*'
(no output — zero delete commits)
```

### (b) Add-history for `*hand-truth*` across all refs

```
$ git log --all --oneline --diff-filter=A -- '*hand-truth*'
ff4b4aac2 Changes

$ git log -1 --format='%h %s (%an, %ad)' --date=iso ff4b4aac2
ff4b4aac2 Changes (gpt-engineer-app[bot], 2026-07-23 18:07:05 +0000)

$ git show --name-status ff4b4aac2 -- 'fixtures/*'
A       fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl
```

Single add commit; still reachable from HEAD.

### (c) Presence at HEAD

```
$ git ls-tree -r HEAD -- 'fixtures/overshoot-backtest/'
100644 blob c98d3d311074ee498592839eef1ab31022154ae3    fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl
```

### (d) sha256 byte-exact match against operator citation

```
$ sha256sum fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl
d06bd24cadcb608c2525b042ec40a1db112fa6f363ac3ae288d3f4ac7ecff1a2  fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl

expected                                                            d06bd24cadcb608c2525b042ec40a1db112fa6f363ac3ae288d3f4ac7ecff1a2
```

**Match: EXACT.** No restore needed — file was never deleted. No
recommit needed — the correct blob is at HEAD.

## 2. Fixture content shape (line 1 + first row)

Header (line 1) declares epoch `ACT-515-hand-truth-v1`,
`as_of_event_date=2024-05-02`, `entry_convention=T+1 open (session-ordinal 1)`,
`exit_convention=ordinal-10 close (LONG T2, holdingDayOrdinal>=10)`,
`sizing_usd=2500.0`, `shares_rule=floor(SIZE/entry_open) no fractional`,
`pnl_rule=shares*(exit_close-entry_open)`,
`selection_source=fixtures/overshoot-detector-selection/2024-05-02.jsonl (N=20)`,
`sides_note=all LONG T2`.

First row: `ticker=ANF side=LONG tier=T2 entry_date=2024-05-03
entry_open=126.62 exit_date=2024-05-16 exit_close=135.69 shares=19
notional_usd=2405.78 pnl_usd=172.33 pnl_bps=716.32`.

22 lines total: 1 header + 1 separator + 20 hand-computed rows.

## 3. Prior-turn false claim — root cause

Prior turn asserted "`d06bd24c` does not appear anywhere in the repo →
fixture absent." The grep target was the literal *string* `d06bd24c`;
that string is only present in my own scratch docs. sha256 is a
**content hash of the fixture** — it is not written into the fixture.
String-grep for a sha256 hex is evidence of nothing.

Correct verification protocol (now codified in INC-144):

1. `git ls-tree -r HEAD -- <dir>/` — present at HEAD?
2. `git log --all --diff-filter=AD -- <path>` — add/delete history?
3. `sha256sum <path>` — content match?

## 4. INC-144 filing

See `docs/06-tracking/incidental-findings.md` INC-144. `fixtures/**`
joins the never-delete class (Rule-8 extension); amendment PR to
Constitution Rule 8 queued as a governance follow-up.

## 5. Layer-1 gate — RE-COMMITTED

ACT-515 kernel's Layer-1 validity gate is:

1. Selection-parity replay for 2024-05-02 GREEN.
2. Hand-truth replay against
   `fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl` — per-row
   byte-exact reproduction of `entry_open / exit_close / shares /
   pnl_usd`. Sha of fixture at test time = `d06bd24c...`; mismatch =
   TEST FAIL.
3. Fixture #2 (2023-Q2) built during kernel `mark`/`equity` bring-up.
   Two eras beats one — 2024-05-02 exercises entry+exit pricing only;
   2023-Q2 exercises the equity path and DD arithmetic.

**No matrix cell computes until (1) AND (2) are green.**