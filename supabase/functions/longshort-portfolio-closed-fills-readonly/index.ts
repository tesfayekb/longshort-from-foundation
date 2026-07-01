/**
 * longshort-portfolio-closed-fills-readonly — FP-068 W5 (ACT-444).
 *
 * READ-ONLY operator "Closed today" view surface. Returns:
 *   - broker_exit_fills: today's Alpaca-executed exit fills (intent IN
 *     ('close','decrease') matched via the `lse-` CID). Thin projection
 *     over /v2/orders?status=closed&after=<todayEt00:00> — NO
 *     InFlightOrder / state-machine reconstruction (the existing
 *     AlpacaRecentlyFilledOrdersFetcher does that for the tick path;
 *     W5 needs a leaner shape).
 *   - internal_closed_lots: longshort_lots WHERE status='closed' with
 *     realized_pnl / exit_price / exit_ts / cost_basis. EMPTY today
 *     (zero closed lots ever per the diagnosis) — expected pending
 *     state, not an error. Lights up once real closes populate the
 *     ledger (see DW-207).
 *   - open_lots_for_match: currently-open longshort_lots (symbol, side,
 *     qty, cost_basis) so the UI can compute entry_avg for each broker
 *     exit fill without a second round-trip. Matched on (symbol, side).
 *     Unmatched fills are flagged BROKER-ONLY / DW-207-evidence in the UI.
 *
 * MONEY-PATH INVARIANT (LOAD-BEARING): ZERO writes, ZERO money-path calls
 *   (no submit-rebalance, no order-submitter, no lot-writer, no cron
 *   mutation). GET-only Alpaca closed-orders + two SELECTs on
 *   longshort_lots. Adding any write here violates the FP-068 W5 charter.
 *
 * Injected-clock discipline (DEC-034 (4)): time is sourced from
 *   productionClock.getWallClockTs(), never raw `new Date()`. The
 *   "today ET" window boundary is computed deterministically from that
 *   injected `ts` via the ET-midnight helper below — DST-safe.
 *
 * Least-privilege gate: `longshort.view` (same scope as W1's positions
 *   readonly and the Portfolio route itself).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { apiError } from '../_shared/api-error.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { AlpacaPaperClient } from '../_shared/longshort-broker/alpaca-paper-client.ts';
import { productionClock } from '../_shared/longshort-clock.ts';

// MUST match `buildClientOrderId` (order-submitter.ts):
//   `lse-${symbol}-${intent}-${ts.getTime()}[-step<N>]`
// Byte-identical to CID_RE in AlpacaRecentlyFilledOrdersFetcher.
const CID_RE = /^lse-([A-Z0-9.-]+)-(open|increase|decrease|close|noop)-(\d+)(?:-step(\d+))?$/;

// Exit intents — "what left the portfolio today".
const EXIT_INTENTS = new Set(['close', 'decrease']);

interface AlpacaClosedOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
  status: string;
  submitted_at: string | null;
  filled_at?: string | null;
  filled_qty?: string | null;
  filled_avg_price?: string | null;
}

interface BrokerExitFillRow {
  order_id: string;
  client_order_id: string;
  symbol: string;
  intent: 'close' | 'decrease';
  side: 'long' | 'short';        // position side that was exited
  broker_side: 'buy' | 'sell';   // Alpaca leg side
  filled_qty: number;
  filled_avg_price: number | null;
  filled_at: string | null;
}

/**
 * Compute the UTC instant of the most recent 00:00 in America/New_York
 * relative to `now`. DST-safe: tries EST (-05:00) then EDT (-04:00) and
 * picks the candidate whose ET-rendered hour is 00. Isolated helper —
 * no external deps, deterministic given `now`.
 */
function todayEtMidnightUtc(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  for (const off of ['-05:00', '-04:00'] as const) {
    const cand = new Date(`${y}-${m}-${d}T00:00:00${off}`);
    const hourEt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: '2-digit', hour12: false,
    }).format(cand);
    if (hourEt === '00') return cand;
  }
  // Fallback: subtract 24h from `now` (documented degraded window;
  // Intl above is available in Deno, so this branch is defensive-only).
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

function deriveExitedSide(intent: 'close' | 'decrease', broker_side: 'buy' | 'sell'): 'long' | 'short' | null {
  // Exits: closing a LONG => sell; closing a SHORT (buy-to-cover) => buy.
  if (broker_side === 'sell') return 'long';
  if (broker_side === 'buy') return 'short';
  return null;
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'GET') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  const auth = await authenticateRequest(req);
  await checkPermissionOrThrow(auth.user.id, 'longshort.view');

  const ts = productionClock.getWallClockTs();
  const windowStart = todayEtMidnightUtc(ts);

  // ── Broker side: closed orders since today's ET midnight.
  const client = new AlpacaPaperClient();
  const url = `/v2/orders?status=closed&after=${encodeURIComponent(windowStart.toISOString())}&limit=500&direction=asc`;
  const closed = await client.getJson<AlpacaClosedOrder[]>(url);

  const exitFills: BrokerExitFillRow[] = [];
  for (const o of closed) {
    if (o.status !== 'filled') continue;
    const filled_qty_raw = o.filled_qty != null && o.filled_qty !== ''
      ? parseFloat(o.filled_qty) // allow-bare-parsefloat: DW-058-B1 (broker-typed string)
      : 0;
    if (!Number.isFinite(filled_qty_raw) || filled_qty_raw <= 0) continue;
    const m = CID_RE.exec(o.client_order_id);
    if (!m) continue; // not our CID — skip (different strategy / manual)
    const intentRaw = m[2];
    if (!EXIT_INTENTS.has(intentRaw)) continue;
    const intent = intentRaw as 'close' | 'decrease';
    const side = deriveExitedSide(intent, o.side);
    if (!side) continue;
    const avg = o.filled_avg_price != null && o.filled_avg_price !== ''
      ? parseFloat(o.filled_avg_price) // allow-bare-parsefloat: DW-058-B1
      : null;
    exitFills.push({
      order_id: o.id,
      client_order_id: o.client_order_id,
      symbol: o.symbol,
      intent,
      side,
      broker_side: o.side,
      filled_qty: filled_qty_raw,
      filled_avg_price: Number.isFinite(avg as number) ? (avg as number) : null,
      filled_at: o.filled_at ?? null,
    });
  }

  // ── Internal side (empty today, expected pending state per DW-207).
  const { data: closedLots, error: closedErr } = await supabaseAdmin
    .from('longshort_lots')
    .select('lot_id,symbol,side,qty,cost_basis,entry_ts,exit_ts,exit_price,realized_pnl,source_order_id')
    .eq('status', 'closed')
    .gte('exit_ts', windowStart.toISOString())
    .order('exit_ts', { ascending: false });
  if (closedErr) throw closedErr;

  // ── Open lots (for entry_avg matching on broker exit fills — partials).
  const { data: openLots, error: openErr } = await supabaseAdmin
    .from('longshort_lots')
    .select('lot_id,symbol,side,qty,cost_basis,entry_ts')
    .eq('status', 'open');
  if (openErr) throw openErr;

  return apiSuccess({
    correlation_id: correlationId,
    fetched_at: ts.toISOString(),
    window_start: windowStart.toISOString(),
    broker_exit_fills: exitFills,
    internal_closed_lots: (closedLots ?? []).map((l) => ({
      lot_id: l.lot_id,
      symbol: l.symbol,
      side: l.side,
      qty: l.qty,
      cost_basis: l.cost_basis,
      entry_ts: l.entry_ts,
      exit_ts: l.exit_ts,
      exit_price: l.exit_price,
      realized_pnl: l.realized_pnl,
      source_order_id: l.source_order_id,
    })),
    open_lots_for_match: (openLots ?? []).map((l) => ({
      lot_id: l.lot_id,
      symbol: l.symbol,
      side: l.side,
      qty: l.qty,
      cost_basis: l.cost_basis,
      entry_ts: l.entry_ts,
    })),
  });
}));