"""Lock the Python FEATURE_ORDER + feature_order_hash to the TS contract.

The hash constant below is the SHA-256 of `'\\n'.join(FEATURE_ORDER)`
computed independently with stdlib hashlib AND verified to equal the TS
`featureOrderHash()` output from `lgbm-inference.ts` at authoring time.
If a future signal-catalog edit changes either side, this test fails
loudly and the cross-language parity script
(`scripts/assert_feature_order_parity.py`) fails alongside it.

Runs in the Lovable sandbox without LightGBM (pure stdlib).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

# Make `feature_contract` importable when the test file is run directly.
THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent))

from feature_contract import (  # noqa: E402
    FEATURE_ORDER,
    FEATURE_VECTOR_LENGTH,
    MARKET_REGIME_FEATURE_KEYS,
    NON_CRITICAL_MISSING_SENTINEL,
    SIGNAL_IDS_CRITICAL,
    SIGNAL_IDS_NON_CRITICAL,
    feature_order_hash,
    features_to_ordered_row,
)


# Computed at authoring with both Python hashlib AND Deno crypto.subtle —
# byte-identical to the TS featureOrderHash() over the same FEATURE_ORDER.
# 3.2-d (DEC-066) flipped the hash from the 16-key value to this 18-key
# value when the 2 market-level keys were appended as bare numerics.
EXPECTED_FEATURE_ORDER_HASH = (
    "d4aac3e3e58740543de51764c05b8688595eb025ec41bd55677c9c27f24ce348"
)


class TestFeatureContract(unittest.TestCase):
    def test_length_is_18(self):
        self.assertEqual(FEATURE_VECTOR_LENGTH, 18)
        self.assertEqual(len(FEATURE_ORDER), 18)

    def test_critical_signals_first_in_catalog_order(self):
        self.assertEqual(FEATURE_ORDER[0], SIGNAL_IDS_CRITICAL[0])
        self.assertEqual(FEATURE_ORDER[1], SIGNAL_IDS_CRITICAL[1])

    def test_non_critical_pairs_in_catalog_order(self):
        for i, ncid in enumerate(SIGNAL_IDS_NON_CRITICAL):
            self.assertEqual(FEATURE_ORDER[2 + 2 * i], f"{ncid}__value")
            self.assertEqual(FEATURE_ORDER[2 + 2 * i + 1], f"{ncid}__is_present")

    def test_market_regime_keys_appended_last_as_bare_numerics(self):
        # DEC-066 §(c): market-level category — bare numerics, NOT
        # (value, is_present) pairs. Appended AFTER the 16-key per-name block.
        self.assertEqual(MARKET_REGIME_FEATURE_KEYS,
                         ("market_24m_cumulative_return", "market_realized_vol_6m"))
        self.assertEqual(FEATURE_ORDER[16], "market_24m_cumulative_return")
        self.assertEqual(FEATURE_ORDER[17], "market_realized_vol_6m")

    def test_feature_order_hash_matches_locked_constant(self):
        # LOAD-BEARING: this hash MUST equal the TS featureOrderHash()
        # output; the in-substrate loader refuses any artifact whose
        # meta.feature_order_hash != this value (DEC-064 Clause 4).
        self.assertEqual(feature_order_hash(), EXPECTED_FEATURE_ORDER_HASH)

    def test_sentinel_substitution_on_absent_non_critical(self):
        features = {sid: 0.0 for sid in SIGNAL_IDS_CRITICAL}
        for ncid in SIGNAL_IDS_NON_CRITICAL:
            features[f"{ncid}__value"] = None
            features[f"{ncid}__is_present"] = 0
        for mkey in MARKET_REGIME_FEATURE_KEYS:
            features[mkey] = 0.0
        row = features_to_ordered_row(features)
        self.assertEqual(len(row), 18)
        for i in range(len(SIGNAL_IDS_NON_CRITICAL)):
            self.assertEqual(row[2 + 2 * i], NON_CRITICAL_MISSING_SENTINEL)
            self.assertEqual(row[2 + 2 * i + 1], 0.0)
        # Market-level bare numerics at the tail (indices 16, 17).
        self.assertEqual(row[16], 0.0)
        self.assertEqual(row[17], 0.0)

    def test_missing_critical_raises(self):
        features = {sid: 0.0 for sid in SIGNAL_IDS_CRITICAL}
        for ncid in SIGNAL_IDS_NON_CRITICAL:
            features[f"{ncid}__value"] = None
            features[f"{ncid}__is_present"] = 0
        for mkey in MARKET_REGIME_FEATURE_KEYS:
            features[mkey] = 0.0
        features[SIGNAL_IDS_CRITICAL[0]] = None
        with self.assertRaises(ValueError):
            features_to_ordered_row(features)

    def test_missing_market_regime_raises(self):
        features = {sid: 0.0 for sid in SIGNAL_IDS_CRITICAL}
        for ncid in SIGNAL_IDS_NON_CRITICAL:
            features[f"{ncid}__value"] = None
            features[f"{ncid}__is_present"] = 0
        # market keys deliberately absent — regime fail-loud upstream should
        # have prevented this, so the contract raises hard.
        with self.assertRaises(ValueError):
            features_to_ordered_row(features)


if __name__ == "__main__":
    unittest.main()