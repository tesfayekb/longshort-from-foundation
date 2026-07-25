// ACT-570 Phase-1: FINRA CDN Reg SHO daily short-volume ingest
// DEV-16 ruling: NUMERIC(20,6) volume columns
// DEV-7 lesson: per-file bookkeeping row for EVERY attempt (no cursor orphans)
//
// Contract:
//   POST body: { start_date: "YYYY-MM-DD", end_date: "YYYY-MM-DD", max_files?: number }
//   Iterates business days in range, fetches
//     https://cdn.finra.org/equity/regsho/daily/CNMSshvol{YYYYMMDD}.txt
//   Filters to overshoot_universe (active=true), upserts to
//     overshoot_short_volume_daily, and writes one row to
//     finra_shvol_ingest_log for EVERY date attempted (including
//     weekends/holidays which are recorded as skipped_holiday).

// Gate 14 (check-supabase-client-specifier): must import via canonical
// '@supabase/supabase-js' specifier mapped in supabase/functions/deno.json.
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CDN_BASE = "https://cdn.finra.org/equity/regsho/daily";
const THROTTLE_MS = 500; // ≤ 2 req/s per operator directive
const FETCH_TIMEOUT_MS = 30_000;

type IngestOutcome = {
  trade_date: string;
  source_url: string;
  http_status: number | null;
  bytes_downloaded: number | null;
  rows_in_file: number | null;
  rows_matched_universe: number | null;
  rows_upserted: number | null;
  status: "ok" | "http_error" | "parse_error" | "empty" | "partial" | "skipped_holiday";
  error_message: string | null;
  duration_ms: number;
};

function fmtYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

function parseFinraFile(body: string): Array<{
  date: string;
  symbol: string;
  short_volume: number;
  short_exempt_volume: number;
  total_volume: number;
  market: string;
}> {
  const lines = body.split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0];
  if (!header.startsWith("Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market")) {
    throw new Error(`unexpected_header: ${header.slice(0, 80)}`);
  }
  const out: ReturnType<typeof parseFinraFile> = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === "") continue;
    // Some files end with a trailer line like "20260717|H|..." aggregate — skip if not 6 fields
    const parts = line.split("|");
    if (parts.length !== 6) continue;
    const [date, symbol, sv, sev, tv, market] = parts;
    // Trailer rows sometimes have non-standard symbols; keep parse permissive
    const nSv = Number(sv);
    const nSev = Number(sev);
    const nTv = Number(tv);
    if (!Number.isFinite(nSv) || !Number.isFinite(nTv)) continue;
    out.push({
      date,
      symbol: symbol.trim().toUpperCase(),
      short_volume: nSv,
      short_exempt_volume: Number.isFinite(nSev) ? nSev : 0,
      total_volume: nTv,
      market: market ?? "",
    });
  }
  return out;
}

async function processOneDate(
  d: Date,
  universe: Set<string>,
  supabase: ReturnType<typeof createClient>,
): Promise<IngestOutcome> {
  const started = Date.now();
  const ymd = fmtYmd(d);
  const iso = isoDate(d);
  const url = `${CDN_BASE}/CNMSshvol${ymd}.txt`;

  if (isWeekend(d)) {
    return {
      trade_date: iso,
      source_url: url,
      http_status: null,
      bytes_downloaded: null,
      rows_in_file: null,
      rows_matched_universe: null,
      rows_upserted: null,
      status: "skipped_holiday",
      error_message: "weekend",
      duration_ms: Date.now() - started,
    };
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  } catch (e) {
    return {
      trade_date: iso, source_url: url,
      http_status: null, bytes_downloaded: null,
      rows_in_file: null, rows_matched_universe: null, rows_upserted: null,
      status: "http_error", error_message: `fetch_error: ${(e as Error).message}`,
      duration_ms: Date.now() - started,
    };
  }

  if (res.status === 404) {
    // Non-trading day (holiday) — no file published
    await res.text().catch(() => "");
    return {
      trade_date: iso, source_url: url,
      http_status: 404, bytes_downloaded: 0,
      rows_in_file: 0, rows_matched_universe: 0, rows_upserted: 0,
      status: "skipped_holiday", error_message: "cdn_404_no_file",
      duration_ms: Date.now() - started,
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      trade_date: iso, source_url: url,
      http_status: res.status, bytes_downloaded: text.length,
      rows_in_file: null, rows_matched_universe: null, rows_upserted: null,
      status: "http_error", error_message: `http_${res.status}`,
      duration_ms: Date.now() - started,
    };
  }

  const body = await res.text();
  const bytes = body.length;

  let parsed: ReturnType<typeof parseFinraFile>;
  try {
    parsed = parseFinraFile(body);
  } catch (e) {
    return {
      trade_date: iso, source_url: url,
      http_status: res.status, bytes_downloaded: bytes,
      rows_in_file: null, rows_matched_universe: null, rows_upserted: null,
      status: "parse_error", error_message: (e as Error).message,
      duration_ms: Date.now() - started,
    };
  }

  if (parsed.length === 0) {
    return {
      trade_date: iso, source_url: url,
      http_status: res.status, bytes_downloaded: bytes,
      rows_in_file: 0, rows_matched_universe: 0, rows_upserted: 0,
      status: "empty", error_message: "no_data_rows",
      duration_ms: Date.now() - started,
    };
  }

  const matched = parsed.filter((r) => universe.has(r.symbol));
  if (matched.length === 0) {
    return {
      trade_date: iso, source_url: url,
      http_status: res.status, bytes_downloaded: bytes,
      rows_in_file: parsed.length, rows_matched_universe: 0, rows_upserted: 0,
      status: "ok", error_message: null,
      duration_ms: Date.now() - started,
    };
  }

  const rows = matched.map((r) => ({
    ticker: r.symbol,
    trade_date: iso,
    short_volume: r.short_volume,
    short_exempt_volume: r.short_exempt_volume,
    total_volume: r.total_volume,
    market: r.market,
    source: "finra_cdn_archive",
  }));

  // Chunked upsert to keep individual PostgREST payloads modest.
  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("overshoot_short_volume_daily")
      .upsert(slice, { onConflict: "ticker,trade_date" });
    if (error) {
      return {
        trade_date: iso, source_url: url,
        http_status: res.status, bytes_downloaded: bytes,
        rows_in_file: parsed.length, rows_matched_universe: matched.length,
        rows_upserted: upserted,
        status: "partial", error_message: `upsert_error: ${error.message}`,
        duration_ms: Date.now() - started,
      };
    }
    upserted += slice.length;
  }

  return {
    trade_date: iso, source_url: url,
    http_status: res.status, bytes_downloaded: bytes,
    rows_in_file: parsed.length, rows_matched_universe: matched.length,
    rows_upserted: upserted,
    status: "ok", error_message: null,
    duration_ms: Date.now() - started,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    // Auth: accept any of the three service-scoped bearers the platform
    // may present — CRON_SECRET (scheduled), SUPABASE_SERVICE_ROLE_KEY
    // (operator backfill), or the project's publishable/anon key
    // (Lovable-tooling / dev-console path). No user JWTs. The fn always
    // uses SERVICE_ROLE_KEY server-side for writes.
    const auth = req.headers.get("authorization") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const pubKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const backfillSecret = Deno.env.get("BACKFILL_ONESHOT_SECRET") ?? "";
    const bearer = auth.replace(/^Bearer\s+/i, "");
    const ok =
      (cronSecret && bearer === cronSecret) ||
      (svcKey && bearer === svcKey) ||
      (anonKey && bearer === anonKey) ||
      (pubKey && bearer === pubKey) ||
      (backfillSecret && bearer === backfillSecret);
    if (!ok) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const startStr = body.start_date ?? url.searchParams.get("start_date");
    const endStr = body.end_date ?? url.searchParams.get("end_date");
    const maxFiles = Number(body.max_files ?? url.searchParams.get("max_files") ?? 60);

    if (!startStr || !endStr) {
      return new Response(JSON.stringify({ error: "start_date and end_date required (YYYY-MM-DD)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const start = new Date(`${startStr}T00:00:00Z`);
    const end = new Date(`${endStr}T00:00:00Z`);
    if (isNaN(+start) || isNaN(+end) || start > end) {
      return new Response(JSON.stringify({ error: "invalid date range" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load universe once
    const universe = new Set<string>();
    const { data: uniRows, error: uniErr } = await supabase
      .from("overshoot_universe")
      .select("ticker")
      .eq("active", true);
    if (uniErr) throw new Error(`universe_load_failed: ${uniErr.message}`);
    for (const r of uniRows ?? []) universe.add(String(r.ticker).toUpperCase());

    const outcomes: IngestOutcome[] = [];
    let filesProcessed = 0;
    const cursor = new Date(start);
    while (cursor <= end && filesProcessed < maxFiles) {
      const outcome = await processOneDate(cursor, universe, supabase);
      outcomes.push(outcome);
      // Insert bookkeeping row (best-effort; failures logged in response)
      const { error: logErr } = await supabase
        .from("finra_shvol_ingest_log")
        .insert({
          trade_date: outcome.trade_date,
          source_url: outcome.source_url,
          http_status: outcome.http_status,
          bytes_downloaded: outcome.bytes_downloaded,
          rows_in_file: outcome.rows_in_file,
          rows_matched_universe: outcome.rows_matched_universe,
          rows_upserted: outcome.rows_upserted,
          status: outcome.status,
          error_message: outcome.error_message,
          duration_ms: outcome.duration_ms,
        });
      if (logErr) {
        outcome.error_message = `${outcome.error_message ?? ""} | log_insert_error: ${logErr.message}`;
      }
      filesProcessed++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      // Throttle only for real fetches, not weekend skips
      if (outcome.status !== "skipped_holiday") {
        await new Promise((r) => setTimeout(r, THROTTLE_MS));
      }
    }

    const summary = {
      files_processed: filesProcessed,
      ok: outcomes.filter((o) => o.status === "ok").length,
      empty: outcomes.filter((o) => o.status === "empty").length,
      skipped_holiday: outcomes.filter((o) => o.status === "skipped_holiday").length,
      http_error: outcomes.filter((o) => o.status === "http_error").length,
      parse_error: outcomes.filter((o) => o.status === "parse_error").length,
      partial: outcomes.filter((o) => o.status === "partial").length,
      rows_upserted_total: outcomes.reduce((s, o) => s + (o.rows_upserted ?? 0), 0),
      first: outcomes[0]?.trade_date ?? null,
      last: outcomes[outcomes.length - 1]?.trade_date ?? null,
      remaining_range_end: cursor <= end ? isoDate(cursor) : null,
    };

    return new Response(JSON.stringify({ ok: true, summary, outcomes }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});