"""Unit tests for the DW-168 S1b group-cardinality probe (FP-066 WAVE-1)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent))

from scripts.dw168_probes.group_cardinality import (  # noqa: E402
    aggregate_rows,
    classify_warning,
    summarize_sizes,
)


class TestSummarizeSizes(unittest.TestCase):
    def test_empty(self):
        s = summarize_sizes([])
        self.assertEqual(s["groups"], 0)

    def test_bins(self):
        s = summarize_sizes([5, 12, 30, 80, 200, 500])
        self.assertEqual(s["histogram"]["<10"], 1)
        self.assertEqual(s["histogram"]["10-25"], 1)
        self.assertEqual(s["histogram"]["25-50"], 1)
        self.assertEqual(s["histogram"]["50-100"], 1)
        self.assertEqual(s["histogram"]["100-250"], 1)
        self.assertEqual(s["histogram"][">=250"], 1)

    def test_below_cutoff_fraction(self):
        s = summarize_sizes([1, 2, 30])
        self.assertAlmostEqual(s["frac_below_ndcg_cutoff"], 2 / 3)


class TestAggregateAndWarn(unittest.TestCase):
    def test_field_set_present(self):
        rows = [
            {"seed_as_of_date": "2026-06-29", "intraday_slot": 0, "side_signed_return": 0.1},
            {"seed_as_of_date": "2026-06-29", "intraday_slot": 1, "side_signed_return": 0.2},
        ]
        s = aggregate_rows(rows)
        for key in ("date_grouping", "date_slot_grouping"):
            self.assertIn(key, s)
            for f in ("groups", "min", "median", "max", "histogram", "frac_below_ndcg_cutoff"):
                self.assertIn(f, s[key])

    def test_warn_triggers_when_slot_groups_tiny(self):
        rows = []
        for d in range(5):
            for slot in range(5):
                for _ in range(3):
                    rows.append({"seed_as_of_date": f"2026-06-2{d}",
                                 "intraday_slot": slot,
                                 "side_signed_return": 0.01})
        s = aggregate_rows(rows)
        self.assertEqual(classify_warning(s), "DW-168-PRE-WARN-CARDINALITY")

    def test_no_warn_when_slot_groups_big(self):
        rows = []
        for d in range(3):
            for slot in range(2):
                for i in range(50):
                    rows.append({"seed_as_of_date": f"2026-06-2{d}",
                                 "intraday_slot": slot,
                                 "side_signed_return": 0.01 * i})
        s = aggregate_rows(rows)
        self.assertIsNone(classify_warning(s))


if __name__ == "__main__":
    unittest.main()