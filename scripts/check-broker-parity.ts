#!/usr/bin/env -S deno run --allow-read --allow-env --allow-net

/**
 * check-broker-parity — ACT-316 (E6-build-revision) TIGHTENING 2 (behavior
 * parity evidence, not just inspection).
 *
 * Drives the SAME fixture-set through BOTH the src/-resident Alpaca adapters
 * AND the edge-resident _shared/longshort-broker/ adapters and diffs the
 * results. Identical outputs = the transcription is logic-preserving by
 * EVIDENCE (the gate this script enforces). Any divergence = the
 * transcription has a defect; the script exits non-zero and CI fails.
 *
 * This script is the long-term insurance: any future edit to either tree
 * that drifts the behaviors will be caught here. The src/ adapters are
 * "untouched" today, but absent this script, a future src/ change could
 * silently diverge from the edge-resident copy. Parity-by-script is the
 * cheapest durable guarantee.
 *
 * Coverage (the 3 E_evidence_1 replay scenarios, fixture-equivalent):
 *   - reconstructInFlight: open-orders list → InFlightOrder[]
 *   - fetchOrderAcceptance: order status → BrokerOrderAcceptanceResult
 *   - fetchFill: order status → BrokerFillResult
 *
 * The script ONLY consumes adapter outputs (Promise resolutions); both trees
 * are import-allowed because this script lives under scripts/ (not src/ and
 * not supabase/functions/) and is excluded from both edge-imports and
 * src-imports guards by their respective SCAN_ROOTs.
 */

// Edge-resident tree.
import { AlpacaPaperClient as EdgeClient } from '../supabase/functions/_shared/longshort-broker/alpaca-paper-client.ts';
import { AlpacaOpenOrdersFetcher as EdgeOpenOrders } from '../supabase/functions/_shared/longshort-broker/alpaca-open-orders-fetcher.ts';
import { AlpacaOrderAcceptanceFetcher as EdgeAcceptance } from '../supabase/functions/_shared/longshort-broker/alpaca-order-acceptance-fetcher.ts';
import { AlpacaFillFetcher as EdgeFill } from '../supabase/functions/_shared/longshort-broker/alpaca-fill-fetcher.ts';

// src/-resident tree.
import { AlpacaPaperClient as SrcClient } from '../src/features/longshort/services/broker/alpaca/alpaca-paper-client.ts';
import { AlpacaOpenOrdersFetcher as SrcOpenOrders } from '../src/features/longshort/services/broker/alpaca/alpaca-open-orders-fetcher.ts';
import { AlpacaOrderAcceptanceFetcher as SrcAcceptance } from '../src/features/longshort/services/broker/alpaca/alpaca-order-acceptance-fetcher.ts';
import { AlpacaFillFetcher as SrcFill } from '../src/features/longshort/services/broker/alpaca/alpaca-fill-fetcher.ts';

const TS = new Date('2026-06-24T20:30:00Z');
const SUBMITTED = '2026-06-24T20:29:50Z';
const SUBMITTED_MS = new Date(SUBMITTED).getTime();

function ensureCreds() {
  if (!Deno.env.get('ALPACA_PAPER_KEY')) Deno.env.set('ALPACA_PAPER_KEY', 'k-test');
  if (!Deno.env.get('ALPACA_PAPER_SECRET')) Deno.env.set('ALPACA_PAPER_SECRET', 's-test');
}

/** Build a scripted fetch that responds with `body` regardless of input. */
function scriptedFetch(body: unknown): typeof fetch {
  const impl = async (_input: URL | RequestInfo, _init?: RequestInit): Promise<Response> => {
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return impl as unknown as typeof fetch;
}

interface Failure {
  scenario: string;
  detail: string;
}

const failures: Failure[] = [];

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a, dateReplacer) === JSON.stringify(b, dateReplacer);
}
function dateReplacer(_k: string, v: unknown): unknown {
  return v instanceof Date ? `__Date(${v.toISOString()})` : v;
}

async function scenarioOpenOrders() {
  const fixture = [
    { id: 'O-1', client_order_id: `lse-AAPL-open-${SUBMITTED_MS}`, symbol: 'AAPL', qty: '10', side: 'buy', status: 'new', limit_price: '180.50', submitted_at: SUBMITTED },
    { id: 'O-2', client_order_id: 'manual-operator-order', symbol: 'TSLA', qty: '1', side: 'buy', status: 'new', limit_price: '200', submitted_at: SUBMITTED },
    { id: 'O-3', client_order_id: `lse-MSFT-open-${SUBMITTED_MS}`, symbol: 'MSFT', qty: '5', side: 'buy', status: 'filled', limit_price: '300', submitted_at: SUBMITTED },
    { id: 'O-4', client_order_id: `lse-NVDA-open-${SUBMITTED_MS}-step1`, symbol: 'NVDA', qty: '3', side: 'buy', status: 'accepted', limit_price: '500', submitted_at: SUBMITTED },
  ];
  const edge = new EdgeOpenOrders(new EdgeClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) }));
  const src = new SrcOpenOrders(new SrcClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) }));
  const e = await edge.listOpenInFlight(TS);
  const s = await src.listOpenInFlight(TS);
  if (!deepEqual(e, s)) failures.push({ scenario: 'open-orders', detail: `edge=${JSON.stringify(e, dateReplacer)} src=${JSON.stringify(s, dateReplacer)}` });
}

async function scenarioAcceptance() {
  for (const status of ['accepted', 'new', 'partially_filled', 'rejected', 'canceled', 'pending_new', 'pending_cancel']) {
    const fixture = { id: 'O-X', symbol: 'AAPL', status, rejected_reason: status === 'rejected' ? 'risk_rejected' : null, submitted_at: SUBMITTED };
    const edge = new EdgeAcceptance(new EdgeClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) }));
    const src = new SrcAcceptance(new SrcClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) }));
    const e = await edge.fetchOrderAcceptance('O-X', 30, TS);
    const s = await src.fetchOrderAcceptance('O-X', 30, TS);
    if (!deepEqual(e, s)) failures.push({ scenario: `acceptance:${status}`, detail: `edge=${JSON.stringify(e, dateReplacer)} src=${JSON.stringify(s, dateReplacer)}` });
  }
}

async function scenarioFill() {
  for (const fixture of [
    { id: 'O-X', status: 'filled', qty: '10', filled_qty: '10', filled_avg_price: '180.51' },
    { id: 'O-X', status: 'partially_filled', qty: '10', filled_qty: '4', filled_avg_price: '180.40' },
    { id: 'O-X', status: 'new', qty: '10', filled_qty: '0', filled_avg_price: null },
    { id: 'O-X', status: 'filled', qty: '10', filled_qty: '10', filled_avg_price: '' },
  ]) {
    const edge = new EdgeFill(new EdgeClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) }));
    const src = new SrcFill(new SrcClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) }));
    const e = await edge.fetchFill('O-X', TS);
    const s = await src.fetchFill('O-X', TS);
    if (!deepEqual(e, s)) failures.push({ scenario: `fill:${fixture.status}`, detail: `edge=${JSON.stringify(e, dateReplacer)} src=${JSON.stringify(s, dateReplacer)}` });
  }
}

if (import.meta.main) {
  ensureCreds();
  await scenarioOpenOrders();
  await scenarioAcceptance();
  await scenarioFill();
  if (failures.length === 0) {
    console.log('check-broker-parity: CLEAN — edge-resident ≡ src/ for all fixture scenarios');
    Deno.exit(0);
  }
  console.error(`check-broker-parity: FAIL — ${failures.length} divergence(s):`);
  for (const f of failures) console.error(`  ${f.scenario}: ${f.detail}`);
  Deno.exit(1);
}