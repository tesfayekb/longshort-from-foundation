"""Unit tests for the DW-168 S1c feature-variation probe (FP-066 WAVE-1).

Fixtures use the live FEATURE_ORDER contract (R4 — raw combiner_*
rows, not a candidate model).
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent))

from feature_contract import (  # noqa: E402
    MARKET_REGIME_FEATURE_KEYS,
    SIGNAL_IDS_CRITICAL,
    SIGNAL_IDS_NON_CRITICAL,
)
from scripts.dw168_probes.feature_variation import (  # noqa: E402
    aggregate_rows,
    classify_warnings,
    pairwise_distances,
)


def _features(crit_a=0.0, crit_b=0.0, mkt_a=0.0, mkt_b=0.0):
    f: dict = {}
    f[SIGNAL_IDS_CRITICAL[0]] = crit_a
    f[SIGNAL_IDS_CRITICAL[1]] = crit_b
    for nc in SIGNAL_IDS_NON_CRITICAL:
        f[f"{nc}__value"] = None
        f[f"{nc}__is_present"] = 0
    f[MARKET_REGIME_FEATURE_KEYS[0]] = mkt_a
    f[MARKET_REGIME_FEATURE_KEYS[1]] = mkt_b
    return f


class TestPairwiseDistances(unittest.TestCase):
    def test_two_identical(self):
        d = pairwise_distances({0: [1.0, 2.0], 1: [1.0, 2.0]})
        self.assertEqual(d, [0.0])

    def test_three_slots(self):
        d = pairwise_distances({0: [0.0, 0.0], 1: [3.0, 4.0], 2: [0.0, 0.0]})
        self.assertEqual(sorted(d), [0.0, 5.0, 5.0])


class TestAggregateRows(unittest.TestCase):
    def test_field_set_present(self):
        rows = [
            {"as_of_date": "2026-06-29", "ticker": "AAPL", "intraday_slot": 0,
             "features": _features()},
            {"as_of_date": "2026-06-29", "ticker": "AAPL", "intraday_slot": 1,
             "features": _features()},
        ]
        s = aggregate_rows(rows)
        for key in ("l2", "variance_ratio", "qualifying_dt_pairs",
                    "recent_dates", "skipped_projection_errors"):
            self.assertIn(key, s)
        for f in ("n_pairs", "min", "median", "p75", "max"):
            self.assertIn(f, s["l2"])

    def test_requires_two_slots(self):
        rows = [
            {"as_of_date": "2026-06-29", "ticker": "AAPL", "intraday_slot": 0,
             "features": _features()},
        ]
        s = aggregate_rows(rows)
        self.assertEqual(s["qualifying_dt_pairs"], 0)

    def test_identical_slots_yield_zero_l2(self):
        rows = []
        for t in ("AAPL", "MSFT"):
            for slot in (0, 1):
                rows.append({"as_of_date": "2026-06-29", "ticker": t,
                             "intraday_slot": slot,
                             "features": _features(crit_a=1.0 if t == "AAPL" else 2.0)})
        s = aggregate_rows(rows)
        self.assertEqual(s["l2"]["median"], 0.0)
        warns = classify_warnings(s)
        self.assertIn("DW-168-PRE-WARN-NEW2", warns)

    def test_distinct_slots_no_warn(self):
        rows = []
        for t_i, t in enumerate(("AAPL", "MSFT", "NVDA")):
            for slot in (0, 1):
                rows.append({
                    "as_of_date": "2026-06-29", "ticker": t,
                    "intraday_slot": slot,
                    "features": _features(crit_a=float(t_i + slot * 10),
                                          crit_b=float(slot)),
                })
        s = aggregate_rows(rows)
        self.assertGreater(s["l2"]["median"], 0.05)
        self.assertNotIn("DW-168-PRE-WARN-NEW2", classify_warnings(s))

    def test_skips_invalid_features(self):
        rows = [
            {"as_of_date": "2026-06-29", "ticker": "AAPL", "intraday_slot": 0,
             "features": {"bogus": 1}},
        ]
        s = aggregate_rows(rows)
        self.assertEqual(s["skipped_projection_errors"], 1)


if __name__ == "__main__":
    unittest.main()