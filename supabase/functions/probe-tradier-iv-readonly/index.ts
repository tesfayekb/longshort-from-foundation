// DW-192 STEP-A (b)+(c)+(d) — READ-ONLY temp probe (ACT-157/ACT-158 pattern).
// Measures live mid_iv / bid_iv / ask_iv population AND matched call/put
// strike-pair IV coverage on OUR Tradier entitlement, on a mega-cap +
// mid-cap probe set (the coverage canary). Reuses the production
// TradierOptionsChainFetcher so the measurement reflects OUR consumer
// path. ALSO inspects the raw Tradier payload directly so:
//   (1) the fetcher's `normalizeGreeks()` null-when-delta-absent collapse
//       does not undercount mid_iv (the fetcher drops the whole greeks
//       object when delta is null — that hides mid_iv coverage from the
//       fetcher-normalized view), and
//   (2) we can record (d) — the raw NULL/ZERO/omitted shape for absent IV.
// Superadmin-gated; GET only; NO signal compute; NO persistence; NO
// signal-catalog touch. To be deleted after the result lands.
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { apiError } from '../_shared/api-error.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import {
  TradierOptionsChainFetcher,
  TRADIER_PRODUCTION_BASE_URL,
} from '../_shared/longshort-signals/shared/tradier-options-chain-fetcher.ts';

// Probe set: 2 mega-caps (SPY, AAPL) + 2 mid/smaller-caps (IWM as R2000
// proxy, and PLUG as a thinner-chain canary). The mid/smaller-caps are
// the coverage gradient — mega-caps will look good; the question is how
// fast IV coverage decays on thinner names.
const PROBE_TICKERS = ['SPY', 'AAPL', 'IWM', 'PLUG'];

// §9: count mid_iv > 0 as present; null/omitted/<=0 as absent (0% IV is
// not a valid market state, so a literal 0 is typed-absent).
function isPresentIv(x: unknown): boolean {
  return typeof x === 'number' && Number.isFinite(x) && x > 0;
}

type RawGreeksWire = Record<string, unknown> | null | undefined;
type RawOptionWire = {
  symbol?: unknown;
  strike?: unknown;
  expiration_date?: unknown;
  option_type?: unknown;
  greeks?: RawGreeksWire;
};

interface PerTickerResult {
  ticker: string;
  expiration_used: string | null;
  status: 'ok' | 'unavailable' | 'error';
  reason?: string;
  // (b) per-field populated counts on RAW payload (not normalized).
  raw_counts?: {
    total_contracts: number;
    mid_iv_present: number;
    bid_iv_present: number;
    ask_iv_present: number;
    delta_present: number;
  };
  // For reference: what the fetcher's normalizeGreeks path actually exposes.
  // greeks==null when delta is absent (current normalizer behavior), so this
  // will undercount mid_iv vs the raw view.
  fetcher_normalized_counts?: {
    total_contracts: number;
    greeks_object_present: number;
    mid_iv_present_via_fetcher: number;
  };
  // (c) THE LOAD-BEARING NUMBER — matched (strike,expiration) pairs with
  // BOTH a call and a put carrying a present mid_iv. Cremers-Weinbaum
  // IV-spread needs call_iv − put_iv at matched strike/expiry; a strike
  // with only one side's IV is uncomputable.
  matched_pair_coverage?: {
    total_strikes: number;
    strikes_with_both_sides_iv: number;
    fraction: number;
    // Near-the-money subset (heuristic: top 10 strikes by call+put volume,
    // i.e. the actively-traded core; if volume is mostly null we fall back
    // to the 10 strikes nearest the median strike).
    near_the_money: {
      strikes_considered: number;
      strikes_with_both_sides_iv: number;
      fraction: number;
    };
  };
  // (d) Raw NULL/ZERO/omitted shape for absent IV — 3-sample of raw greeks
  // objects from contracts where mid_iv is absent on the RAW payload.
  raw_absent_iv_samples?: Array<{
    symbol: string;
    raw_greeks: unknown;
  }>;
}

async function probeTicker(
  ticker: string,
  apiKey: string,
): Promise<PerTickerResult> {
  const fetcher = new TradierOptionsChainFetcher(apiKey);
  // Pick the nearest non-expired expiration (front-month / weekly).
  const exps = await fetcher.fetchExpirations(ticker);
  if (exps.kind === 'unavailable') {
    return { ticker, expiration_used: null, status: 'unavailable', reason: exps.reason };
  }
  const today = new Date().toISOString().slice(0, 10);
  const future = exps.expirations.filter((d) => d >= today);
  const expiration = future[0] ?? exps.expirations[exps.expirations.length - 1];
  if (!expiration) {
    return { ticker, expiration_used: null, status: 'unavailable', reason: 'no_expirations' };
  }

  // (1) Fetcher path — measure what OUR consumer sees.
  const chainViaFetcher = await fetcher.fetchChain(ticker, expiration);
  let fetcherCounts = { total_contracts: 0, greeks_object_present: 0, mid_iv_present_via_fetcher: 0 };
  if (chainViaFetcher.kind === 'chain') {
    for (const c of chainViaFetcher.contracts) {
      fetcherCounts.total_contracts += 1;
      if (c.greeks !== null) fetcherCounts.greeks_object_present += 1;
      if (c.greeks && isPresentIv(c.greeks.mid_iv)) fetcherCounts.mid_iv_present_via_fetcher += 1;
    }
  }

  // (2) Raw path — direct fetch so we can count mid_iv WITHOUT the
  // normalizer's delta-null collapse, AND record (d) raw absence shape.
  const url =
    `${TRADIER_PRODUCTION_BASE_URL}/markets/options/chains` +
    `?symbol=${encodeURIComponent(ticker)}&expiration=${expiration}&greeks=true`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!r.ok) {
    return { ticker, expiration_used: expiration, status: 'error', reason: `HTTP ${r.status}` };
  }
  const body = await r.json() as { options?: { option?: RawOptionWire | RawOptionWire[] | null } | null };
  const optList = body.options?.option;
  const raws: RawOptionWire[] = optList == null ? [] : Array.isArray(optList) ? optList : [optList];

  let midIvPresent = 0, bidIvPresent = 0, askIvPresent = 0, deltaPresent = 0;
  // Matched-pair index: (strike) -> { callMidIv: bool, putMidIv: bool, vol: number }
  const byStrike = new Map<number, { callIv: boolean; putIv: boolean; vol: number }>();
  const absentSamples: Array<{ symbol: string; raw_greeks: unknown }> = [];

  for (const o of raws) {
    const g = (o.greeks ?? null) as Record<string, unknown> | null;
    const midIv = g ? g['mid_iv'] : undefined;
    const bidIv = g ? g['bid_iv'] : undefined;
    const askIv = g ? g['ask_iv'] : undefined;
    const delta = g ? g['delta'] : undefined;
    const midPresent = isPresentIv(midIv);
    if (midPresent) midIvPresent += 1;
    if (isPresentIv(bidIv)) bidIvPresent += 1;
    if (isPresentIv(askIv)) askIvPresent += 1;
    if (typeof delta === 'number' && Number.isFinite(delta)) deltaPresent += 1;

    if (!midPresent && absentSamples.length < 3) {
      absentSamples.push({
        symbol: typeof o.symbol === 'string' ? o.symbol : '(no symbol)',
        raw_greeks: g === null ? null : g === undefined ? '(omitted)' : g,
      });
    }

    const strike = typeof o.strike === 'number' ? o.strike : null;
    const otype = o.option_type;
    if (strike !== null) {
      const entry = byStrike.get(strike) ?? { callIv: false, putIv: false, vol: 0 };
      if (otype === 'call' && midPresent) entry.callIv = true;
      if (otype === 'put' && midPresent) entry.putIv = true;
      // Volume proxy for NTM heuristic; use 0 if absent.
      // (Tradier returns 'volume' on the option wire; ignore non-numbers.)
      const v = (o as { volume?: unknown }).volume;
      if (typeof v === 'number' && Number.isFinite(v)) entry.vol += v;
      byStrike.set(strike, entry);
    }
  }

  const totalStrikes = byStrike.size;
  let bothSides = 0;
  for (const e of byStrike.values()) if (e.callIv && e.putIv) bothSides += 1;

  // NTM heuristic: top 10 strikes by combined volume; fallback to 10
  // strikes nearest the median strike when volume is uniformly zero.
  const strikeEntries = [...byStrike.entries()];
  const totalVol = strikeEntries.reduce((s, [, e]) => s + e.vol, 0);
  let ntmEntries: Array<[number, { callIv: boolean; putIv: boolean; vol: number }]>;
  if (totalVol > 0) {
    ntmEntries = [...strikeEntries].sort((a, b) => b[1].vol - a[1].vol).slice(0, 10);
  } else {
    const sorted = [...strikeEntries].sort((a, b) => a[0] - b[0]);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)][0] : 0;
    ntmEntries = [...strikeEntries]
      .sort((a, b) => Math.abs(a[0] - median) - Math.abs(b[0] - median))
      .slice(0, 10);
  }
  const ntmBoth = ntmEntries.filter(([, e]) => e.callIv && e.putIv).length;

  return {
    ticker,
    expiration_used: expiration,
    status: 'ok',
    raw_counts: {
      total_contracts: raws.length,
      mid_iv_present: midIvPresent,
      bid_iv_present: bidIvPresent,
      ask_iv_present: askIvPresent,
      delta_present: deltaPresent,
    },
    fetcher_normalized_counts: fetcherCounts,
    matched_pair_coverage: {
      total_strikes: totalStrikes,
      strikes_with_both_sides_iv: bothSides,
      fraction: totalStrikes === 0 ? 0 : bothSides / totalStrikes,
      near_the_money: {
        strikes_considered: ntmEntries.length,
        strikes_with_both_sides_iv: ntmBoth,
        fraction: ntmEntries.length === 0 ? 0 : ntmBoth / ntmEntries.length,
      },
    },
    raw_absent_iv_samples: absentSamples,
  };
}

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'GET') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }
  const auth = await authenticateRequest(req);
  // Superadmin-gated via the same permission used by the other read-only
  // probes (probe-alpaca-positions-readonly, probe-alpaca-orders-readonly).
  await checkPermissionOrThrow(auth.user.id, 'longshort.execute');

  const apiKey = Deno.env.get('TRADIER_API_KEY');
  if (!apiKey) {
    return apiError(500, 'TRADIER_API_KEY missing', { correlationId: crypto.randomUUID() });
  }

  const results: PerTickerResult[] = [];
  for (const t of PROBE_TICKERS) {
    try {
      results.push(await probeTicker(t, apiKey));
    } catch (e) {
      results.push({
        ticker: t,
        expiration_used: null,
        status: 'error',
        reason: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      });
    }
  }

  // Feasibility verdict: Cremers-Weinbaum IV-spread is computable on a
  // ticker when its matched-pair fraction (and especially the NTM fraction)
  // is high enough. Threshold is operator policy; we surface raw numbers +
  // a per-ticker flag at the conventional >=0.5 all-strikes / >=0.8 NTM
  // bar so the operator can re-thread the bar without redeploying.
  const verdict = results.map((r) => ({
    ticker: r.ticker,
    status: r.status,
    all_strike_fraction: r.matched_pair_coverage?.fraction ?? null,
    ntm_fraction: r.matched_pair_coverage?.near_the_money.fraction ?? null,
    computable_default_bar:
      r.status === 'ok' &&
      (r.matched_pair_coverage?.fraction ?? 0) >= 0.5 &&
      (r.matched_pair_coverage?.near_the_money.fraction ?? 0) >= 0.8,
  }));

  return apiSuccess({
    probe: 'dw-192-step-a-iv-substrate',
    note: 'READ-ONLY. No signal computed. No persistence. Delete after result.',
    probed_tickers: PROBE_TICKERS,
    results,
    feasibility_verdict_default_bar: verdict,
  });
}));