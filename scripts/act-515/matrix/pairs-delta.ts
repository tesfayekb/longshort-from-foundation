import { extractPairs } from './turn2b/pair-extractor.ts';
import { parseSlateLine } from './turn2b/slate-row.ts';

const cacheDir = 'cache/';
const years = [2022,2023,2024,2025,2026];
const slate: ReturnType<typeof parseSlateLine>[] = [];
for (const y of years) {
  const text = await Deno.readTextFile(`${cacheDir}slate-${y}.jsonl`);
  for (const line of text.split('\n').filter(l => l.length > 0)) slate.push(parseSlateLine(line));
}
console.log(`slate rows: ${slate.length}`);

const pairs = extractPairs(slate);
console.log(`unique (ticker, entrySession) pairs: ${pairs.length}`);

// Load pinned bars-pairs.jsonl into a Set of "ticker\0trade_date"
const seen = new Set<string>();
const barsText = await Deno.readTextFile(`${cacheDir}bars-pairs.jsonl`);
for (const line of barsText.split('\n').filter(l => l.length > 0)) {
  const r = JSON.parse(line) as { ticker: string; trade_date: string };
  seen.add(`${r.ticker}\u0000${r.trade_date}`);
}
console.log(`sealed bars-pairs entries: ${seen.size}`);

const delta = pairs.filter(p => !seen.has(`${p.ticker}\u0000${p.entrySession}`));
console.log(`delta pairs to fetch: ${delta.length}`);

// Also count pairs in seal that are NOT needed by new slate (orphaned but retained)
const needed = new Set(pairs.map(p => `${p.ticker}\u0000${p.entrySession}`));
let orphaned = 0;
for (const k of seen) if (!needed.has(k)) orphaned++;
console.log(`sealed pairs no longer referenced (orphan, retained for history): ${orphaned}`);

await Deno.writeTextFile('cache/pairs-delta.json', JSON.stringify(delta));
