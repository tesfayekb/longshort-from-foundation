"""Cross-language CI assert: Python FEATURE_ORDER == TS FEATURE_ORDER.

DEC-064 Clause 4 enforcement. Two definitions of FEATURE_ORDER live in
the repo:

  - TS: `supabase/functions/_shared/longshort-combiner/lgbm-inference.ts`
        (consumed by the in-substrate inference seam)
  - PY: `training/combiner/feature_contract.py`
        (consumed by the Python trainer)

They MUST stay element-for-element identical, AND their SHA-256 hashes
over `'\\n'.join(FEATURE_ORDER)` MUST match — otherwise the in-substrate
`model-artifact-loader.ts` will refuse every artifact the trainer
produces (FeatureOrderHashMismatchError, mal-4).

This script extracts the TS FEATURE_ORDER by static parse of the TS
source (no Deno runtime needed) and compares to the Python module.

Usage (from repo root or anywhere):
    python training/combiner/scripts/assert_feature_order_parity.py

Exit codes:
    0 — both lists equal, both hashes equal.
    1 — drift detected; stdout names the divergent element(s).

Wire-in: the GHA workflow runs this script before invoking the trainer;
the existing Deno strong-evidence gate may also call it (operator
package — this file is the assert itself, NOT the workflow).
"""

from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
# training/combiner/scripts → training/combiner → training → <repo root>
REPO_ROOT = THIS_DIR.parent.parent.parent

sys.path.insert(0, str(THIS_DIR.parent))

from feature_contract import FEATURE_ORDER as PY_FEATURE_ORDER  # noqa: E402
from feature_contract import (  # noqa: E402
    MARKET_REGIME_FEATURE_KEYS as PY_MARKET_REGIME_FEATURE_KEYS,
    SIGNAL_IDS_CRITICAL as PY_SIGNAL_IDS_CRITICAL,
    SIGNAL_IDS_NON_CRITICAL as PY_SIGNAL_IDS_NON_CRITICAL,
    feature_order_hash as py_feature_order_hash,
)

TS_CATALOG_PATH = (
    REPO_ROOT
    / "supabase"
    / "functions"
    / "_shared"
    / "longshort-combiner"
    / "signal-catalog.ts"
)
TS_INFERENCE_PATH = (
    REPO_ROOT
    / "supabase"
    / "functions"
    / "_shared"
    / "longshort-combiner"
    / "lgbm-inference.ts"
)
TS_REGIME_PATH = (
    REPO_ROOT
    / "supabase"
    / "functions"
    / "_shared"
    / "longshort-signals"
    / "market-regime"
    / "compute-regime.ts"
)


def _extract_array(ts_src: str, name: str) -> list[str]:
    """Extract a `export const NAME = [ ... ] as const` string array from TS."""
    pattern = re.compile(
        r"export\s+const\s+" + re.escape(name) + r"\s*=\s*\[(.*?)\]\s*as\s+const\s*;",
        re.DOTALL,
    )
    m = pattern.search(ts_src)
    if not m:
        raise SystemExit(
            f"assert_feature_order_parity: cannot locate `export const {name}` in TS source"
        )
    body = m.group(1)
    # Strip line comments.
    body = re.sub(r"//[^\n]*", "", body)
    return [s for s in re.findall(r"'([^']+)'", body)]


def _extract_const_string(ts_src: str, name: str) -> str:
    """Extract `export const NAME = 'literal';` from TS."""
    pattern = re.compile(
        r"export\s+const\s+" + re.escape(name) + r"\s*=\s*'([^']+)'\s*;",
    )
    m = pattern.search(ts_src)
    if not m:
        raise SystemExit(
            f"assert_feature_order_parity: cannot locate `export const {name}` in TS source"
        )
    return m.group(1)


def _ts_feature_order() -> list[str]:
    """Reconstruct the TS FEATURE_ORDER without executing the TS source.

    Mirrors the TS expression:
        FEATURE_ORDER = [
          ...SIGNAL_IDS_CRITICAL,
          ...SIGNAL_IDS_NON_CRITICAL.flatMap(id => [`${id}__value`, `${id}__is_present`])
        ]
    by reading SIGNAL_IDS_CRITICAL + SIGNAL_IDS_NON_CRITICAL from
    signal-catalog.ts and stitching the same way.

    Cross-check: `lgbm-inference.ts` must still IMPORT both arrays + use
    the same construction; a separate substring check asserts that.
    """
    catalog_src = TS_CATALOG_PATH.read_text(encoding="utf-8")
    crit = _extract_array(catalog_src, "SIGNAL_IDS_CRITICAL")
    nc = _extract_array(catalog_src, "SIGNAL_IDS_NON_CRITICAL")

    regime_src = TS_REGIME_PATH.read_text(encoding="utf-8")
    market_keys = [
        _extract_const_string(regime_src, "MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID"),
        _extract_const_string(regime_src, "MARKET_REALIZED_VOL_6M_SIGNAL_ID"),
    ]

    inference_src = TS_INFERENCE_PATH.read_text(encoding="utf-8")
    for required in (
        "SIGNAL_IDS_CRITICAL",
        "SIGNAL_IDS_NON_CRITICAL",
        "nonCriticalValueKey",
        "nonCriticalIsPresentKey",
        "MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID",
        "MARKET_REALIZED_VOL_6M_SIGNAL_ID",
        "FEATURE_ORDER",
    ):
        if required not in inference_src:
            raise SystemExit(
                f"assert_feature_order_parity: TS lgbm-inference.ts no longer "
                f"references `{required}` — FEATURE_ORDER construction drifted"
            )

    order: list[str] = list(crit)
    for ncid in nc:
        order.append(f"{ncid}__value")
        order.append(f"{ncid}__is_present")
    order.extend(market_keys)
    return order


def main() -> int:
    ts_order = _ts_feature_order()

    # Catalog parity — the two source-of-truth arrays must match.
    catalog_src = TS_CATALOG_PATH.read_text(encoding="utf-8")
    ts_crit = _extract_array(catalog_src, "SIGNAL_IDS_CRITICAL")
    ts_nc = _extract_array(catalog_src, "SIGNAL_IDS_NON_CRITICAL")
    if tuple(ts_crit) != PY_SIGNAL_IDS_CRITICAL:
        print(
            f"FAIL: SIGNAL_IDS_CRITICAL drift: TS={ts_crit} PY={list(PY_SIGNAL_IDS_CRITICAL)}"
        )
        return 1
    if tuple(ts_nc) != PY_SIGNAL_IDS_NON_CRITICAL:
        print(
            f"FAIL: SIGNAL_IDS_NON_CRITICAL drift: TS={ts_nc} PY={list(PY_SIGNAL_IDS_NON_CRITICAL)}"
        )
        return 1

    # Market-level regime key parity (DEC-066 §(c), 3.2-d).
    regime_src = TS_REGIME_PATH.read_text(encoding="utf-8")
    ts_market = (
        _extract_const_string(regime_src, "MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID"),
        _extract_const_string(regime_src, "MARKET_REALIZED_VOL_6M_SIGNAL_ID"),
    )
    if ts_market != PY_MARKET_REGIME_FEATURE_KEYS:
        print(
            f"FAIL: MARKET_REGIME_FEATURE_KEYS drift: TS={list(ts_market)} "
            f"PY={list(PY_MARKET_REGIME_FEATURE_KEYS)}"
        )
        return 1

    # FEATURE_ORDER parity.
    py_order = list(PY_FEATURE_ORDER)
    if ts_order != py_order:
        print("FAIL: FEATURE_ORDER drift")
        print(f"  TS ({len(ts_order)}): {ts_order}")
        print(f"  PY ({len(py_order)}): {py_order}")
        # Surface the first divergent index.
        for i, (a, b) in enumerate(zip(ts_order, py_order)):
            if a != b:
                print(f"  first divergence at index {i}: TS={a!r} PY={b!r}")
                break
        return 1

    # Hash parity.
    canonical = "\n".join(ts_order).encode("utf-8")
    ts_hash = hashlib.sha256(canonical).hexdigest()
    py_hash = py_feature_order_hash()
    if ts_hash != py_hash:
        print(f"FAIL: feature_order_hash drift: TS={ts_hash} PY={py_hash}")
        return 1

    print(
        f"OK: FEATURE_ORDER parity ({len(ts_order)} keys) + "
        f"feature_order_hash={py_hash}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())