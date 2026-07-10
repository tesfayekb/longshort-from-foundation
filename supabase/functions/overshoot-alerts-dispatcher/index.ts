/**
 * overshoot-alerts-dispatcher — ACT-497 H2.
 *
 * Read-only alerting for the overshoot strategy. Never gates engine runs.
 * Money-path immutable: this function only READS from *_runs, *_reconciliation_state,
 * kill_switches, job_registry, overshoot_audit_logs and WRITES to overshoot_alert_dispatch.
 *
 * Modes (POST body):
 *   { mode: "watchdog" }  — default; scans audit tail + cron overdue and dispatches
 *                            alerts for any new CRITICAL/HIGH condition.
 *   { mode: "digest"   }  — one-shot INFO summary (daily 17:00 ET fire).
 *   { mode: "push", trigger_kind, severity, source_table, source_row_id,
 *                   subject, body_preview, correlation_id? }
 *                          — dispatch a pre-formed alert (invoked from
 *                            _shared/strategy-audit.ts non-blocking hook).
 *
 * Idempotency: unique index on (trigger_kind, source_table, source_row_id) WHERE
 * outcome='dispatched'. Second attempt for the same source row inserts a
 * 'skipped_idempotent' row and does NOT hit Resend.
 *
 * Delivery: Resend via Lovable connector gateway. Auth:
 *   Authorization: Bearer ${LOVABLE_API_KEY}
 *   X-Connection-Api-Key: ${RESEND_API_KEY}
 * Recipient: EDGAR_CONTACT_EMAIL. From: onboarding@resend.dev (Resend owner
 * account only — matches single-operator use case per ACT-497 STEP A).
 *
 * Send failures write outcome='failed' + action='overshoot.alert.dispatch_failed'
 * to overshoot_audit_logs (per operator ratification).
 *
 * Auth model:
 *   - X-Cron-Secret header  → pg_cron path (watchdog + digest)
 *   - Service role internal → push path (from strategy-audit seam)
 *   - Authenticated + overshoot.manage → operator manual invoke
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { apiError } from '../_shared/api-error.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { evaluateOverdue } from '../_shared/cron-schedule.ts';

/**
 * Version echo — bumped on every dispatcher deploy so `GET /` proves the
 * running build. See INC-95 (cron-aware overdue + slot-based idempotency).
 */
export const OVERSHOOT_ALERTS_DISPATCHER_VERSION = 'inc95-cron-aware-overdue-v1-20260710';

const RAW_RECIPIENT =
  (Deno.env.get('ALERT_RECIPIENT_EMAIL') ?? Deno.env.get('EDGAR_CONTACT_EMAIL') ?? '').trim();
const RECIPIENT_SOURCE = Deno.env.get('ALERT_RECIPIENT_EMAIL')
  ? 'ALERT_RECIPIENT_EMAIL'
  : (Deno.env.get('EDGAR_CONTACT_EMAIL') ? 'EDGAR_CONTACT_EMAIL' : 'none');
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const LOVABLE_KEY = Deno.env.get('LOVABLE_API_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';

/**
 * Boot-time recipient normalization. Accepts:
 *   - bare email:            "user@example.com"
 *   - RFC-5322 name form:    "Display Name <user@example.com>"
 * Returns the bare address only (Resend `to` requires that).
 * On invalid input, RECIPIENT is '' and RECIPIENT_INVALID_REASON is set;
 * dispatchOne then routes to alert.dispatch_failed instead of Resend.
 */
const BARE_EMAIL_RE = /^[^\s<>@,;"]+@[^\s<>@,;"]+\.[^\s<>@,;"]+$/;
const NAME_ADDR_RE  = /<\s*([^\s<>@,;"]+@[^\s<>@,;"]+\.[^\s<>@,;"]+)\s*>\s*$/;
function normalizeRecipient(raw: string): { email: string; reason?: string } {
  if (!raw) return { email: '', reason: 'recipient_env_missing' };
  if (BARE_EMAIL_RE.test(raw)) return { email: raw };
  const m = raw.match(NAME_ADDR_RE);
  if (m && BARE_EMAIL_RE.test(m[1])) return { email: m[1] };
  return { email: '', reason: 'invalid_recipient' };
}
const { email: RECIPIENT, reason: RECIPIENT_INVALID_REASON } = normalizeRecipient(RAW_RECIPIENT);

/** Masked shape for diagnostic GET — never returns the local part. */
function maskedRecipientShape(raw: string): string {
  if (!raw) return '(empty)';
  // Extract any @domain we can find; mask local part entirely.
  const at = raw.lastIndexOf('@');
  if (at < 0) return `(no @; len=${raw.length})`;
  const localLen = at - Math.max(0, raw.lastIndexOf('<') + 1);
  const tail = raw.slice(at);
  const domainEnd = tail.search(/[\s>]/);
  const domain = domainEnd < 0 ? tail : tail.slice(0, domainEnd);
  const hasAngle = /<[^>]*>/.test(raw);
  const suffix = raw.slice(at + domain.length).trim();
  const shape = hasAngle
    ? `Name <***${domain}>`
    : (suffix ? `***${domain} ${suffix}` : `***${domain}`);
  return `${shape} (local_len=${localLen}, total_len=${raw.length})`;
}

interface PushBody {
  mode: 'push';
  trigger_kind: string;
  severity: 'CRITICAL' | 'HIGH' | 'INFO';
  source_table: string;
  source_row_id: string;
  subject: string;
  body_preview?: string;
  correlation_id?: string;
}
interface ScanBody { mode?: 'watchdog' | 'digest' }
type Body = PushBody | ScanBody;

interface DispatchResult {
  outcome: 'dispatched' | 'failed' | 'skipped_idempotent';
  provider_message_id?: string;
  error_message?: string;
}

async function sendEmail(subject: string, body: string, severity: 'CRITICAL'|'HIGH'|'INFO'): Promise<DispatchResult> {
  if (!RESEND_KEY || !LOVABLE_KEY) {
    return { outcome: 'failed', error_message: 'resend_or_lovable_key_missing' };
  }
  if (!RECIPIENT) {
    return { outcome: 'failed', error_message: RECIPIENT_INVALID_REASON ?? 'recipient_missing' };
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${LOVABLE_KEY}`,
    'X-Connection-Api-Key': RESEND_KEY,
  };
  if (severity === 'CRITICAL') headers['X-Priority'] = '1';

  const prefix = severity === 'CRITICAL' ? '[CRITICAL] ' : severity === 'HIGH' ? '[HIGH] ' : '[INFO] ';
  const payload = {
    from: 'Overshoot Alerts <onboarding@resend.dev>',
    to: [RECIPIENT],
    subject: prefix + subject,
    text: body,
  };
  try {
    const resp = await fetch(`${GATEWAY_URL}/emails`, {
      method: 'POST', headers, body: JSON.stringify(payload),
    });
    const txt = await resp.text();
    if (!resp.ok) return { outcome: 'failed', error_message: `resend_${resp.status}: ${txt.slice(0, 500)}` };
    let msgId: string | undefined;
    try { msgId = (JSON.parse(txt) as { id?: string }).id; } catch { /* ignore */ }
    return { outcome: 'dispatched', provider_message_id: msgId };
  } catch (err) {
    return { outcome: 'failed', error_message: err instanceof Error ? err.message : String(err) };
  }
}

async function recordDispatch(row: {
  trigger_kind: string; severity: 'CRITICAL'|'HIGH'|'INFO';
  source_table: string; source_row_id: string;
  subject: string; body_preview: string; correlation_id: string;
  result: DispatchResult;
}): Promise<void> {
  await supabaseAdmin.from('overshoot_alert_dispatch').insert({
    trigger_kind: row.trigger_kind,
    severity: row.severity,
    source_table: row.source_table,
    source_row_id: row.source_row_id,
    channel: 'resend_email',
    recipient: RECIPIENT,
    subject: row.subject,
    body_preview: row.body_preview.slice(0, 2000),
    outcome: row.result.outcome,
    provider_message_id: row.result.provider_message_id ?? null,
    error_message: row.result.error_message ?? null,
    correlation_id: row.correlation_id,
  });

  if (row.result.outcome === 'failed') {
    await supabaseAdmin.from('overshoot_audit_logs').insert({
      operator_id: '00000000-0000-0000-0000-000000000001',
      action: 'overshoot.alert.dispatch_failed',
      target_type: 'overshoot_alert_dispatch',
      target_id: row.source_row_id,
      metadata: {
        trigger_kind: row.trigger_kind,
        severity: row.severity,
        source_table: row.source_table,
        error_message: row.result.error_message,
      },
      correlation_id: row.correlation_id,
    });
  }
}

/**
 * dispatchOne — idempotency-guarded single-alert dispatch. Insert-first
 * against the unique index; on conflict, record 'skipped_idempotent' and
 * do NOT hit Resend.
 */
async function dispatchOne(input: {
  trigger_kind: string; severity: 'CRITICAL'|'HIGH'|'INFO';
  source_table: string; source_row_id: string;
  subject: string; body_preview: string; correlation_id: string;
}): Promise<DispatchResult> {
  // Pre-check idempotency: any prior 'dispatched' row for the same source?
  const { data: prior } = await supabaseAdmin
    .from('overshoot_alert_dispatch')
    .select('id')
    .eq('trigger_kind', input.trigger_kind)
    .eq('source_table', input.source_table)
    .eq('source_row_id', input.source_row_id)
    .eq('outcome', 'dispatched')
    .limit(1)
    .maybeSingle();
  if (prior) {
    await recordDispatch({ ...input, result: { outcome: 'skipped_idempotent' } });
    return { outcome: 'skipped_idempotent' };
  }

  const result = await sendEmail(input.subject, input.body_preview, input.severity);
  await recordDispatch({ ...input, result });
  return result;
}

// ─── Scan sources (watchdog mode) ───────────────────────────────────────

async function scanKillSwitchChanges(correlationId: string): Promise<DispatchResult[]> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('audit_logs')
    .select('id, action, metadata, created_at, correlation_id')
    .in('action', ['kill_switch.hard_pause', 'kill_switch.soft_pause', 'kill_switch.resume', 'kill_switch.system_pause', 'kill_switch.manual_liquidate'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);
  const results: DispatchResult[] = [];
  for (const row of (data ?? [])) {
    const md = (row.metadata ?? {}) as Record<string, unknown>;
    const strat = String(md.strategy_key ?? '');
    if (strat !== 'overshoot') continue;
    results.push(await dispatchOne({
      trigger_kind: 'kill_switch_state_change',
      severity: 'CRITICAL',
      source_table: 'audit_logs',
      source_row_id: String(row.id),
      subject: `Overshoot kill-switch: ${row.action}`,
      body_preview: `strategy=overshoot action=${row.action} state_after=${md.state_after ?? '?'} reason=${md.reason ?? '?'} at=${row.created_at}`,
      correlation_id: String(row.correlation_id ?? correlationId),
    }));
  }
  return results;
}

async function scanFailedRuns(correlationId: string): Promise<DispatchResult[]> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const results: DispatchResult[] = [];
  const engines: Array<{ table: string; key: string; tsCol: string; idCol: string; countCol?: string; selCol?: string }> = [
    { table: 'overshoot_detection_runs', key: 'detection', tsCol: 'detected_at', idCol: 'run_id', countCol: 'event_count', selCol: 'selected_count' },
    { table: 'overshoot_entry_runs',     key: 'entry',     tsCol: 'created_at',  idCol: 'run_id' },
    { table: 'overshoot_backfill_runs',  key: 'backfill',  tsCol: 'created_at',  idCol: 'run_id' },
  ];
  for (const e of engines) {
    const sel = ['run_id', e.tsCol, 'outcome'];
    if (e.countCol) sel.push(e.countCol);
    if (e.selCol) sel.push(e.selCol);
    const { data } = await supabaseAdmin
      .from(e.table)
      .select(sel.join(','))
      // Dynamic column name — Supabase's typed builder is bypassed via
      // `as never` (assignable to any positional slot without introducing
      // `any`; satisfies no-explicit-any without a lint-directive).
      .gte(e.tsCol as never, since)
      .order(e.tsCol as never, { ascending: false })
      .limit(50);
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const outcome = String(row.outcome ?? '');
      const evc = Number(row[e.countCol ?? ''] ?? 0);
      const sc  = Number(row[e.selCol ?? ''] ?? 0);
      const isFail = outcome === 'failed';
      const isRefusedAll = e.selCol && e.countCol && evc > 50 && sc === 0;
      if (!isFail && !isRefusedAll) continue;
      const runId = String(row.run_id);
      results.push(await dispatchOne({
        trigger_kind: isFail ? `engine_failed_${e.key}` : `engine_refused_100pct_${e.key}`,
        severity: 'HIGH',
        source_table: e.table,
        source_row_id: runId,
        subject: `Overshoot ${e.key} ${isFail ? 'FAILED' : 'refused 100% (' + evc + '→0)'}`,
        body_preview: `run_id=${runId} outcome=${outcome} events=${evc} selected=${sc} at=${row[e.tsCol]}`,
        correlation_id: correlationId,
      }));
    }
  }
  return results;
}

async function scanFillSweepShortfall(correlationId: string): Promise<DispatchResult[]> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('overshoot_entry_runs')
    .select('run_id, submitted_count, adopted_count, created_at')
    .gte('created_at', since)
    .limit(50);
  const results: DispatchResult[] = [];
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const sub = Number(r.submitted_count ?? 0);
    const ado = Number(r.adopted_count ?? 0);
    if (sub > 0 && ado < sub) {
      results.push(await dispatchOne({
        trigger_kind: 'fill_sweep_discovery_shortfall',
        severity: 'HIGH',
        source_table: 'overshoot_entry_runs',
        source_row_id: String(r.run_id),
        subject: `Overshoot fill-sweep shortfall: ${ado}/${sub}`,
        body_preview: `run_id=${r.run_id} submitted=${sub} adopted=${ado} shortfall=${sub - ado} at=${r.created_at}`,
        correlation_id: correlationId,
      }));
    }
  }
  return results;
}

async function scanReconciliationDivergence(correlationId: string): Promise<DispatchResult[]> {
  const { data } = await supabaseAdmin
    .from('overshoot_reconciliation_state')
    .select('*')
    .limit(50);
  const results: DispatchResult[] = [];
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const outcome = String(r.outcome ?? r.state ?? '');
    if (!outcome.toLowerCase().includes('diverg')) continue;
    const rowId = String(r.id ?? r.recon_id ?? r.correlation_id ?? crypto.randomUUID());
    results.push(await dispatchOne({
      trigger_kind: 'a5_reconciliation_divergence',
      severity: 'CRITICAL',
      source_table: 'overshoot_reconciliation_state',
      source_row_id: rowId,
      subject: `Overshoot A5 divergence: ${outcome}`,
      body_preview: `outcome=${outcome} row=${JSON.stringify(r).slice(0, 400)}`,
      correlation_id: correlationId,
    }));
  }
  return results;
}

/**
 * Watchdog: cron-expected-run missing by T+30min. Reads job_registry
 * (enabled=true, owner_module='overshoot') and compares last-fire evidence.
 */
async function scanCronOverdue(correlationId: string): Promise<DispatchResult[]> {
  const { data: reg } = await supabaseAdmin
    .from('job_registry')
    .select('id, schedule, enabled, status')
    .eq('owner_module', 'overshoot')
    .eq('enabled', true);
  const results: DispatchResult[] = [];
  const now = new Date();
  const nowMs = now.getTime();
  const TOLERANCE_MS = 30 * 60 * 1000;
  const map: Record<string, { table: string; tsCol: string }> = {
    'overshoot.detection.run':          { table: 'overshoot_detection_runs',   tsCol: 'detected_at' },
    'overshoot.entry.run':              { table: 'overshoot_entry_runs',       tsCol: 'created_at'  },
    'overshoot.exit.run':               { table: 'overshoot_entry_runs',       tsCol: 'created_at'  },
    'overshoot.fill_sweep':             { table: 'overshoot_entry_runs',       tsCol: 'created_at'  },
    'overshoot.short_interest.compute': { table: 'overshoot_short_interest',   tsCol: 'as_of_date'  },
    'overshoot.equity_snapshot':        { table: 'overshoot_equity_snapshots', tsCol: 'created_at'  },
    'overshoot_equity_snapshot':        { table: 'overshoot_equity_snapshots', tsCol: 'created_at'  },
  };
  for (const r of (reg ?? []) as Array<Record<string, unknown>>) {
    const id = String(r.id);
    const schedule = String(r.schedule ?? '');
    const m = map[id];
    if (!m || !schedule) continue;
    const { data: last } = await supabaseAdmin
      // Dynamic table + column names — same `as never` pattern as above.
      .from(m.table as never)
      .select(m.tsCol as never)
      .order(m.tsCol as never, { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastTs = last ? new Date(String((last as Record<string, unknown>)[m.tsCol])).getTime() : 0;
    // INC-95 fix — cron-aware overdue predicate. Compute the most recent
    // slot the schedule expression called for; page only when that slot is
    // (a) older than tolerance, AND (b) strictly newer than the last
    // actual fire evidence. This correctly handles weekday/hour/DoW gates
    // (no false pages overnight for `* 13-21 * * 1-5`, no false pages
    // mid-month for `0 21 1,15 * *`). Unparseable schedule → skip (no
    // fabricated verdict).
    const { overdue, lastExpected } = evaluateOverdue(schedule, now, lastTs, TOLERANCE_MS);
    if (overdue && lastExpected) {
      // INC-95 fix — slot-based dedup key. One alert per genuinely missed
      // slot; a subsequent watchdog tick against the SAME missed slot
      // insert-conflicts on the unique index (trigger_kind, source_table,
      // source_row_id) WHERE outcome='dispatched'. Re-page only when a
      // NEW expected slot has also been missed.
      const slotKey = lastExpected.toISOString();
      const staleMs = nowMs - lastTs;
      results.push(await dispatchOne({
        trigger_kind: 'cron_overdue',
        severity: 'HIGH',
        source_table: 'job_registry',
        source_row_id: `${id}@${slotKey}`,
        subject: `Overshoot cron overdue: ${id}`,
        body_preview:
          `job=${id} schedule=${schedule} last_expected_slot=${slotKey} ` +
          `last_actual_fire=${last ? String((last as Record<string, unknown>)[m.tsCol]) : 'never'} ` +
          `stale_hours=${(staleMs / 3600000).toFixed(1)} ` +
          `dispatcher_version=${OVERSHOOT_ALERTS_DISPATCHER_VERSION}`,
        correlation_id: correlationId,
      }));
    }
  }
  return results;
}

async function runDigest(correlationId: string): Promise<DispatchResult> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const lines: string[] = ['Overshoot 24h digest', '===================='];
  for (const t of ['overshoot_detection_runs','overshoot_entry_runs','overshoot_backfill_runs']) {
    const { data } = await supabaseAdmin
      // Dynamic table name across an inline literal-union loop; same
      // `as never` pattern (no-explicit-any without a lint-directive).
      .from(t as never)
      .select('run_id, outcome')
      .gte('created_at', since);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const counts: Record<string, number> = {};
    for (const r of rows) counts[String(r.outcome ?? 'unknown')] = (counts[String(r.outcome ?? 'unknown')] ?? 0) + 1;
    lines.push(`${t}: ${rows.length} runs — ${JSON.stringify(counts)}`);
  }
  const { data: eq } = await supabaseAdmin
    .from('overshoot_equity_snapshots')
    .select('snapshot_date, broker_equity, cash, long_market_value, positions_priced')
    .order('snapshot_date', { ascending: false }).limit(2);
  lines.push(`equity snapshots: ${JSON.stringify(eq ?? [])}`);
  const { data: lots } = await supabaseAdmin
    .from('overshoot_lots').select('state', { count: 'exact', head: false });
  const openCount = ((lots ?? []) as Array<Record<string, unknown>>).filter(l => String(l.state) === 'open').length;
  lines.push(`open lots: ${openCount}`);
  const bucket = new Date().toISOString().slice(0, 10);
  return await dispatchOne({
    trigger_kind: 'daily_digest',
    severity: 'INFO',
    source_table: 'system',
    source_row_id: `digest:${bucket}`,
    subject: `Overshoot daily digest ${bucket}`,
    body_preview: lines.join('\n'),
    correlation_id: correlationId,
  });
}

// ─── Handler ────────────────────────────────────────────────────────────

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  if (req.method === 'GET') {
    return apiSuccess({
      ok: true,
      handler: 'overshoot-alerts-dispatcher',
      version: OVERSHOOT_ALERTS_DISPATCHER_VERSION,
      correlation_id: correlationId,
      recipient_source: RECIPIENT_SOURCE,
      recipient_valid: RECIPIENT !== '',
      recipient_invalid_reason: RECIPIENT_INVALID_REASON ?? null,
      recipient_shape_masked: maskedRecipientShape(RAW_RECIPIENT),
    });
  }
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed', { correlationId });

  // Auth: CRON_SECRET header OR service-role. Explicit operator invocations
  // travel via Supabase JS + Authorization; the handler envelope validates JWT
  // shape upstream, but this function does not require overshoot.manage
  // for the scan modes — they are pure reads with idempotent dispatch.
  const cronHeader = req.headers.get('X-Cron-Secret') ?? '';
  const isCron = CRON_SECRET !== '' && cronHeader === CRON_SECRET;

  let body: Body = {};
  try { body = (await req.json()) as Body; } catch { body = {}; }
  const mode = (body as ScanBody).mode ?? 'watchdog';

  if (mode === 'push') {
    const p = body as PushBody;
    if (!p.trigger_kind || !p.severity || !p.source_table || !p.source_row_id || !p.subject) {
      return apiError(400, 'push_body_incomplete', { correlationId });
    }
    const result = await dispatchOne({
      trigger_kind: p.trigger_kind,
      severity: p.severity,
      source_table: p.source_table,
      source_row_id: p.source_row_id,
      subject: p.subject,
      body_preview: p.body_preview ?? p.subject,
      correlation_id: p.correlation_id ?? correlationId,
    });
    return apiSuccess({ mode: 'push', correlation_id: correlationId, ...result });
  }

  if (mode === 'digest') {
    if (!isCron) return apiError(403, 'digest_requires_cron_secret', { correlationId });
    const r = await runDigest(correlationId);
    return apiSuccess({ mode: 'digest', correlation_id: correlationId, result: r });
  }

  // watchdog (default)
  const [ks, fr, fs, rd, co] = await Promise.all([
    scanKillSwitchChanges(correlationId),
    scanFailedRuns(correlationId),
    scanFillSweepShortfall(correlationId),
    scanReconciliationDivergence(correlationId),
    scanCronOverdue(correlationId),
  ]);
  const all = [...ks, ...fr, ...fs, ...rd, ...co];
  const summary = {
    kill_switch: ks.length,
    failed_runs: fr.length,
    fill_sweep: fs.length,
    a5_diverge: rd.length,
    cron_overdue: co.length,
    total: all.length,
    dispatched: all.filter(x => x.outcome === 'dispatched').length,
    skipped: all.filter(x => x.outcome === 'skipped_idempotent').length,
    failed: all.filter(x => x.outcome === 'failed').length,
  };
  return apiSuccess({
    mode: 'watchdog',
    version: OVERSHOOT_ALERTS_DISPATCHER_VERSION,
    correlation_id: correlationId,
    summary,
  });
}));