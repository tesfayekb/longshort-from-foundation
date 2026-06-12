/**
 * form4-row-types.ts — Form 4 row-shape contract consumed by the
 * insider-transactions compute layer (`compute-insider.ts`) and produced
 * by the seam mapper in `insider-load-and-compute.ts`
 * (`mapInsiderRowToForm4Row`, FP-050 Phase 3.6b.ii″).
 *
 * Historical citation (preserved per Rule 8): prior to FP-050 Phase
 * 3.6b.ii″, the producer was the EDGAR seam mapper in
 * `insider-orchestrator.ts` (`mapEdgarRowToForm4Row`). That orchestrator
 * file was deleted in ACT-192 along with its in-line EDGAR fetch loop;
 * the seam mapper relocated to `insider-load-and-compute.ts` and
 * re-rooted on the persisted `insider_form4_rows` table (work-list
 * producer landing in 3.6b.iii′).
 *
 * PROVENANCE (FP-050 Phase 2 / DW-094 deletion):
 *   The `Form4Row` interface was extracted VERBATIM (byte-identical for
 *   every field, doc-comment, and ordering) from
 *   `supabase/functions/_shared/longshort-signals/shared/polygon-form4-fetcher.ts`
 *   (the now-deleted Polygon Form-4 fetcher — see DW-094 / ACT entry in
 *   the FP-050 Phase 2 commit). The relocation discharges the spec
 *   collision in which `compute-insider.ts:53` imported `Form4Row` from a
 *   file scheduled for deletion. By moving the TYPE DEFINITION here and
 *   leaving the compute logic untouched, `compute-insider.ts` carries a
 *   one-line import-path diff (logic-empty) and `classifier`/`compute`/
 *   `filter`/`z-score` behavior is byte-preserved (the FP-042 reuse fence
 *   per ACT-156).
 *
 * SHAPE STABILITY:
 *   Downstream code (compute, classifier, z-score) reads only the fields
 *   declared below. The EDGAR seam in the orchestrator is responsible for
 *   producing rows in this shape; no other consumer constructs a
 *   `Form4Row` directly.
 *
 * Owner: longshort (FP-050 Phase 2 — Signal #4 EDGAR rebuild)
 */

/**
 * A single normalized Form 4 row. Carries every field the compute layer
 * needs to filter, classify the role, and contribute to the weighted sum.
 * Raw boolean fields preserved verbatim — the deterministic classifier
 * (`compute-insider.ts`) is the single authority that turns the booleans
 * + `officer_title` into a role weight.
 */
export interface Form4Row {
  /** 'transaction' or 'holding'. Compute layer drops 'holding'. */
  record_type: 'transaction' | 'holding' | string;
  /** Issuer ticker(s) the filing pertains to. Present on the market-wide
   *  (no `ticker=` query) variant, where it is the ONLY way to attribute
   *  a row to a ticker (the URL didn't carry one). When the fetcher's
   *  per-ticker variant is used, this is omitted — attribution is the
   *  call's `ticker` argument. Per the FP-042 market-wide addendum, the
   *  orchestrator attributes each row to `tickers[0]` (the primary
   *  issuer ticker as ordered by Polygon). */
  tickers?: string[];
  /** SEC transaction code (P/S/M/C/A/G/...). Undefined for holding rows. */
  transaction_code?: string;
  /** True if the transaction was made under a 10b5-1 plan. Per §4.4.4
   *  this is the load-bearing flag for excluding planned sales. */
  aff_10b5_one?: boolean;
  /** Acquired ('A') = +1 sign (purchase); Disposed ('D') = −1 sign (sale). */
  transaction_acquired_disposed?: 'A' | 'D' | string;
  transaction_shares?: number;
  transaction_price_per_share?: number;
  /** ISO YYYY-MM-DD. Used for decay (age_days = as_of − transaction_date). */
  transaction_date?: string;
  /** Role booleans. Multiple may be true for the same insider. */
  is_director?: boolean;
  is_officer?: boolean;
  is_ten_percent_owner?: boolean;
  not_subject_to_section_16?: boolean;
  /** Free-text — the title-heuristic classifier parses this. */
  officer_title?: string;
  /** Derivative vs non-derivative security; not currently used by the
   *  compute layer (M/C codes are already excluded by transaction_code),
   *  but preserved for diagnostics. */
  security_type?: string;
}