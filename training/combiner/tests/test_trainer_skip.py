"""Skip-gate test for the trainer (FP-052.3 / 3.3b-ii-B).

The trainer MUST exit 0 with a typed stdout reason — and NEVER fit a
model — when T+10 forward-return labels are below the floor. Today
(at authoring) zero T+10 labels exist; the weekly cron will retry as
labels accrue.

Imports `should_skip_training` directly so the test runs without
LightGBM / supabase / network in the Lovable sandbox.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent))

from trainer import (  # noqa: E402
    LABEL_MIN_ROWS_PER_SIDE,
    LABEL_MIN_SEED_DATES,
    TRAINING_HORIZON_TD,
    should_skip_training,
)


class TestSkipGate(unittest.TestCase):
    def test_zero_rows_skips(self):
        reason = should_skip_training(0, 0)
        self.assertIsNotNone(reason)
        self.assertIn(f"T+{TRAINING_HORIZON_TD}", reason)
        self.assertIn("skipping", reason)

    def test_rows_below_floor_skips(self):
        reason = should_skip_training(LABEL_MIN_ROWS_PER_SIDE - 1, 1000)
        self.assertIsNotNone(reason)
        self.assertIn("rows", reason)

    def test_seed_dates_below_floor_skips(self):
        reason = should_skip_training(10 * LABEL_MIN_ROWS_PER_SIDE, LABEL_MIN_SEED_DATES - 1)
        self.assertIsNotNone(reason)
        self.assertIn("seed dates", reason)

    def test_both_floors_cleared_does_not_skip(self):
        reason = should_skip_training(LABEL_MIN_ROWS_PER_SIDE, LABEL_MIN_SEED_DATES)
        self.assertIsNone(reason)

    def test_skip_reason_is_typed_stdout_shape(self):
        # Operator-facing line must include "skipping training run" so log
        # scrapers can distinguish skip from failure.
        reason = should_skip_training(0, 0)
        self.assertIn("skipping training run", reason)
        self.assertIn("no candidate written", reason)


if __name__ == "__main__":
    unittest.main()