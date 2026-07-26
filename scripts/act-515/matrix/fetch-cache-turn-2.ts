// ACT-515 Matrix — Fetch-Cache Turn-2 driver (RULING 2026-07-26 · DEV-T T-1).
//
// Half-of-turn mode is controlled by --stage=<A|B|calendar|spy|rip-probe|all>.
// TURN-2A ships `--stage=calendar` only (this session, per T-1). TURN-2B
// ships A/B/spy/rip-probe in the next session (or later this session if
// the envelope holds).
//
// Mirrors Turn-1 pattern: streams NDJSON from overshoot-matrix-export into
// scripts/act-515/matrix/cache/*.jsonl, then computes SHA-256 to be pasted
// into cache-shas.ts.
//
// Auth: header X-Matrix-Export-Token=<oneshot> — RIPS after Turn-2B parity
// gate reads green (sequence law, RULING 2026-07-26).
//
// Usage:
//   FN_URL=https://<ref>.functions.supabase.co/overshoot-matrix-export \
//   MX_TOKEN=<oneshot> \
//   deno run --allow-net --allow-read --allow-write --allow-env \
//     scripts/act-515/matrix/fetch-cache-turn-2.ts --stage=calendar

import { encodeHex } from 'https://deno.land/std@0.224.0/encoding/hex.ts';

const WINDOW_START = '2022-06-29';
const WINDOW_END   = '2026-07-10';

const CACHE_DIR = new URL('./cache/', import.meta.url).pathname;

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) { console.error(`missing env: ${name}`); Deno.exit(2); }
  return v;
}

async function sha256Hex(path: string): Promise<string> {
  const bytes = await Deno.readFile(path);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return encodeHex(new Uint8Array(hash));
}

async function fetchStream(url: string, init: RequestInit, outPath: string): Promise<number> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fetch ${url} → ${res.status}: ${text.slice(0, 500)}`);
  }
  const f = await Deno.open(outPath, { create: true, write: true, truncate: true });
  let rows = 0;
  const decoder = new TextDecoder();
  let carry = '';
  const writer = f.writable.getWriter();
  try {
    for await (const chunk of res.body!) {
      carry += decoder.decode(chunk, { stream: true });
      const lastNl = carry.lastIndexOf('\n');
      if (lastNl >= 0) {
        const flush = carry.slice(0, lastNl + 1);
        rows += (flush.match(/\n/g) ?? []).length;
        await writer.write(new TextEncoder().encode(flush));
        carry = carry.slice(lastNl + 1);
      }
    }
    if (carry.length > 0) {
      if (!carry.endsWith('\n')) carry += '\n';
      rows += 1;
      await writer.write(new TextEncoder().encode(carry));
    }
  } finally {
    await writer.close();
  }
  return rows;
}

async function stageCalendar(fnUrl: string, token: string): Promise<void> {
  const url = `${fnUrl}?mode=calendar&since=${WINDOW_START}&until=${WINDOW_END}`;
  const outPath = `${CACHE_DIR}calendar.jsonl`;
  console.log(`[calendar] GET ${url}`);
  const t0 = performance.now();
  const rows = await fetchStream(url, {
    method: 'GET',
    headers: { 'X-Matrix-Export-Token': token, 'Accept': 'application/x-ndjson' },
  }, outPath);
  const ms = (performance.now() - t0).toFixed(0);
  const sha = await sha256Hex(outPath);
  console.log(`[calendar] rows=${rows} sha256=${sha} ms=${ms} path=${outPath}`);
  console.log(JSON.stringify({ stage: 'calendar', file: 'calendar.jsonl', rows, sha256: sha,
                              window: [WINDOW_START, WINDOW_END] }, null, 2));
}

// Stub bodies for TURN-2B stages — landed here so the driver is one file
// across both halves. TURN-2B implements admit / stage-A / stage-B / spy /
// rip-probe against this scaffold.
async function stageA(_fnUrl: string, _token: string): Promise<void> {
  throw new Error('stage-A (bars_pairs + admit) lands in TURN-2B per T-1 split.');
}
async function stageB(_fnUrl: string, _token: string): Promise<void> {
  throw new Error('stage-B (bars_windows) lands in TURN-2B per T-1 split.');
}
async function stageSpy(_fnUrl: string, _token: string): Promise<void> {
  throw new Error('spy lands in TURN-2B per T-1 split.');
}
async function stageRipProbe(_fnUrl: string, _token: string): Promise<void> {
  throw new Error('rip-probe lands in TURN-2B per sequence law.');
}

async function main(): Promise<void> {
  const fnUrl = requireEnv('FN_URL');
  const token = requireEnv('MX_TOKEN');
  const stage = (Deno.args.find(a => a.startsWith('--stage='))?.slice('--stage='.length)) ?? '';

  switch (stage) {
    case 'calendar': await stageCalendar(fnUrl, token); return;
    case 'A':        await stageA(fnUrl, token); return;
    case 'B':        await stageB(fnUrl, token); return;
    case 'spy':      await stageSpy(fnUrl, token); return;
    case 'rip-probe':await stageRipProbe(fnUrl, token); return;
    default:
      console.error('usage: --stage=<calendar|A|B|spy|rip-probe>');
      Deno.exit(2);
  }
}

if (import.meta.main) await main();