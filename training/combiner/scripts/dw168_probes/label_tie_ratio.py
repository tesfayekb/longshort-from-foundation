"""S1a — within-group label-tie ratio probe (FP-066 WAVE-1).

Per DEC-070 (h).2, slot>0 forward-return rows share the daily T+H label
by construction; lambdarank pairs on tied labels are uninformative
(Δrelevance=0 after _labels_to_relevance). This probe measures the
per-group ratio of tied ordered pairs against accruing real substrate so
the operator can see — before the late-July candidate trains — whether
the trainer's pair-wise loss is largely uninformative.

Reads:   public.combiner_forward_returns ONLY (R1)
Writes:  NONE — JSONL to stdout (R2)
Filters: source_table='combiner_book', price_source_status='success',
         horizon_td=10  (the §6.1/§6.2 training horizon)

Groups emitted (both, to inform the DW-205 slot-awareness decision):
  - per (seed_as_of_date, intraday_slot)
  - per  seed_as_of_date         (trainer's current grouping)

Early warning thresholds (operator-facing, per the FP-066 charter):
  - tie_ratio (trailing-10-session avg) > 0.20 → DW-168-PRE-WARN-NEW1
  - tie_ratio > 0.50                              → DW-205-BLOCKING

The compute helpers are pure and unit-tested; the __main__ entrypoint
threads them onto the live Supabase read (or a JSONL fixture in
--dry-run mode).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable, Optional, Sequence

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent.parent))  # training/combiner on sys.path

from scripts.dw168_probes._client import (  # noqa: E402
    PRICE_STATUS_OK,
    SOURCE_TABLE_LIVE,
    TRAINING_HORIZON_TD,
    make_service_role_client,
)

EPS = 1e-9

# ----- pure compute (unit-tested) ------------------------------------------


def compute_tie_ratio(
    labels: Sequence[float],
    *,
    eps: float = 0.0,
) -> dict:
    """Compute tied-pair ratio for one group.

    Returns ``{n, tied_pairs, total_pairs, tie_ratio}``. ``tie_ratio`` is
    ``tied_pairs / total_pairs`` or ``0.0`` when n<2. ``eps>0`` uses
    ``|a-b| <= eps`` tied-equality; ``eps=0`` requires exact float equality.

    O(n^2) — acceptable; per-day groups are O(universe-size) ~ few hundred.
    """
    n = len(labels)
    if n < 2:
        return {"n": n, "tied_pairs": 0, "total_pairs": 0, "tie_ratio": 0.0}
    tied = 0
    for i in range(n - 1):
        a = labels[i]
        for j in range(i + 1, n):
            b = labels[j]
            if eps > 0.0:
                if abs(a - b) <= eps:
                    tied += 1
            else:
                if a == b:
                    tied += 1
    total = n * (n - 1) // 2
    return {
        "n": n,
        "tied_pairs": tied,
        "total_pairs": total,
        "tie_ratio": tied / total,
    }


def aggregate_rows(rows: Iterable[dict]) -> list[dict]:
    """Produce the JSONL records for one batch of forward-return rows.

    Each input row needs ``seed_as_of_date``, ``intraday_slot``,
    ``side_signed_return``. Rows with NULL side_signed_return are filtered
    (the typed-absence contract — price_source_status<>'success' would
    have already been excluded upstream, but this is the defense-in-depth
    layer here).
    """
    by_date_slot: dict[tuple, list[float]] = {}
    by_date: dict[str, list[float]] = {}
    for r in rows:
        v = r.get("side_signed_return")
        if v is None:
            continue
        d = r["seed_as_of_date"]
        slot = r.get("intraday_slot")
        by_date_slot.setdefault((d, slot), []).append(float(v))
        by_date.setdefault(d, []).append(float(v))

    out: list[dict] = []
    for (d, slot), labels in sorted(by_date_slot.items(), key=lambda x: (x[0][0], x[0][1] if x[0][1] is not None else -1)):
        exact = compute_tie_ratio(labels, eps=0.0)
        eps = compute_tie_ratio(labels, eps=EPS)
        out.append({
            "kind": "date_slot",
            "date": d,
            "slot": slot,
            "n": exact["n"],
            "tied_pairs": exact["tied_pairs"],
            "total_pairs": exact["total_pairs"],
            "tie_ratio": exact["tie_ratio"],
            "tie_ratio_eps": eps["tie_ratio"],
        })
    for d, labels in sorted(by_date.items()):
        exact = compute_tie_ratio(labels, eps=0.0)
        eps = compute_tie_ratio(labels, eps=EPS)
        out.append({
            "kind": "date",
            "date": d,
            "slot": None,
            "n": exact["n"],
            "tied_pairs": exact["tied_pairs"],
            "total_pairs": exact["total_pairs"],
            "tie_ratio": exact["tie_ratio"],
            "tie_ratio_eps": eps["tie_ratio"],
        })
    return out


def classify_warning(date_slot_records: Sequence[dict]) -> Optional[str]:
    """Trailing-10-session avg tie_ratio classification per the charter.

    Operates over the date_slot kind records (the slot-aware groups are
    the ones the lambdarank pair-wise loss actually sees once DW-205 is
    decided). Returns None / DW-168-PRE-WARN-NEW1 / DW-205-BLOCKING.
    """
    ratios = [r["tie_ratio"] for r in date_slot_records if r["kind"] == "date_slot"]
    if not ratios:
        return None
    tail = ratios[-10:]
    avg = sum(tail) / len(tail)
    if avg > 0.50:
        return "DW-205-BLOCKING"
    if avg > 0.20:
        return "DW-168-PRE-WARN-NEW1"
    return None


# ----- IO (live read) ------------------------------------------------------


def fetch_rows(supabase) -> list[dict]:
    """READ-ONLY (R1/R2): single SELECT against combiner_forward_returns."""
    resp = (
        supabase.table("combiner_forward_returns")
        .select("seed_as_of_date,intraday_slot,side,side_signed_return")
        .eq("source_table", SOURCE_TABLE_LIVE)
        .eq("price_source_status", PRICE_STATUS_OK)
        .eq("horizon_td", TRAINING_HORIZON_TD)
        .execute()
    )
    return list(resp.data or [])


def _emit_jsonl(records: Iterable[dict]) -> None:
    for r in records:
        sys.stdout.write(json.dumps(r, default=str, sort_keys=True) + "\n")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="DW-168 S1a label-tie-ratio probe")
    parser.add_argument("--dry-run", action="store_true",
                        help="read rows from --fixture JSONL instead of Supabase")
    parser.add_argument("--fixture", type=str, default=None,
                        help="JSONL file of raw combiner_forward_returns rows")
    args = parser.parse_args(argv)

    if args.dry_run:
        if not args.fixture:
            print("dry-run requires --fixture <path-to-jsonl>", file=sys.stderr)
            return 2
        rows = [json.loads(line) for line in Path(args.fixture).read_text().splitlines() if line.strip()]
    else:
        client = make_service_role_client()
        rows = fetch_rows(client)

    records = aggregate_rows(rows)
    _emit_jsonl(records)
    warning = classify_warning(records)
    sys.stdout.write(json.dumps({
        "kind": "summary",
        "probe": "S1a-label-tie-ratio",
        "input_rows": len(rows),
        "groups_emitted": len(records),
        "warning": warning,
    }, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())