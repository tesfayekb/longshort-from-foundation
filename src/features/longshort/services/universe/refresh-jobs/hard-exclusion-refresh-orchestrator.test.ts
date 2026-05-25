/**
 * Tests — per-rule continuous hard-exclusion refresh orchestrator
 * (FP-008 sub-step 8.5 / ACT-109).
 *
 * Owner: longshort (FP-008 sub-step 8.5)
 */
import { describe, it, expect } from 'vitest';
import {
  createHardExclusionRefreshOrchestrator,
  isHardExclusionRuleKey,
} from './hard-exclusion-refresh-orchestrator.ts';
import { HARD_EXCLUSION_RULE_KEYS } from './types.ts';

// A guaranteed §3.3e trigger day per the FINRA T+1-after-15th anchor:
// 2026-02-17 is a Tuesday (US trading day), settlement of Sun 2026-02-15
// rolls forward to Mon 2026-02-16, T+1 = Tue 2026-02-17. Verified against
// `isShortInterestTriggerDay` algorithm.
const SHORT_INTEREST_TRIGGER_DAY = new Date('2026-02-17T09:00:00.000Z');
// A trading day that is NOT a §3.3e trigger: Wed 2026-02-18.
const NON_TRIGGER_TRADING_DAY = new Date('2026-02-18T09:00:00.000Z');

describe('hard-exclusion refresh orchestrator', () => {
  it('skips all four rules with awaiting_per_rule_fetcher_wiring on a §3.3e trigger day', async () => {
    const orch = createHardExclusionRefreshOrchestrator({ as_of: SHORT_INTEREST_TRIGGER_DAY });
    for (const rule of HARD_EXCLUSION_RULE_KEYS) {
      const result = await orch.run({ rule, tickers: ['AAPL', 'MSFT'] });
      expect(result.rule).toBe(rule);
      expect(result.outcome).toBe('skipped');
      expect(result.skipped_reason).toBe('awaiting_per_rule_fetcher_wiring');
      expect(result.tickers_considered).toBe(2);
      expect(result.firings).toEqual([]);
      expect(result.as_of).toBe(SHORT_INTEREST_TRIGGER_DAY.toISOString());
    }
  });

  it('skips §3.3e with not_short_interest_trigger_day off-cadence', async () => {
    const orch = createHardExclusionRefreshOrchestrator({ as_of: NON_TRIGGER_TRADING_DAY });
    const result = await orch.run({ rule: '3.3e', tickers: ['AAPL'] });
    expect(result.outcome).toBe('skipped');
    expect(result.skipped_reason).toBe('not_short_interest_trigger_day');
    expect(result.tickers_considered).toBe(1);
    expect(result.firings).toEqual([]);
  });

  it('still skips 3.3a/3.3b/3.3c on a non-§3.3e trigger day (cadence gate is §3.3e-only)', async () => {
    const orch = createHardExclusionRefreshOrchestrator({ as_of: NON_TRIGGER_TRADING_DAY });
    for (const rule of ['3.3a', '3.3b', '3.3c'] as const) {
      const result = await orch.run({ rule, tickers: [] });
      expect(result.outcome).toBe('skipped');
      expect(result.skipped_reason).toBe('awaiting_per_rule_fetcher_wiring');
    }
  });

  it('accepts an empty tickers array and reports zero tickers_considered', async () => {
    const orch = createHardExclusionRefreshOrchestrator({ as_of: SHORT_INTEREST_TRIGGER_DAY });
    const result = await orch.run({ rule: '3.3a', tickers: [] });
    expect(result.tickers_considered).toBe(0);
    expect(result.outcome).toBe('skipped');
  });
});

describe('isHardExclusionRuleKey', () => {
  it('accepts the four MIG-049 rule keys', () => {
    expect(isHardExclusionRuleKey('3.3a')).toBe(true);
    expect(isHardExclusionRuleKey('3.3b')).toBe(true);
    expect(isHardExclusionRuleKey('3.3c')).toBe(true);
    expect(isHardExclusionRuleKey('3.3e')).toBe(true);
  });

  it('rejects non-refresh §3.3 rules and arbitrary strings', () => {
    expect(isHardExclusionRuleKey('3.3d')).toBe(false); // pre-trade check; not refresh
    expect(isHardExclusionRuleKey('3.3f')).toBe(false); // N/A v1
    expect(isHardExclusionRuleKey('3.3g')).toBe(false);
    expect(isHardExclusionRuleKey('3.3h')).toBe(false);
    expect(isHardExclusionRuleKey('')).toBe(false);
    expect(isHardExclusionRuleKey('3.3A')).toBe(false);
  });
});