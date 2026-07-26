// Turn-2B Stage-B driver: build windows from admitted lots, batch-fetch bars.
import { buildWindows, packBatches } from './turn2b/window-batcher.ts';
import { ArraySessionCalendar } from '../kernel/exit.ts';

const CACHE = new URL('./cache/', import.meta.url).pathname;
const URL_ = 'https://sftatlxatbdrotivxcip.supabase.co/functions/v1/overshoot-matrix-export';
const TOKEN = 'mx1-7e2a4c9d6b8f13e5a077c1b4d5e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6';

const calText = await Deno.readTextFile(`${CACHE}calendar.jsonl`);
const sessions = calText.split('\n').filter(Boolean).map(l => (JSON.parse(l) as {session:string}).session);
const cal = new ArraySessionCalendar(sessions);
const offset = {
  sessionAfter: (s: string, n: number) => cal.sessionAfter(s, n),
  lastSession: () => sessions[sessions.length - 1],
};

const lotsText = await Deno.readTextFile(`${CACHE}turn-2b-lots.jsonl`);
const lots = lotsText.split('\n').filter(Boolean).map(l => JSON.parse(l));
console.log(`lots: ${lots.length}`);

const { windows, totalDays, clampedLotIds } = buildWindows(lots, offset);
console.log(`windows: ${windows.length}  totalDays: ${totalDays}  clamped: ${clampedLotIds.length}`);

const batches = packBatches(windows);
console.log(`batches: ${batches.length}`);
for (const [i, b] of batches.entries()) console.log(`  batch ${i}: ${b.windows.length} windows, ${b.sumDays} days`);

const out = await Deno.open(`${CACHE}bars-windows.jsonl`, { write: true, create: true, truncate: true });
let totalRows = 0;
for (const [i, b] of batches.entries()) {
  const body = JSON.stringify({ windows: b.windows });
  const t0 = Date.now();
  const res = await fetch(`${URL_}?mode=bars_windows`, {
    method: 'POST',
    headers: { 'x-matrix-export-token': TOKEN, 'content-type': 'application/json' },
    body,
  });
  if (!res.ok) { console.error(`batch ${i} FAILED: ${res.status} ${await res.text()}`); Deno.exit(1); }
  const text = await res.text();
  const n = text.split('\n').filter(Boolean).length;
  totalRows += n;
  await out.write(new TextEncoder().encode(text.endsWith('\n') ? text : text + '\n'));
  console.log(`  batch ${i}: fetched ${n} rows in ${Date.now()-t0}ms`);
}
out.close();
console.log(`Stage-B DONE. total bar rows: ${totalRows}`);

// SPY
const spyRes = await fetch(`${URL_}?mode=spy&since=2022-01-01&until=2026-12-31`, {
  method: 'GET', headers: { 'x-matrix-export-token': TOKEN },
});
if (!spyRes.ok) { console.error('SPY FAILED'); Deno.exit(1); }
const spyText = await spyRes.text();
await Deno.writeTextFile(`${CACHE}spy.jsonl`, spyText);
console.log(`SPY: ${spyText.split('\n').filter(Boolean).length} rows`);
