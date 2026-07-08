// ACT-489 — pure helpers extracted for unit tests (mirrors parse-as-of-date
// pattern: no Deno.serve, no side-effects at import, no --allow-net needed).

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