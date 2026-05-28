/**
 * longshort-universe-hard-exclusion-refresh — one-dispatcher continuous
 * §3.3 hard-exclusion refresh edge function per CROSSWIND §3.4 +
 * DEC-038.1 clause (4) + AC-09. FP-008 sub-step 8.5 / ACT-109.
 *
 * Surface 1 Option (a) at ACT-109: ONE function, rule routed by `rule`
 * query/body param. Single chokepoint for §11.3 health monitoring
 * (sub-step 8.9); MIG-049 seeds four `job_registry` rows each invoking
 * this dispatcher with a different rule.
 *
 * Surface 0 Option α at ACT-109 (universe source at 8.5):
 *   POST body: { tickers?: string[] }
 *     - absent / empty → emit
 *       `longshort.universe.hard_exclusion_refresh.<rule>.skipped`
 *       with `skip_reason='awaiting_universe_membership_8_6'` and return 200.
 *     - present → orchestrator runs against provided list (per-rule
 *       fetchers wire in at later sub-steps; rule logic returns 0 firings
 *       until then).
 *
 * Permission: longshort.view (system-level cron path; matches the
 * sub-step 8.4 quarterly-refresh handler precedent).
 *
 * Per DEC-033 v4.1: all audit emission goes through
 * `writeStrategyAuditEvent` against `longshort_audit_logs`.
 *
 * Per MIG-049: all four `job_registry` rows ship enabled=false; no
 * production cron will fire this handler until sub-step 8.13 enables them.
 * Manual invocations (operator test, sub-step verification) are safe.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import {
  createHardExclusionRefreshOrchestrator,
  isHardExclusionRuleKey,
} from '../_shared/longshort-universe/refresh-jobs/hard-exclusion-refresh-orchestrator.ts';
import type { HardExclusionRuleKey } from '../_shared/longshort-universe/refresh-jobs/types.ts';

interface RequestBody {
  rule?: unknown;
  tickers?: unknown;
}

/** Parse rule from query string first, body second. Keeps cron-style
 *  invocations simple (`?rule=3.3a`) while allowing operator/test paths
 *  to use the body. */
function parseRule(req: Request, body: RequestBody): HardExclusionRuleKey | null {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get('rule');
  const candidate = fromQuery ?? (typeof body.rule === 'string' ? body.rule : null);
  if (candidate === null) return null;
  return isHardExclusionRuleKey(candidate) ? candidate : null;
}

function parseTickers(body: RequestBody): ReadonlyArray<string> | null {
  if (!Array.isArray(body.tickers)) return null;
  const out: string[] = [];
  for (const t of body.tickers) {
    if (typeof t !== 'string' || t.length === 0 || t.length > 16) return null;
    out.push(t);
  }
  return out;
}

function actionFor(rule: HardExclusionRuleKey, suffix: string): string {
  // 3.3a → hard_exclusion_refresh_3_3a per MIG-049 job_registry ids.
  const ruleSlug = rule.replace('.', '_');
  return `longshort.universe.hard_exclusion_refresh_${ruleSlug}.${suffix}`;
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  // ── Body parse (bounded by 64KB handler-level cap) ──
  let body: RequestBody = {};
  try {
    const text = await req.text();
    if (text.length > 0) body = JSON.parse(text) as RequestBody;
  } catch {
    return apiError(400, 'invalid_json_body', { correlationId });
  }

  const rule = parseRule(req, body);
  if (rule === null) {
    return apiError(400, 'rule_param_required_or_invalid', { correlationId });
  }

  // ── Cron-only system path: cron-secret header auth ──
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  // ── Surface 0 Option α: stub-input fallback when tickers absent/empty ──
  const tickers = parseTickers(body);
  if (tickers === null || tickers.length === 0) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: actionFor(rule, 'skipped'),
      correlationId,
      metadata: {
        rule,
        as_of: as_of.toISOString(),
        skip_reason: 'awaiting_universe_membership_8_6',
      },
    });
    return apiSuccess({
      rule,
      outcome: 'skipped',
      skip_reason: 'awaiting_universe_membership_8_6',
    });
  }

  // ── Orchestrator path ──
  try {
    const orch = createHardExclusionRefreshOrchestrator({ as_of });
    const result = await orch.run({ rule, tickers });

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: actionFor(rule, result.outcome),
      correlationId,
      metadata: {
        rule,
        as_of: result.as_of,
        outcome: result.outcome,
        tickers_considered: result.tickers_considered,
        firings_count: result.firings.length,
        skipped_reason: result.skipped_reason,
      },
    });

    return apiSuccess({
      rule: result.rule,
      outcome: result.outcome,
      tickers_considered: result.tickers_considered,
      firings_count: result.firings.length,
      skipped_reason: result.skipped_reason,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: actionFor(rule, 'failed'),
      correlationId,
      metadata: {
        rule,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
      },
    });
    return apiError(500, 'hard_exclusion_refresh_failed', { correlationId });
  }
}));
