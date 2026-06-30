"""S1c — feature-variation-across-slot probe (FP-066 WAVE-1).

If features at (date, ticker, slot=0) are ~identical to (date, ticker,
slot=N), intraday rows are pure label-duplication — worst case for the
pair-wise lambdarank loss. This probe reads the last N=10 sessions with
>=2 distinct intraday_slot per (as_of_date, ticker) and reports the
per-(date,ticker) pairwise L2 distance distribution across the slot
matrix plus per-feature variance ratio
    Var(across slots within ticker) / Var(across tickers within slot).

Reads:   public.combiner_feature_vectors ONLY (R1) — uses ``as_of_date``
         (NOT ``seed_as_of_date`` — that's the forward_returns column).
Writes:  NONE — JSONL to stdout (R2)

Early warning (per charter):
  - median pairwise L2 < 0.05                       → DW-168-PRE-WARN-NEW2
  - variance-ratio < 0.10 on >=12/18 FEATURE_ORDER  → DW-205-BLOCKING-NEW2
    keys
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from pathlib import Path
from typing import Iterable, Optional, Sequence

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent.parent))

from feature_contract import FEATURE_ORDER, features_to_ordered_row  # noqa: E402
from scripts.dw168_probes._client import make_service_role_client  # noqa: E402

L2_WARN_MEDIAN = 0.05
VAR_RATIO_THRESHOLD = 0.10
VAR_RATIO_KEY_COUNT = 12
SESSION_WINDOW = 10


def _l2(a: Sequence[float], b: Sequence[float]) -> float:
    return math.sqrt(sum((x - y) * (x - y) for x, y in zip(a, b)))


def pairwise_distances(rows_by_slot: dict) -> list[float]:
    slots = sorted(rows_by_slot.keys())
    dists: list[float] = []
    for i in range(len(slots) - 1):
        for j in range(i + 1, len(slots)):
            dists.append(_l2(rows_by_slot[slots[i]], rows_by_slot[slots[j]]))
    return dists


def variance_ratio_per_feature(
    grouped: dict,
) -> list[float]:
    """Per-feature ratio Var(across slots within ticker, averaged over
    tickers) / Var(across tickers within slot, averaged over slots).

    ``grouped`` keyed by (date, ticker, slot) -> ordered feature row
    (already in FEATURE_ORDER). The returned list is in FEATURE_ORDER.
    """
    by_dt: dict[tuple, dict[int, list[float]]] = {}
    by_ds: dict[tuple, dict[str, list[float]]] = {}
    for (d, t, slot), row in grouped.items():
        by_dt.setdefault((d, t), {})[slot] = row
        by_ds.setdefault((d, slot), {})[t] = row

    n_features = len(FEATURE_ORDER)
    out: list[float] = []
    for k in range(n_features):
        # numerator: avg over (d,t) of variance across slots of feature-k
        within_ticker_vars: list[float] = []
        for (d, t), slot_rows in by_dt.items():
            if len(slot_rows) < 2:
                continue
            vals = [slot_rows[s][k] for s in slot_rows]
            within_ticker_vars.append(statistics.pvariance(vals))
        # denominator: avg over (d,slot) of variance across tickers of feature-k
        within_slot_vars: list[float] = []
        for (d, slot), tick_rows in by_ds.items():
            if len(tick_rows) < 2:
                continue
            vals = [tick_rows[t][k] for t in tick_rows]
            within_slot_vars.append(statistics.pvariance(vals))
        if not within_ticker_vars or not within_slot_vars:
            out.append(float("nan"))
            continue
        num = statistics.fmean(within_ticker_vars)
        den = statistics.fmean(within_slot_vars)
        if den <= 0.0:
            out.append(float("inf") if num > 0 else 0.0)
        else:
            out.append(num / den)
    return out


def aggregate_rows(rows: Iterable[dict]) -> dict:
    """Build the JSONL summary from raw combiner_feature_vectors rows.

    Each row needs ``as_of_date``, ``ticker``, ``intraday_slot``,
    ``features`` (jsonb). Rows where ``features`` can't be projected
    onto FEATURE_ORDER (raises ValueError — the typed-absence contract
    upstream should have prevented this) are skipped with a count.
    """
    # Restrict to the last SESSION_WINDOW dates present in the input
    # that have >=2 distinct slots for >=1 ticker.
    by_date_ticker_slot: dict[tuple, list[float]] = {}
    skipped_projection_errors = 0
    for r in rows:
        try:
            ordered = features_to_ordered_row(r["features"] or {})
        except (ValueError, TypeError, KeyError):
            skipped_projection_errors += 1
            continue
        key = (r["as_of_date"], r["ticker"], r["intraday_slot"])
        by_date_ticker_slot[key] = ordered

    # Filter to (date,ticker) groups with >=2 distinct slots, restricted
    # to the most recent SESSION_WINDOW dates.
    dt_slots: dict[tuple, dict[int, list[float]]] = {}
    for (d, t, slot), row in by_date_ticker_slot.items():
        dt_slots.setdefault((d, t), {})[slot] = row
    qualifying = {k: v for k, v in dt_slots.items() if len(v) >= 2}
    recent_dates = sorted({d for (d, _) in qualifying.keys()})[-SESSION_WINDOW:]
    qualifying = {(d, t): v for (d, t), v in qualifying.items() if d in recent_dates}

    # Pairwise L2 distribution.
    all_dists: list[float] = []
    for (d, t), slot_rows in qualifying.items():
        all_dists.extend(pairwise_distances(slot_rows))
    all_dists.sort()
    if all_dists:
        l2_summary = {
            "n_pairs": len(all_dists),
            "min": all_dists[0],
            "median": statistics.median(all_dists),
            "p75": all_dists[int(0.75 * (len(all_dists) - 1))],
            "max": all_dists[-1],
        }
    else:
        l2_summary = {"n_pairs": 0, "min": 0.0, "median": 0.0, "p75": 0.0, "max": 0.0}

    # Variance-ratio per feature.
    grouped = {(d, t, s): row for (d, t), srows in qualifying.items() for s, row in srows.items()}
    var_ratios = variance_ratio_per_feature(grouped)
    var_ratio_records = [
        {"feature": name, "var_ratio": vr}
        for name, vr in zip(FEATURE_ORDER, var_ratios)
    ]

    return {
        "l2": l2_summary,
        "variance_ratio": var_ratio_records,
        "qualifying_dt_pairs": len(qualifying),
        "recent_dates": [str(d) for d in recent_dates],
        "skipped_projection_errors": skipped_projection_errors,
    }


def classify_warnings(summary: dict) -> list[str]:
    warnings: list[str] = []
    if summary["l2"]["n_pairs"] > 0 and summary["l2"]["median"] < L2_WARN_MEDIAN:
        warnings.append("DW-168-PRE-WARN-NEW2")
    low_count = sum(
        1 for r in summary["variance_ratio"]
        if isinstance(r["var_ratio"], float)
        and not math.isnan(r["var_ratio"])
        and r["var_ratio"] < VAR_RATIO_THRESHOLD
    )
    if low_count >= VAR_RATIO_KEY_COUNT:
        warnings.append("DW-205-BLOCKING-NEW2")
    return warnings


def fetch_rows(supabase) -> list[dict]:
    resp = (
        supabase.table("combiner_feature_vectors")
        .select("as_of_date,ticker,intraday_slot,features")
        .order("as_of_date", desc=True)
        .limit(50000)
        .execute()
    )
    return list(resp.data or [])


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="DW-168 S1c feature-variation probe")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--fixture", type=str, default=None)
    args = parser.parse_args(argv)

    if args.dry_run:
        if not args.fixture:
            print("dry-run requires --fixture", file=sys.stderr)
            return 2
        rows = [json.loads(l) for l in Path(args.fixture).read_text().splitlines() if l.strip()]
    else:
        rows = fetch_rows(make_service_role_client())

    summary = aggregate_rows(rows)
    sys.stdout.write(json.dumps({"kind": "feature_variation", **summary}, sort_keys=True, default=str) + "\n")
    warnings = classify_warnings(summary)
    sys.stdout.write(json.dumps({
        "kind": "summary",
        "probe": "S1c-feature-variation",
        "input_rows": len(rows),
        "qualifying_dt_pairs": summary["qualifying_dt_pairs"],
        "warnings": warnings,
    }, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())