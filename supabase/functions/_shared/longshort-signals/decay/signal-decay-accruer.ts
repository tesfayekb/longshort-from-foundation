/**
 * Pure per-signal close-to-next-open decay accruer (MIG-114 / ACT-279).
 *
 * DB-free, clock-free, network-free. Maps a per-ticker open+close bar
 * bundle, eligibility flags, and a stream of fresh signal observations
 * into `signal_decay_returns` row payloads. The orchestrator is solely
 * responsible for I/O (Polygon, Supabase, halt/universe/exclusion reads)
 * and for stamping `computed_at` from the injected clock.
 *
 * Status precedence (highest to lowest — first match wins):
 *   1. bars === 'error'                 -> fetch_error
 *   2. bars === null                    -> polygon_404
 *   3. eligibility.hardExcluded         -> hard_excluded_since_seed
 *   4. eligibility.universeDropped      -> universe_dropped
 *   5. eligibility.haltedAtOpen         -> halted_at_open
 *   6. seed_close bar missing in bundle -> fetch_error
 *   7. next_open bar missing in bundle  -> fetch_error
 *   8. otherwise (Polygon-only success) -> unreconciled_single_source
 *
 * The `success` status is RESERVED — Phase-1 NEVER emits it. It is
 * reclaimed when the Tradier cross-source reconcile (DW-135) lands.
 *
 * NEVER emits 0 / -999 as a sentinel. Non-data-bearing rows carry NULL
 * for next_open / open_decay_return per the table's typed-absence CHECK.
 *
 * NO side-signing: signal observations are scalar (no `side` column on
 * `signal_observations`). Downstream evidence consumers attribute
 * direction from `seed_value`; the accruer emits the raw close-to-open
 * return so the measurement stays honest.
 */
import {
  DATA_BEARING_STATUSES,
  DECAY_STATUS_FETCH_ERROR,
  DECAY_STATUS_HALTED_AT_OPEN,
  DECAY_STATUS_HARD_EXCLUDED,
  DECAY_STATUS_POLYGON_404,
  DECAY_STATUS_UNIVERSE_DROPPED,
  DECAY_STATUS_UNRECONCILED,
  HORIZON_NEXT_OPEN,
  PRICE_SOURCE_POLYGON,
  type DecayPriceSourceStatus,
} from './signal-decay-constants.ts';
import type { OpenCloseBar } from '../shared/polygon-open-close-fetcher.ts';

/**
 * Per-ticker fetched bundle.
 *  - `OpenCloseBar[]` — Polygon returned bars (may still be empty / missing
 *    seed bar; the accruer handles that via Precedence 6/7).
 *  - `null` — Polygon 404 (ticker not found at the venue).
 *  - `'error'` — fetch threw, upstream error string not preserved
 *    (legacy shape; kept for back-compat with existing tests).
 *  - `{ error: string }` — fetch threw, orchestrator preserved the caught
 *    error's message so the accruer can surface it in `notes.upstream_error`
 *    (FP-XXX observability fix — measurement-only, no schema change).
 */
export type DecayBarBundle =
  | OpenCloseBar[]
  | null
  | 'error'
  | { error: string };

/**
 * Per-ticker eligibility evidence assembled by the orchestrator from
 * `universe_membership` / `hard_exclusions` / halt verifier.
 * All flags default-false in the orchestrator when the underlying read
 * is missing — the accruer treats `false` as "no disqualifier observed".
 */
export interface DecayEligibility {
  haltedAtOpen: boolean;
  haltReason?: string | null;
  universeDropped: boolean;
  hardExcluded: boolean;
  hardExclusionFiringRules?: ReadonlyArray<string>;
}

export interface DecaySeedObservation {
  signal_id: string;
  seed_as_of_date: string; // YYYY-MM-DD (the signal_observations.as_of_date)
  ticker: string;
  seed_value: number | null;
}

export interface DecayRow {
  signal_id: string;
  seed_as_of_date: string;
  ticker: string;
  horizon_label: typeof HORIZON_NEXT_OPEN;
  seed_value: number | null;
  seed_close: number | null;
  next_open: number | null;
  open_decay_return: number | null;
  seed_close_date: string | null;
  next_open_date: string | null;
  price_source: typeof PRICE_SOURCE_POLYGON;
  price_source_status: DecayPriceSourceStatus;
  notes: Record<string, unknown> | null;
}

function emptyRow(
  obs: DecaySeedObservation,
  status: DecayPriceSourceStatus,
  notes: Record<string, unknown> | null = null,
): DecayRow {
  return {
    signal_id: obs.signal_id,
    seed_as_of_date: obs.seed_as_of_date,
    ticker: obs.ticker,
    horizon_label: HORIZON_NEXT_OPEN,
    seed_value: obs.seed_value,
    seed_close: null,
    next_open: null,
    open_decay_return: null,
    seed_close_date: null,
    next_open_date: null,
    price_source: PRICE_SOURCE_POLYGON,
    price_source_status: status,
    notes,
  };
}

/**
 * Accrue decay rows.
 *
 * @param barsByTicker  Per-ticker fetched bundle. `undefined` for a ticker
 *                      treated defensively as fetch_error (orchestrator
 *                      should always pre-populate every survivor ticker).
 * @param eligibilityByTicker  Per-ticker eligibility flags. `undefined` is
 *                      treated as "no disqualifier observed" (all-false).
 * @param observations  Fresh seed observations (is_present=true,
 *                      carried_forward=false; orchestrator pre-filters).
 */
export function accrueDecayRows(
  barsByTicker: Map<string, DecayBarBundle>,
  eligibilityByTicker: Map<string, DecayEligibility>,
  observations: ReadonlyArray<DecaySeedObservation>,
): DecayRow[] {
  const out: DecayRow[] = [];
  for (const obs of observations) {
    const bars = barsByTicker.get(obs.ticker);
    const elig =
      eligibilityByTicker.get(obs.ticker) ?? {
        haltedAtOpen: false,
        universeDropped: false,
        hardExcluded: false,
      };

    // Precedence 1-2: fetch outcome short-circuits everything else.
    if (bars === undefined) {
      out.push(
        emptyRow(obs, DECAY_STATUS_FETCH_ERROR, {
          decay_fail: 'bars_undefined',
          detail: 'orchestrator did not populate ticker',
        }),
      );
      continue;
    }
    if (bars === 'error') {
      out.push(
        emptyRow(obs, DECAY_STATUS_FETCH_ERROR, {
          decay_fail: 'fetch_threw',
          upstream_error: null,
        }),
      );
      continue;
    }
    if (typeof bars === 'object' && bars !== null && !Array.isArray(bars) && 'error' in bars) {
      out.push(
        emptyRow(obs, DECAY_STATUS_FETCH_ERROR, {
          decay_fail: 'fetch_threw',
          upstream_error: bars.error,
        }),
      );
      continue;
    }
    if (bars === null) {
      out.push(emptyRow(obs, DECAY_STATUS_POLYGON_404));
      continue;
    }

    // Precedence 3-5: structural ineligibility.
    if (elig.hardExcluded) {
      const notes =
        elig.hardExclusionFiringRules && elig.hardExclusionFiringRules.length > 0
          ? { firing_rules: [...elig.hardExclusionFiringRules] }
          : null;
      out.push(emptyRow(obs, DECAY_STATUS_HARD_EXCLUDED, notes));
      continue;
    }
    if (elig.universeDropped) {
      out.push(emptyRow(obs, DECAY_STATUS_UNIVERSE_DROPPED));
      continue;
    }
    if (elig.haltedAtOpen) {
      const notes = elig.haltReason ? { halt_reason: elig.haltReason } : null;
      out.push(emptyRow(obs, DECAY_STATUS_HALTED_AT_OPEN, notes));
      continue;
    }

    // Precedence 6-7: bar presence.
    const seedIdx = bars.findIndex((b) => b.ts === obs.seed_as_of_date);
    if (seedIdx < 0) {
      out.push(
        emptyRow(obs, DECAY_STATUS_FETCH_ERROR, {
          decay_fail: 'seed_bar_not_in_window',
          seed_target: obs.seed_as_of_date,
          bars_returned: bars.length,
          bars_range: bars.length
            ? `${bars[0].ts}..${bars[bars.length - 1].ts}`
            : 'empty',
        }),
      );
      continue;
    }
    const nextIdx = seedIdx + 1;
    if (nextIdx >= bars.length) {
      out.push(
        emptyRow(obs, DECAY_STATUS_FETCH_ERROR, {
          decay_fail: 'no_next_open_bar',
          seed_target: obs.seed_as_of_date,
          seed_idx: seedIdx,
          bars_returned: bars.length,
          bars_range: `${bars[0].ts}..${bars[bars.length - 1].ts}`,
        }),
      );
      continue;
    }
    const seedClose = bars[seedIdx].close;
    const nextOpen = bars[nextIdx].open;
    if (
      !Number.isFinite(seedClose) ||
      !Number.isFinite(nextOpen) ||
      seedClose === 0
    ) {
      out.push(
        emptyRow(obs, DECAY_STATUS_FETCH_ERROR, {
          decay_fail: 'nonfinite_price',
          seed_close: Number.isFinite(seedClose) ? seedClose : null,
          next_open: Number.isFinite(nextOpen) ? nextOpen : null,
        }),
      );
      continue;
    }

    // Precedence 8: Polygon-only data-bearing row.
    // NEVER stamp 'success' in Phase-1 (reserved for cross-source reconcile,
    // DW-135) — operator-supervisor anti-phantom-confidence rule.
    const open_decay_return = nextOpen / seedClose - 1;
    out.push({
      signal_id: obs.signal_id,
      seed_as_of_date: obs.seed_as_of_date,
      ticker: obs.ticker,
      horizon_label: HORIZON_NEXT_OPEN,
      seed_value: obs.seed_value,
      seed_close: seedClose,
      next_open: nextOpen,
      open_decay_return,
      seed_close_date: bars[seedIdx].ts,
      next_open_date: bars[nextIdx].ts,
      price_source: PRICE_SOURCE_POLYGON,
      price_source_status: DECAY_STATUS_UNRECONCILED,
      notes: null,
    });
  }
  return out;
}

/** Re-export the data-bearing predicate so the orchestrator's stamping
 *  step uses the SAME source of truth as the accruer's status precedence. */
export { DATA_BEARING_STATUSES };