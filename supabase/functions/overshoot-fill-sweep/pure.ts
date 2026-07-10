// ACT-489 — pure helpers extracted for unit tests (mirrors parse-as-of-date
// pattern: no Deno.serve, no side-effects at import, no --allow-net needed).

export const OVERSHOOT_FILL_SWEEP_VERSION = 'inc97-cycle1-v2-20260710';
export const OVERSHOOT_FILL_SWEEP_DISCOVERY_QUERY_FINGERPRINT = 'sha256:inc90-created-at-window-action-order-id-v2+onconflict-partial-predicate';

/** YYYY-MM-DD in America/New_York for an instant. DST-safe. */
export function toEtSessionDate(ts: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(ts);
}

export interface A5Diff {
  symbol: string;
  side: string;
  broker_qty: number | null;
  ledger_qty: number | null;
}

export interface DiscoveryAuditFixtureRow {
  action: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface DiscoveryCandidateFixtureRow {
  order_id: string;
  ticker: string;
  side: 'long' | 'short';
  client_order_id: string;
  run_id: string | null;
}

/** Compare two (symbol|side)→qty maps; return symmetric-diff rows. */
export function computeA5SymmetricDiff(
  broker: Map<string, { side: string; qty: number }>,
  ledger: Map<string, { side: string; qty: number }>,
): A5Diff[] {
  const diffs: A5Diff[] = [];
  const keys = new Set<string>([...broker.keys(), ...ledger.keys()]);
  for (const k of Array.from(keys).sort()) {
    const b = broker.get(k) ?? null;
    const l = ledger.get(k) ?? null;
    const bQty = b ? b.qty : null;
    const lQty = l ? l.qty : null;
    const bSide = b ? b.side : (l ? l.side : '');
    const lSide = l ? l.side : (b ? b.side : '');
    const symbol = k.split('|')[0] ?? k;
    if (bQty === null || lQty === null || Math.abs((bQty ?? 0) - (lQty ?? 0)) > 1e-9 || bSide !== lSide) {
      diffs.push({ symbol, side: bSide || lSide, broker_qty: bQty, ledger_qty: lQty });
    }
  }
  return diffs;
}

export function shouldSuppressPauseForDiscoveryShortfall(args: {
  candidatesDiscovered: number;
  brokerCount: number;
  ledgerCount: number;
}): boolean {
  return args.candidatesDiscovered === 0 && args.ledgerCount === 0 && args.brokerCount > 0;
}

export function shouldInvokePauseForA5Divergence(args: {
  diffCount: number;
  dryRun: boolean;
  discoveryShortfall: boolean;
}): boolean {
  return args.diffCount > 0 && !args.dryRun && !args.discoveryShortfall;
}

export function discoverCandidateRowsForTest(
  rows: DiscoveryAuditFixtureRow[],
  sessionDate: string,
  existingSourceOrderIds: ReadonlySet<string>,
): DiscoveryCandidateFixtureRow[] {
  const start = Date.parse(`${sessionDate}T00:00:00.000Z`) - 14 * 24 * 60 * 60 * 1000;
  const end = Date.parse(`${sessionDate}T00:00:00.000Z`) + 2 * 24 * 60 * 60 * 1000;
  const byOrderId = new Map<string, DiscoveryCandidateFixtureRow>();
  for (const row of rows) {
    if (row.action !== 'overshoot.entry.submitted.entry') continue;
    const createdAt = Date.parse(row.created_at);
    if (!Number.isFinite(createdAt) || createdAt < start || createdAt >= end) continue;
    const orderId = asNonEmptyString(row.metadata.order_id);
    if (!orderId || existingSourceOrderIds.has(orderId)) continue;
    const ticker = asNonEmptyString(row.metadata.ticker);
    const side = asSide(row.metadata.side);
    const clientOrderId = asNonEmptyString(row.metadata.client_order_id);
    if (!ticker || !side || !clientOrderId) continue;
    byOrderId.set(orderId, {
      order_id: orderId,
      ticker,
      side,
      client_order_id: clientOrderId,
      run_id: asNonEmptyString(row.metadata.run_id),
    });
  }
  return Array.from(byOrderId.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asSide(value: unknown): 'long' | 'short' | null {
  return value === 'long' || value === 'short' ? value : null;
}