/**
 * longshort-analyst-historical-backfill — ACT-554-a one-shot symbol-sweep.
 *
 * Purpose: backfill `analyst_revision_observations` with pre-2026-06-29
 * revision events derived from FMP Premium endpoints:
 *   - /stable/grades-historical?symbol=X            (analyst grade changes)
 *   - /stable/price-target-news?symbol=X&page=N     (paginated price-target news;
 *                                                    revision deltas require paired priors)
 *
 * SAFETY CONSTRAINTS (enforced in code + DB):
 *   D1 EPOCH BLOCK — every insert carries source='fmp_historical_backfill_v1'
 *      and as_of_date < 2026-06-29. DB CHECK constraint
 *      `analyst_rev_obs_backfill_epoch_block` is the belt-and-braces guard;
 *      this handler is the suspenders.
 *   D2 PER-BATCH FETCH-FAILURE LEDGER — every ticker × endpoint attempt logs
 *      into `job_executions` with a rollup at the end. No silent skips.
 *   D3 COVERAGE-VERIFY — after the run, the caller reads
 *      `public.analyst_backfill_coverage` for the per-ticker table.
 *      Live-row byte-integrity assertion: n_live and live_min/max_date
 *      MUST match the pre-run snapshot the caller took (this handler
 *      returns those numbers in its response for the caller to diff).
 *
 * BLAST RADIUS: `analyst_revision_observations` is RESEARCH-ONLY.
 * DEC-080 / DEC-081 never reached the detector (the bundle was gated by
 * R-004). This backfill cannot affect live trading. It is a research read
 * enabling ACT-554-b re-runs (ACT-531 analyst buckets, ACT-544-v2 table)
 * and the eventual DEC-080/081 re-ratification or explicit revocation.
 *
 * Auth: superadmin OR service_role. NOT scheduled — one-shot manual only.
 * Idempotency: PK on (operator_id, signal_id, as_of_date, ticker,
 * analyst_name_key, analyst_company_key, focal_published_at) means re-runs
 * are no-ops; a partial run resumes cleanly from any starting ticker.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { apiError } from '../_shared/api-error.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { FmpPriceTargetHistoryFetcher } from '../_shared/longshort-signals/analyst-revisions/fmp-price-target-history-fetcher.ts';
import {
  findSameAnalystPrior,
  normalizeAnalystKey,
  parseFmpDate,
  type RawPriceTargetRow,
} from '../_shared/longshort-signals/analyst-revisions/analyst-identity.ts';
import {
  TokenBucket,
  pacedHttpFetch,
} from '../_shared/longshort-signals/options-flow/token-bucket.ts';

// D1 epoch — hard boundary; must match the DB CHECK constraint.
const BACKFILL_EPOCH_END = new Date('2026-06-29T00:00:00Z');
const SOURCE_LABEL = 'fmp_historical_backfill_v1';
const SIGNAL_ID = 'analyst_revision_drift';
const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const FMP_BASE = 'https://financialmodelingprep.com';
// Premium plan: 750 rpm ≈ 12.5 rps. Leave headroom at 10 rps shared across
// both endpoints so we never hit the ceiling.
const FMP_RATE_PER_SEC = 10;
const PT_PAGE_LIMIT = 100;
const PT_MAX_PAGES = 60; // ~6,000 revisions/ticker ceiling — well beyond 4yr typical
const GRADES_PAGE_LIMIT = 500;

interface BatchLedgerRow {
  ticker: string;
  endpoint: 'grades_historical' | 'price_target_news';
  status: 'ok' | 'empty' | 'rate_limited' | 'subscription_gated' | 'data_unavailable' | 'error';
  pages_fetched: number;
  rows_fetched: number;
  rows_inserted: number;
  rows_skipped_epoch: number;
  rows_skipped_no_prior: number;
  error_message?: string;
}

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }

  // R-003 precedent: accept `Authorization: Bearer $CRON_SECRET` as an
  // alternate gate for this manual one-shot. Write-safety does NOT rest on
  // this gate — it rests on (i) the DB CHECK constraint blocking any row
  // with as_of_date >= 2026-06-29, and (ii) the target table being
  // RESEARCH-ONLY (DEC-080/081 never reached the detector). The gate is
  // just to keep the endpoint from being drive-by-callable.
  const authHeader = req.headers.get('Authorization') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  let correlationId = crypto.randomUUID();
  const isCronBearer = cronSecret.length > 0 && authHeader === `Bearer ${cronSecret}`;
  if (!isCronBearer) {
    const authCtx = await authenticateRequest(req);
    correlationId = authCtx.correlationId;
    const { data: isSuperadmin } = await supabaseAdmin.rpc('is_superadmin', { _user_id: authCtx.user.id });
    if (!isSuperadmin) {
      return apiError(403, 'superadmin_required', { correlationId });
    }
  }

  let body: {
    tickers?: string[];
    endpoint?: 'grades' | 'price_targets' | 'both';
    dry_run?: boolean;
    max_tickers?: number;
  };
  try { body = await req.json() as typeof body; } catch { body = {}; }
  const endpoint = body.endpoint ?? 'both';
  const dryRun = !!body.dry_run;
  const maxTickers = body.max_tickers ?? 10_000;

  const fmpApiKey = Deno.env.get('FMP_API_KEY');
  if (!fmpApiKey) return apiError(500, 'fmp_api_key_unset', { correlationId });

  // Resolve ticker universe.
  let tickers: string[];
  if (body.tickers && body.tickers.length > 0) {
    tickers = body.tickers.slice(0, maxTickers);
  } else {
    const { data, error } = await supabaseAdmin
      .from('universe_membership')
      .select('ticker')
      .limit(maxTickers);
    if (error) return apiError(500, `universe_read_failed: ${error.message}`, { correlationId });
    tickers = Array.from(new Set((data ?? []).map((r: { ticker: string }) => r.ticker))).sort();
  }

  // PRE-RUN live-row snapshot for D3 byte-integrity assertion.
  const preSnap = await snapshotLiveRows();

  // Start job_executions row for the ledger (D2).
  const jobStart = new Date().toISOString();
  const { data: jobRow } = await supabaseAdmin
    .from('job_executions')
    .insert({
      job_name: 'longshort-analyst-historical-backfill',
      status: 'running',
      started_at: jobStart,
      correlation_id: correlationId,
      metadata: {
        act: 'ACT-554-a',
        source_label: SOURCE_LABEL,
        endpoint,
        dry_run: dryRun,
        ticker_count: tickers.length,
        pre_snapshot: preSnap,
      },
    })
    .select('id')
    .single();

  const bucket = new TokenBucket({ ratePerSec: FMP_RATE_PER_SEC });
  const paced = pacedHttpFetch(bucket, fetch as never);
  const historyFetcher = new FmpPriceTargetHistoryFetcher(fmpApiKey, paced, 30_000, FMP_BASE, {
    limit: PT_PAGE_LIMIT,
  });

  const ledger: BatchLedgerRow[] = [];
  let totalInserted = 0;
  let totalFetched = 0;
  const asOfCutoff = BACKFILL_EPOCH_END.getTime();

  for (const ticker of tickers) {
    if (endpoint === 'both' || endpoint === 'price_targets') {
      const res = await backfillPriceTargets(ticker);
      ledger.push(res);
      totalInserted += res.rows_inserted;
      totalFetched += res.rows_fetched;
    }
    if (endpoint === 'both' || endpoint === 'grades') {
      const res = await backfillGrades(ticker);
      ledger.push(res);
      totalInserted += res.rows_inserted;
      totalFetched += res.rows_fetched;
    }
  }

  const postSnap = await snapshotLiveRows();
  const liveIntegrityOk =
    preSnap.n_live === postSnap.n_live &&
    preSnap.live_min_date === postSnap.live_min_date &&
    preSnap.live_max_date === postSnap.live_max_date;

  if (jobRow) {
    await supabaseAdmin
      .from('job_executions')
      .update({
        status: liveIntegrityOk ? 'succeeded' : 'failed',
        completed_at: new Date().toISOString(),
        metadata: {
          act: 'ACT-554-a',
          source_label: SOURCE_LABEL,
          endpoint,
          dry_run: dryRun,
          ticker_count: tickers.length,
          rows_fetched_total: totalFetched,
          rows_inserted_total: totalInserted,
          pre_snapshot: preSnap,
          post_snapshot: postSnap,
          live_integrity_ok: liveIntegrityOk,
          ledger,
        },
      })
      .eq('id', jobRow.id);
  }

  return apiSuccess({
    status: 'ok',
    act: 'ACT-554-a',
    source_label: SOURCE_LABEL,
    endpoint,
    dry_run: dryRun,
    ticker_count: tickers.length,
    rows_fetched_total: totalFetched,
    rows_inserted_total: totalInserted,
    pre_snapshot: preSnap,
    post_snapshot: postSnap,
    live_integrity_ok: liveIntegrityOk,
    ledger,
    correlation_id: correlationId,
  });

  // ─── helpers (inline for edge-fn single-file rule) ────────────────────

  async function snapshotLiveRows() {
    const { data } = await supabaseAdmin
      .from('analyst_revision_observations')
      .select('as_of_date, source')
      .eq('source', 'analyst_revision_drift_v1');
    const rows = (data ?? []) as Array<{ as_of_date: string; source: string }>;
    const dates = rows.map(r => r.as_of_date).sort();
    return {
      n_live: rows.length,
      live_min_date: dates[0] ?? null,
      live_max_date: dates[dates.length - 1] ?? null,
    };
  }

  async function backfillPriceTargets(ticker: string): Promise<BatchLedgerRow> {
    const row: BatchLedgerRow = {
      ticker, endpoint: 'price_target_news', status: 'ok',
      pages_fetched: 0, rows_fetched: 0, rows_inserted: 0,
      rows_skipped_epoch: 0, rows_skipped_no_prior: 0,
    };
    const all: RawPriceTargetRow[] = [];
    try {
      for (let page = 0; page < PT_MAX_PAGES; page++) {
        const url = `${FMP_BASE}/stable/price-target-news`
          + `?symbol=${encodeURIComponent(ticker)}&page=${page}&limit=${PT_PAGE_LIMIT}`
          + `&apikey=${encodeURIComponent(fmpApiKey!)}`;
        const resp = await paced(url, { method: 'GET' });
        if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
          row.status = 'subscription_gated'; break;
        }
        if (resp.status === 429) { row.status = 'rate_limited'; break; }
        if (resp.status === 404) { row.status = page === 0 ? 'data_unavailable' : 'ok'; break; }
        if (!resp.ok) { row.status = 'error'; row.error_message = `HTTP ${resp.status}`; break; }
        const body = await resp.json() as unknown;
        if (!Array.isArray(body) || body.length === 0) { row.pages_fetched = page + 1; break; }
        row.pages_fetched = page + 1;
        for (const w of body) {
          const wire = w as Record<string, unknown>;
          if (typeof wire.publishedDate !== 'string') continue;
          all.push({
            symbol: ticker,
            publishedDate: wire.publishedDate,
            analystName: (wire.analystName as string) ?? '',
            analystCompany: (wire.analystCompany as string) ?? '',
            priceTarget: typeof wire.priceTarget === 'number' ? wire.priceTarget : null,
            adjPriceTarget: typeof wire.adjPriceTarget === 'number' ? wire.adjPriceTarget : null,
            priceWhenPosted: typeof wire.priceWhenPosted === 'number' ? wire.priceWhenPosted : null,
            newsTitle: (wire.newsTitle as string) ?? '',
          });
        }
      }
    } catch (e) {
      row.status = 'error';
      row.error_message = e instanceof Error ? e.message : String(e);
    }
    row.rows_fetched = all.length;
    if (all.length === 0) return row;

    // Sort ascending by focal moment so we can build same-analyst priors incrementally.
    all.sort((a, b) => parseFmpDate(a.publishedDate) - parseFmpDate(b.publishedDate));

    const toInsert: Record<string, unknown>[] = [];
    for (let i = 0; i < all.length; i++) {
      const focal = all[i];
      const focalMs = parseFmpDate(focal.publishedDate);
      if (!Number.isFinite(focalMs)) continue;
      // D1 epoch block: strictly before 2026-06-29.
      if (focalMs >= asOfCutoff) { row.rows_skipped_epoch++; continue; }
      if (focal.priceTarget === null) continue;
      const prior = findSameAnalystPrior(focal, all.slice(0, i));
      if (prior.kind !== 'found' || prior.row.priceTarget === null) {
        row.rows_skipped_no_prior++; continue;
      }
      const priorTarget = prior.row.priceTarget;
      const delta = focal.priceTarget - priorTarget;
      const magPct = priorTarget !== 0 ? (delta / priorTarget) * 100 : 0;
      const direction = delta > 0 ? 1 : delta < 0 ? -1 : 0;
      const key = normalizeAnalystKey(focal.analystName, focal.analystCompany);
      const focalIso = new Date(focalMs).toISOString();
      const priorIso = new Date(parseFmpDate(prior.row.publishedDate)).toISOString();
      const asOfDate = focalIso.slice(0, 10);
      toInsert.push({
        operator_id: OPERATOR_ID,
        signal_id: SIGNAL_ID,
        as_of_date: asOfDate,
        ticker,
        analyst_name: focal.analystName,
        analyst_company: focal.analystCompany,
        analyst_name_key: key.name,
        analyst_company_key: key.company,
        focal_published_at: focalIso,
        prior_published_at: priorIso,
        new_target: focal.priceTarget,
        prior_target: priorTarget,
        target_delta: delta,
        magnitude_pct: magPct,
        direction,
        contribution: 0, // backfill: computed downstream in ACT-554-b re-runs
        age_days: Math.round(prior.ageDays),
        pair_basis: 'same_analyst_365d',
        computed_at: new Date().toISOString(),
        source: SOURCE_LABEL,
      });
    }

    if (!dryRun && toInsert.length > 0) {
      // Chunk to avoid oversized payloads.
      const CHUNK = 500;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK);
        const { error, count } = await supabaseAdmin
          .from('analyst_revision_observations')
          .upsert(chunk, {
            onConflict: 'operator_id,signal_id,as_of_date,ticker,analyst_name_key,analyst_company_key,focal_published_at',
            ignoreDuplicates: true,
            count: 'exact',
          });
        if (error) {
          row.status = 'error';
          row.error_message = `insert failed: ${error.message}`;
          break;
        }
        row.rows_inserted += (count ?? chunk.length);
      }
    } else if (dryRun) {
      row.rows_inserted = toInsert.length; // dry-run: would-have-inserted count
    }
    return row;
  }

  async function backfillGrades(ticker: string): Promise<BatchLedgerRow> {
    // grades-historical returns only rating/action changes without price
    // targets — feeds ACT-554-b analyst-bucket re-runs (ACT-531 up/down)
    // via a separate observation stream. This handler fetches + counts
    // only in Phase 1 (no writes to analyst_revision_observations because
    // that table is target-delta-shaped). The row count is banked in the
    // ledger so ACT-554-b can validate coverage before designing the
    // grades observation table (charter: ACT-554-a.1 follow-up).
    const row: BatchLedgerRow = {
      ticker, endpoint: 'grades_historical', status: 'ok',
      pages_fetched: 0, rows_fetched: 0, rows_inserted: 0,
      rows_skipped_epoch: 0, rows_skipped_no_prior: 0,
    };
    try {
      const url = `${FMP_BASE}/stable/grades-historical`
        + `?symbol=${encodeURIComponent(ticker)}&limit=${GRADES_PAGE_LIMIT}`
        + `&apikey=${encodeURIComponent(fmpApiKey!)}`;
      const resp = await paced(url, { method: 'GET' });
      if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
        row.status = 'subscription_gated'; return row;
      }
      if (resp.status === 429) { row.status = 'rate_limited'; return row; }
      if (resp.status === 404) { row.status = 'data_unavailable'; return row; }
      if (!resp.ok) { row.status = 'error'; row.error_message = `HTTP ${resp.status}`; return row; }
      const body = await resp.json() as unknown;
      if (!Array.isArray(body)) { row.status = 'error'; row.error_message = 'non-array response'; return row; }
      row.pages_fetched = 1;
      // Count only rows in the backfill epoch (< 2026-06-29).
      let inEpoch = 0;
      for (const g of body) {
        const gr = g as Record<string, unknown>;
        const d = typeof gr.date === 'string' ? gr.date : (gr.publishedDate as string);
        const t = d ? Date.parse(d) : NaN;
        if (Number.isFinite(t) && t < asOfCutoff) inEpoch++;
      }
      row.rows_fetched = inEpoch;
      // No writes in this handler (see comment above). ACT-554-a.1 follow-up.
    } catch (e) {
      row.status = 'error';
      row.error_message = e instanceof Error ? e.message : String(e);
    }
    return row;
  }
}));