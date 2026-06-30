"""Unit tests for the DW-168 S1a label-tie-ratio probe (FP-066 WAVE-1).

Fixtures are raw combiner_forward_returns rows (R4 — no candidate
fabrication). Pure-compute / no Supabase / no LightGBM.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent))

from scripts.dw168_probes.label_tie_ratio import (  # noqa: E402
    aggregate_rows,
    classify_warning,
    compute_tie_ratio,
)


class TestComputeTieRatio(unittest.TestCase):
    def test_empty(self):
        r = compute_tie_ratio([])
        self.assertEqual(r, {"n": 0, "tied_pairs": 0, "total_pairs": 0, "tie_ratio": 0.0})

    def test_all_distinct(self):
        r = compute_tie_ratio([0.1, 0.2, 0.3, 0.4])
        self.assertEqual(r["tied_pairs"], 0)
        self.assertEqual(r["total_pairs"], 6)
        self.assertEqual(r["tie_ratio"], 0.0)

    def test_all_tied(self):
        r = compute_tie_ratio([0.5, 0.5, 0.5])
        self.assertEqual(r["tied_pairs"], 3)
        self.assertEqual(r["tie_ratio"], 1.0)

    def test_eps_tolerance(self):
        exact = compute_tie_ratio([1.0, 1.0 + 1e-12], eps=0.0)
        eps = compute_tie_ratio([1.0, 1.0 + 1e-12], eps=1e-9)
        self.assertEqual(exact["tied_pairs"], 0)
        self.assertEqual(eps["tied_pairs"], 1)


class TestAggregateRows(unittest.TestCase):
    def _rows(self):
        return [
            {"seed_as_of_date": "2026-06-29", "intraday_slot": 0, "side_signed_return": 0.01},
            {"seed_as_of_date": "2026-06-29", "intraday_slot": 0, "side_signed_return": 0.02},
            {"seed_as_of_date": "2026-06-29", "intraday_slot": 1, "side_signed_return": 0.03},
            {"seed_as_of_date": "2026-06-29", "intraday_slot": 1, "side_signed_return": 0.03},
            {"seed_as_of_date": "2026-06-30", "intraday_slot": 0, "side_signed_return": 0.04},
            {"seed_as_of_date": "2026-06-30", "intraday_slot": 1, "side_signed_return": 0.05},
            {"seed_as_of_date": "2026-06-30", "intraday_slot": 1, "side_signed_return": 0.05},
        ]

    def test_field_set_present(self):
        recs = aggregate_rows(self._rows())
        required = {"kind", "date", "slot", "n", "tied_pairs", "total_pairs",
                    "tie_ratio", "tie_ratio_eps"}
        for r in recs:
            self.assertTrue(required.issubset(r.keys()))

    def test_filters_null_labels(self):
        rows = self._rows() + [{"seed_as_of_date": "2026-06-29", "intraday_slot": 0,
                                "side_signed_return": None}]
        recs = aggregate_rows(rows)
        date_slot = [r for r in recs if r["kind"] == "date_slot"
                     and r["date"] == "2026-06-29" and r["slot"] == 0]
        self.assertEqual(date_slot[0]["n"], 2)

    def test_tied_slot_detected(self):
        recs = aggregate_rows(self._rows())
        tied_grp = next(r for r in recs if r["kind"] == "date_slot"
                        and r["date"] == "2026-06-29" and r["slot"] == 1)
        self.assertEqual(tied_grp["tie_ratio"], 1.0)


class TestClassifyWarning(unittest.TestCase):
    def test_no_records(self):
        self.assertIsNone(classify_warning([]))

    def test_below_warn_threshold(self):
        recs = [{"kind": "date_slot", "tie_ratio": 0.1} for _ in range(5)]
        self.assertIsNone(classify_warning(recs))

    def test_pre_warn_new1(self):
        recs = [{"kind": "date_slot", "tie_ratio": 0.3} for _ in range(5)]
        self.assertEqual(classify_warning(recs), "DW-168-PRE-WARN-NEW1")

    def test_blocking(self):
        recs = [{"kind": "date_slot", "tie_ratio": 0.6} for _ in range(5)]
        self.assertEqual(classify_warning(recs), "DW-205-BLOCKING")


if __name__ == "__main__":
    unittest.main()