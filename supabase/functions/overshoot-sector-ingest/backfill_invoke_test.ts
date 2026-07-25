// One-shot Turn-3 backfill driver. Runs inside supabase--test_edge_functions
// where CRON_SECRET is present in Deno.env. Fires up to N batches of the
// deployed overshoot-sector-ingest function's apply mode and prints
// per-batch summaries verbatim. NOT a regression test — meant to be run
// manually for ACT-515(e) Sector Ingest Turn 3.

const URL_BASE = 'https://sftatlxatbdrotivxcip.supabase.co/functions/v1/overshoot-sector-ingest';
const BATCH_LIMIT = 200;
const MAX_BATCHES = 6;

Deno.test({
  name: 'ACT-515(e) T3 backfill driver — fires up to 6x200 apply batches',
  sanitizeResources: false,
  sanitizeOps: false,
    // One-shot: unconditionally run when the pattern matches.
  fn: async () => {
    const cron = Deno.env.get('CRON_SECRET');
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    console.log('cron_present=', Boolean(cron), 'len=', cron?.length ?? 0);
    console.log('env_keys_sample=', Object.keys(Deno.env.toObject()).filter(k => /secret|key|cron|fmp|supabase/i.test(k)).sort());
    if (!cron) throw new Error('CRON_SECRET missing in test env');
    if (!anon) throw new Error('SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY missing in test env');

    for (let i = 1; i <= MAX_BATCHES; i++) {
      const t0 = Date.now();
      const resp = await fetch(URL_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anon,
          'X-Cron-Secret': cron,
        },
        body: JSON.stringify({ apply: true, limit: BATCH_LIMIT }),
      });
      const body = await resp.json();
      const elapsed = Date.now() - t0;
      // Verbatim per-batch print.
      console.log(`--- batch ${i} (${elapsed}ms) status=${resp.status} ---`);
      console.log(JSON.stringify(body, null, 2));
      const summary = body?.summary ?? {};
      const candidateCount = summary.candidate_count ?? -1;
      if (candidateCount === 0) {
        console.log(`Batch ${i}: candidate_count=0 — universe fully enriched, stopping.`);
        break;
      }
    }
  },
});