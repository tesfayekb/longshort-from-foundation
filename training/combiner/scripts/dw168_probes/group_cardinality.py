"""S1b — group-cardinality histogram probe (FP-066 WAVE-1).

Emits per-seed_as_of_date group-size statistics under two groupings:
  (i)  group_by(seed_as_of_date)               — trainer's current
  (ii) group_by(seed_as_of_date, intraday_slot) — slot-aware alt

Reads:   public.combiner_forward_returns ONLY (R1)
Writes:  NONE — JSONL to stdout (R2)
Filters: source_table='combiner_book', price_source_status='success',
         horizon_td=10

Early warning (per charter):
  - slot-aware groups predominantly <25 (NDCG@25 cutoff) →
    DW-168-PRE-WARN-CARDINALITY
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable, Optional, Sequence

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent.parent))

from scripts.dw168_probes._client import (  # noqa: E402
    PRICE_STATUS_OK,
    SOURCE_TABLE_LIVE,
    TRAINING_HORIZON_TD,
    make_service_role_client,
)

BINS = [
    ("<10", lambda n: n < 10),
    ("10-25", lambda n: 10 <= n < 25),
    ("25-50", lambda n: 25 <= n < 50),
    ("50-100", lambda n: 50 <= n < 100),
    ("100-250", lambda n: 100 <= n < 250),
    (">=250", lambda n: n >= 250),
]

NDCG_CUTOFF = 25


def _quantile(sorted_vals: Sequence[int], q: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return float(sorted_vals[0])
    pos = q * (len(sorted_vals) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = pos - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def summarize_sizes(sizes: Sequence[int]) -> dict:
    if not sizes:
        return {
            "groups": 0, "min": 0, "p25": 0, "median": 0, "p75": 0, "max": 0,
            "histogram": {label: 0 for label, _ in BINS},
            "frac_below_ndcg_cutoff": 0.0,
        }
    s = sorted(sizes)
    hist = {label: sum(1 for n in s if pred(n)) for label, pred in BINS}
    below = sum(1 for n in s if n < NDCG_CUTOFF)
    return {
        "groups": len(s),
        "min": s[0],
        "p25": _quantile(s, 0.25),
        "median": _quantile(s, 0.5),
        "p75": _quantile(s, 0.75),
        "max": s[-1],
        "histogram": hist,
        "frac_below_ndcg_cutoff": below / len(s),
    }


def aggregate_rows(rows: Iterable[dict]) -> dict:
    by_date: dict[str, int] = {}
    by_date_slot: dict[tuple, int] = {}
    for r in rows:
        if r.get("side_signed_return") is None:
            continue
        d = r["seed_as_of_date"]
        slot = r.get("intraday_slot")
        by_date[d] = by_date.get(d, 0) + 1
        by_date_slot[(d, slot)] = by_date_slot.get((d, slot), 0) + 1
    return {
        "date_grouping": summarize_sizes(list(by_date.values())),
        "date_slot_grouping": summarize_sizes(list(by_date_slot.values())),
    }


def classify_warning(summary: dict) -> Optional[str]:
    ds = summary["date_slot_grouping"]
    if ds["groups"] == 0:
        return None
    if ds["frac_below_ndcg_cutoff"] > 0.50:
        return "DW-168-PRE-WARN-CARDINALITY"
    return None


def fetch_rows(supabase) -> list[dict]:
    resp = (
        supabase.table("combiner_forward_returns")
        .select("seed_as_of_date,intraday_slot,side_signed_return")
        .eq("source_table", SOURCE_TABLE_LIVE)
        .eq("price_source_status", PRICE_STATUS_OK)
        .eq("horizon_td", TRAINING_HORIZON_TD)
        .execute()
    )
    return list(resp.data or [])


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="DW-168 S1b group-cardinality probe")
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
    sys.stdout.write(json.dumps({"kind": "cardinality", **summary}, sort_keys=True, default=str) + "\n")
    warning = classify_warning(summary)
    sys.stdout.write(json.dumps({
        "kind": "summary",
        "probe": "S1b-group-cardinality",
        "input_rows": len(rows),
        "warning": warning,
    }, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())