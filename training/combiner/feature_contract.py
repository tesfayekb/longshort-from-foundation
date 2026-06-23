"""Python mirror of the TS FEATURE_ORDER contract (DEC-064 Clause 4).

The in-substrate TS inference seam
(``supabase/functions/_shared/longshort-combiner/lgbm-inference.ts``)
defines ``FEATURE_ORDER`` as an 18-key array and ``featureOrderHash()``
as the SHA-256 hex digest of ``FEATURE_ORDER.join('\\n')``. The
``model-artifact-loader.ts`` REFUSES any artifact whose
``meta.feature_order_hash`` does not match the live hash.

3.2-d (DEC-066) appended the 2 market-level regime keys after the per-name
block as bare numerics, flipping the hash to
``d4aac3e3e58740543de51764c05b8688595eb025ec41bd55677c9c27f24ce348``.

This module replicates that contract byte-for-byte in Python so the
trainer can:

1. Emit feature columns in the IDENTICAL order to the TS scorer.
2. Stamp the SAME ``feature_order_hash`` into ``meta.json`` at training time.

The byte-identity is locked by:
- ``tests/test_feature_contract.py`` (hash equals a hardcoded constant).
- ``scripts/assert_feature_order_parity.py`` (extracts FEATURE_ORDER from
  the TS source and compares to this module's list + hash).

Pure: no I/O, no clock, no randomness. Importable without LightGBM.
"""

from __future__ import annotations

import hashlib
from typing import Final, Tuple

# --- 9-signal catalog -------------------------------------------------------
# Mirror of supabase/functions/_shared/longshort-combiner/signal-catalog.ts.
# Catalog drift is locked at:
#   - the TS side: signal-catalog_test.ts
#   - the cross-language side: scripts/assert_feature_order_parity.py
SIGNAL_IDS_CRITICAL: Final[Tuple[str, ...]] = (
    "cross_sectional_momentum_12_1",
    "short_term_reversal_1w",
)

SIGNAL_IDS_NON_CRITICAL: Final[Tuple[str, ...]] = (
    "analyst_revision_drift",          # Signal #1
    "pead_sue_20d",                    # Signal #2
    "options_flow_imbalance_5d",       # Signal #3
    "insider_transactions_90d",        # Signal #4
    "news_sentiment_7d",               # Signal #5
    "short_interest_change_30d",       # Signal #8
    "active_catalyst_flag",            # Signal #9
)

# Market-level regime keys per DEC-066 §6.5.1.1. Appended AFTER the
# non-critical block as bare numerics (NOT (value, is_present) pairs).
# Must equal the TS literals in
# `supabase/functions/_shared/longshort-signals/market-regime/compute-regime.ts`
# (MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID / MARKET_REALIZED_VOL_6M_SIGNAL_ID);
# `scripts/assert_feature_order_parity.py` reconstructs the TS FEATURE_ORDER
# and rejects any divergence.
MARKET_REGIME_FEATURE_KEYS: Final[Tuple[str, ...]] = (
    "market_24m_cumulative_return",
    "market_realized_vol_6m",
)

# §6.5.2 missing-value sentinel for non-critical signal value slots.
NON_CRITICAL_MISSING_SENTINEL: Final[float] = -999.0


def _non_critical_value_key(signal_id: str) -> str:
    return f"{signal_id}__value"


def _non_critical_is_present_key(signal_id: str) -> str:
    return f"{signal_id}__is_present"


def _build_feature_order() -> Tuple[str, ...]:
    keys: list[str] = []
    keys.extend(SIGNAL_IDS_CRITICAL)
    for ncid in SIGNAL_IDS_NON_CRITICAL:
        keys.append(_non_critical_value_key(ncid))
        keys.append(_non_critical_is_present_key(ncid))
    keys.extend(MARKET_REGIME_FEATURE_KEYS)
    return tuple(keys)


# LOAD-BEARING — must equal lgbm-inference.ts FEATURE_ORDER element-for-element.
FEATURE_ORDER: Final[Tuple[str, ...]] = _build_feature_order()

# Expected vector length — 2 + 7*2 + 2 = 18.
FEATURE_VECTOR_LENGTH: Final[int] = len(FEATURE_ORDER)
assert FEATURE_VECTOR_LENGTH == 18, (
    "FEATURE_ORDER must be exactly 18 keys (2 criticals + 7 non-critical pairs + 2 market-level)"
)


def feature_order_hash() -> str:
    """SHA-256 hex digest of ``'\\n'.join(FEATURE_ORDER)``.

    Byte-identical to the TS ``featureOrderHash()`` in
    ``lgbm-inference.ts``. Lowercase hex, 64 chars. The trainer stamps
    this into ``meta.json``; the in-substrate loader refuses any
    artifact whose stamped hash differs from the live value.
    """
    canonical = "\n".join(FEATURE_ORDER).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def features_to_ordered_row(features: dict) -> list[float]:
    """Project a feature dict onto the ordered 16-element float row.

    Honors §6.5.2 sentinel: non-critical signals with ``is_present == 0``
    resolve to ``value = -999`` regardless of what is stored under the
    ``__value`` key (the assembler stores ``None`` for the absent half;
    the model was trained against the sentinel substitution).

    Raises ``ValueError`` when a critical signal is missing or non-finite
    — the §4.3.5 gate should have excluded such rows upstream.
    """
    import math

    row: list[float] = []

    # 2 critical bare numerics — must be finite.
    for cid in SIGNAL_IDS_CRITICAL:
        v = features.get(cid)
        if v is None or not isinstance(v, (int, float)) or not math.isfinite(float(v)):
            raise ValueError(
                f"critical signal '{cid}' not a finite number (value={v!r}); "
                f"§4.3.5 gates should have excluded this row"
            )
        row.append(float(v))

    # 7 non-critical (value, is_present) pairs.
    for ncid in SIGNAL_IDS_NON_CRITICAL:
        pres_key = _non_critical_is_present_key(ncid)
        val_key = _non_critical_value_key(ncid)
        is_present = 1 if features.get(pres_key) == 1 else 0
        if is_present == 1:
            v = features.get(val_key)
            if v is None or not isinstance(v, (int, float)) or not math.isfinite(float(v)):
                raise ValueError(
                    f"non-critical '{ncid}' is_present=1 but value={v!r} not finite "
                    f"— typed-absence contract broken"
                )
            row.append(float(v))
        else:
            row.append(NON_CRITICAL_MISSING_SENTINEL)
        row.append(float(is_present))

    if len(row) != FEATURE_VECTOR_LENGTH:
        raise ValueError(
            f"features_to_ordered_row produced {len(row)} elements, expected "
            f"{FEATURE_VECTOR_LENGTH}"
        )
    return row