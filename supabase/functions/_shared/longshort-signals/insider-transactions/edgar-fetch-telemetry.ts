/**
 * edgar-fetch-telemetry.ts — INC-73-family telemetry contract for the
 * FP-050 EDGAR fetcher quartet (cik-mapper, master-index / daily-index,
 * accession-index, form4-xml).
 *
 * Motivation (FP-050 Phase 4 F1 pivot, ACT-199): a single failing fetch
 * at one SEC path family is STOP-and-investigate, not STOP-and-conclude
 * (see `docs/ai-failure-modes.md` #41 phantom-defect symmetric form,
 * second observation). Closing that loop requires per-fetch structured
 * evidence — status code + path-family-tag + correlation_id — surfaced
 * in the run row's audit trail so future F1-class pivots are evidence-
 * based, not memory-based.
 *
 * Contract: every fetcher class accepts an optional `telemetry`
 * callback. Default emits a single-line structured JSON via
 * `console.log` (captured by Supabase Edge logs and threadable to the
 * run-meta from the work-list consumer). Callers wiring the consumer
 * may replace the default with an in-memory accumulator that flushes
 * to `signal_queue_runs.meta` at finalize-time.
 *
 * Owner: longshort (FP-050 Phase 4 — F1.a master.idx pivot)
 */

/** Stable identifier for each SEC URL family the quartet touches. */
export type EdgarPathFamily =
  | 'company_tickers'
  | 'master_index'
  | 'accession_index'
  | 'form4_xml'
  | 'submissions';

/** Single per-fetch event surfaced to the telemetry callback. */
export interface EdgarFetchTelemetryEvent {
  /** Logical operation tag (mirrors *_OPERATION_ID constants). */
  op: string;
  /** Stable URL family tag — pivot-arithmetic surface. */
  path_family: EdgarPathFamily;
  /** HTTP status code (0 if the call threw before any response). */
  status: number;
  /** Verbatim URL fetched. */
  url: string;
  /** Correlation id threaded from the consumer; '' if absent. */
  correlation_id: string;
  /** Wall-clock-free ms duration derived from injected clock; -1 if not
   *  measured (the default impl does not measure; consumer-supplied
   *  callbacks may). */
  duration_ms: number;
}

/** Callback shape. Returns void; MUST NOT throw (defensive try/catch
 *  at the caller wraps it). */
export type EdgarFetchTelemetry = (event: EdgarFetchTelemetryEvent) => void;

/**
 * Default telemetry — emits a single-line structured JSON. Captured by
 * Supabase Edge logs and surfaces in the function's log stream so a
 * future F1-class pivot has at-least-this evidence even when the
 * consumer hasn't wired a meta-accumulator.
 */
export const defaultEdgarFetchTelemetry: EdgarFetchTelemetry = (event) => {
  // Single-line shape: easy to grep across log streams; the
  // path_family tag is the load-bearing pivot key.
  // Uses console.log (not console.info) for parity with the existing
  // _shared/ structured-log convention.
  console.log(JSON.stringify({ event: 'edgar_fetch', ...event }));
};