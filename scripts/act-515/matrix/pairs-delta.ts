import { extractPairs, type SessionOffset } from './turn2b/pair-extractor.ts';
import { parseSlateLine } from './turn2b/slate-row.ts';

const cacheDir = 'cache/';
const years = [2022,2023,2024,2025,2026];
const slate: ReturnType<typeof parseSlateLine>[] = [];
for (const y of years) {
  const text = await Deno.readTextFile(`${cacheDir}slate-${y}.jsonl`);
  for (const line of text.split('\n').filter(l => l.length > 0)) slate.push(parseSlateLine(line));
}
console.log(`slate rows: ${slate.length}`);

// Build calendar from cache/calendar.jsonl (SPY-marker sessions).
const calText = await Deno.readTextFile(`${cacheDir}calendar.jsonl`);
const sessions: string[] = [];
for (const line of calText.split('\n').filter(l => l.length > 0)) {
  sessions.push((JSON.parse(line) as { session: string }).session);
}
sessions.sort();
const idx = new Map<string, number>();
sessions.forEach((s, i) => idx.set(s, i));
const calendar: SessionOffset = {
  sessionAfter(s, n) {
    const i = idx.get(s);
    if (i === undefined) return null;
    const j = i + n;
    if (j < 0 || j >= sessions.length) return null;
    return sessions[j];
  },
};

const res = extractPairs(slate, calendar);
const pairs = res.pairs;
console.log(`unique (ticker, entrySession) pairs: ${pairs.length}  off-calendar skipped: ${res.offCalendar}`);
console.log(`bySide: ${JSON.stringify(res.bySide)}`);

// Load pinned bars-pairs.jsonl into a Set of "ticker\0trade_date"
const seen = new Set<string>();
const barsText = await Deno.readTextFile(`${cacheDir}bars-pairs.jsonl`);
for (const line of barsText.split('\n').filter(l => l.length > 0)) {
  const r = JSON.parse(line) as { ticker: string; trade_date: string };
  seen.add(`${r.ticker}\u0000${r.trade_date}`);
}
console.log(`sealed bars-pairs entries: ${seen.size}`);

const delta = pairs.filter(([t, s]) => !seen.has(`${t}\u0000${s}`));
console.log(`delta pairs to fetch: ${delta.length}`);

// Also count pairs in seal that are NOT needed by new slate (orphaned but retained)
const needed = new Set(pairs.map(([t, s]) => `${t}\u0000${s}`));
let orphaned = 0;
for (const k of seen) if (!needed.has(k)) orphaned++;
console.log(`sealed pairs no longer referenced (orphan, retained for history): ${orphaned}`);

await Deno.writeTextFile('cache/pairs-delta.json',
  JSON.stringify(delta.map(([t, s]) => ({ ticker: t, entrySession: s }))));
