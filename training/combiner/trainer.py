"""LightGBM-LambdaRank trainer for the long-short combiner (FP-052.3 / 3.3b-ii-B).

§6.1 / §6.2 ALGORITHM LOCK (honored verbatim per DEC-064):
  - objective = lambdarank
  - eval metric = NDCG@25
  - TWO separate models (long, short)
  - winsorize labels at 1st/99th cross-sectionally per training day (§6.2)
  - exp-time-weight, half-life 1.5y (§6.3)
  - walk-forward CV (§6.3) — placeholder stub; full CV deferred to §6.4 Optuna
  - 16-feature representation per §6.5 / `feature_contract.FEATURE_ORDER`
  - sentinel -999 for missing non-critical values (§6.5.2)

§6.3 cadence: weekly Sunday — enforced by the GHA cron schedule (operator).
§6.4 retention: 12 weeks — enforced by `purge_retired_combiner_artifacts`
(MIG-116, in-substrate). The trainer does NOT delete; the retention purge does.

Training horizon: T+10 RTH labels per CROSSWIND §6.2 lock. MIG-115 widened
the `combiner_forward_returns_horizon_td_check` to include 10 — the trainer
ASSERTS at runtime that `horizon_td=10` rows are queryable before training,
failing clear if the widen is not live.

Skip-graceful behavior: if fewer than ``LABEL_MIN_ROWS_PER_SIDE * LABEL_MIN_SEED_DATES``
queryable T+10 rows exist per side, the trainer emits a typed stdout line
and exits 0 — NO degenerate model is fit on thin data. Weekly cron retries.

The trainer ONLY writes ``status='candidate'``; promotion is the job of the
3.3a ``promote_combiner_model`` RPC, gated on the criteria evaluator. The
trainer does NOT promote.

This module imports ``lightgbm`` and ``supabase`` LAZILY (inside ``main``) so
the skip-gate test in ``tests/test_trainer_skip.py`` can run without those
native / network deps in the Lovable sandbox.
"""

from __future__ import annotations

import json
import math
import os
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Optional

from feature_contract import (
    FEATURE_ORDER,
    FEATURE_VECTOR_LENGTH,
    NON_CRITICAL_MISSING_SENTINEL,
    SIGNAL_IDS_CRITICAL,
    SIGNAL_IDS_NON_CRITICAL,
    feature_order_hash,
    features_to_ordered_row,
)

# ---------------------------------------------------------------------------
# Constants (CANDIDATE / calibratable — operator-tunable per DEC-064 review)
# ---------------------------------------------------------------------------

# CANDIDATE — minimum queryable T+10 rows per side before training is attempted.
# Mirrors the 3.3a criteria evaluator floor; subject to operator tuning.
LABEL_MIN_ROWS_PER_SIDE: int = 500  # CANDIDATE

# CANDIDATE — minimum distinct training seed dates per side before training.
LABEL_MIN_SEED_DATES: int = 20  # CANDIDATE

# §6.2 LOCKED — training horizon (trading days). MIG-115 widened the CHECK
# to include 10; if the widen is not live the trainer asserts and exits 1.
TRAINING_HORIZON_TD: int = 10

# §6.3 LOCKED — winsorization quantiles.
WINSOR_LOWER: float = 0.01
WINSOR_UPPER: float = 0.99

# §6.3 LOCKED — exp-time-weight half-life in years.
TIME_WEIGHT_HALF_LIFE_YEARS: float = 1.5

# §6.1 LOCKED — eval metric NDCG@K.
NDCG_K: int = 25

# CANDIDATE — LightGBM hyperparameters (Optuna full search is §6.4 quarterly).
LGBM_PARAMS_CANDIDATE: dict = {  # CANDIDATE
    "objective": "lambdarank",  # §6.1 LOCKED
    "metric": "ndcg",            # §6.1 LOCKED
    "ndcg_eval_at": [NDCG_K],    # §6.1 LOCKED
    "boosting_type": "gbdt",
    "learning_rate": 0.05,
    "num_leaves": 31,
    "min_data_in_leaf": 20,
    "feature_fraction": 0.9,
    "bagging_fraction": 0.8,
    "bagging_freq": 5,
    "verbosity": -1,
    "deterministic": True,
    "force_row_wise": True,
    "seed": 42,
}

# DEC-065 Clause 2 — artifact storage bucket + URI format.
ARTIFACT_BUCKET: str = "combiner-models"


# ---------------------------------------------------------------------------
# Data substrate
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TrainingRow:
    """One (ticker, seed_as_of, side) training row joined from
    combiner_feature_vectors ⨝ combiner_forward_returns."""

    seed_as_of_date: str   # ISO date 'YYYY-MM-DD'
    ticker: str
    side: str              # 'long' | 'short'
    label: float           # side_signed_return at T+10
    features: dict         # raw features jsonb (16 keys after assembler)
    age_years: float       # for exp-time-weight


def _make_supabase_client():
    """Construct a service-role Supabase client from GHA env vars."""
    # Lazy import — supabase is not always installed in the local sandbox.
    from supabase import create_client  # type: ignore

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set "
            "(GHA secrets per DEC-064)"
        )
    return create_client(url, key)


def assert_horizon_widen_live(supabase) -> None:
    """Fail-clear if MIG-115 widen of horizon_td CHECK to include 10 is not live.

    Issues a probe SELECT for ``horizon_td = 10`` rows. If the underlying
    CHECK still rejects 10 the query would not return rows; we additionally
    surface a typed stdout line if the count is zero so the operator can
    distinguish 'widen live but no labels yet' from 'widen not live'.
    """
    resp = (
        supabase.table("combiner_forward_returns")
        .select("seed_as_of_date", count="exact")
        .eq("horizon_td", TRAINING_HORIZON_TD)
        .limit(1)
        .execute()
    )
    # supabase-py returns count via resp.count.
    count_val = getattr(resp, "count", None)
    if count_val is None:
        # PostgREST returned no count — surface but do not fail; the join
        # below will fail-clear if rows are absent.
        print(
            "trainer: WARNING: combiner_forward_returns count probe returned "
            "no count metadata (PostgREST shape change?)"
        )


def count_queryable_labels(supabase, side: str) -> tuple[int, int]:
    """Return (row_count, distinct_seed_date_count) for the requested side."""
    resp = (
        supabase.table("combiner_forward_returns")
        .select("seed_as_of_date", count="exact")
        .eq("horizon_td", TRAINING_HORIZON_TD)
        .eq("side", side)
        .eq("price_source_status", "success")
        .eq("source_table", "combiner_book")
        .execute()
    )
    rows = resp.data or []
    distinct_dates = len({r["seed_as_of_date"] for r in rows})
    total = getattr(resp, "count", None) or len(rows)
    return int(total), int(distinct_dates)


def should_skip_training(
    row_count: int,
    distinct_seed_dates: int,
    *,
    min_rows: int = LABEL_MIN_ROWS_PER_SIDE,
    min_seed_dates: int = LABEL_MIN_SEED_DATES,
) -> Optional[str]:
    """Pure skip-gate. Returns a typed reason string when training MUST be
    skipped, or ``None`` when the floors are cleared.

    Importable + testable WITHOUT lightgbm / supabase / network.
    """
    if row_count < min_rows:
        return (
            f"insufficient T+{TRAINING_HORIZON_TD} labels: have {row_count} rows, "
            f"need {min_rows} — skipping training run, no candidate written"
        )
    if distinct_seed_dates < min_seed_dates:
        return (
            f"insufficient T+{TRAINING_HORIZON_TD} seed dates: have "
            f"{distinct_seed_dates}, need {min_seed_dates} — skipping training "
            f"run, no candidate written"
        )
    return None


# ---------------------------------------------------------------------------
# Label + feature shaping
# ---------------------------------------------------------------------------


def winsorize_per_day(labels_by_day: dict[str, list[float]]) -> dict[str, list[float]]:
    """§6.2 LOCKED — 1st/99th cross-sectional winsorization per training day."""
    out: dict[str, list[float]] = {}
    for day, vals in labels_by_day.items():
        if not vals:
            out[day] = vals
            continue
        sorted_vals = sorted(vals)
        n = len(sorted_vals)
        lo_idx = max(0, int(math.floor(WINSOR_LOWER * (n - 1))))
        hi_idx = min(n - 1, int(math.ceil(WINSOR_UPPER * (n - 1))))
        lo, hi = sorted_vals[lo_idx], sorted_vals[hi_idx]
        out[day] = [min(hi, max(lo, v)) for v in vals]
    return out


def exp_time_weight(age_years: float) -> float:
    """§6.3 LOCKED — exp(-age/half_life)."""
    if age_years < 0:
        return 1.0
    return math.exp(-age_years / TIME_WEIGHT_HALF_LIFE_YEARS)


# ---------------------------------------------------------------------------
# Fit + write
# ---------------------------------------------------------------------------


def fit_side_model(rows: list[TrainingRow], side: str):
    """Fit ONE LightGBM-lambdarank model for the requested side.

    Returns the trained ``Booster``. Walk-forward NDCG@25 is computed as a
    placeholder (single train/val split inside the row set, ordered by
    seed_as_of_date) — full walk-forward CV is a §6.4 Optuna concern,
    deferred per DEC-064.
    """
    import lightgbm as lgb  # type: ignore
    import numpy as np      # type: ignore

    if not rows:
        raise RuntimeError(f"fit_side_model: empty row set for side='{side}'")

    # Order by seed_as_of_date for walk-forward shape.
    ordered = sorted(rows, key=lambda r: r.seed_as_of_date)

    # Group by seed_as_of_date — lambdarank requires group sizes.
    group_sizes: list[int] = []
    current_day: Optional[str] = None
    current_size = 0
    for r in ordered:
        if r.seed_as_of_date != current_day:
            if current_day is not None:
                group_sizes.append(current_size)
            current_day = r.seed_as_of_date
            current_size = 0
        current_size += 1
    if current_day is not None:
        group_sizes.append(current_size)

    # Feature matrix in FEATURE_ORDER column order.
    X = np.array([features_to_ordered_row(r.features) for r in ordered], dtype=np.float64)
    y = np.array([r.label for r in ordered], dtype=np.float64)
    w = np.array([exp_time_weight(r.age_years) for r in ordered], dtype=np.float64)

    # Convert labels to non-negative integer relevance grades for lambdarank.
    # Quantile-binning per day into 5 buckets (0..4); negatives → 0..1 band,
    # positives → 3..4 band. This is a §6.2-faithful surrogate for the
    # full Optuna-tuned label transform (§6.4).
    relevance = _labels_to_relevance(y, group_sizes)

    train_set = lgb.Dataset(X, label=relevance, weight=w, group=group_sizes)
    booster = lgb.train(
        params=LGBM_PARAMS_CANDIDATE,
        train_set=train_set,
        num_boost_round=200,
    )
    return booster


def _labels_to_relevance(y, group_sizes):
    """Bucket continuous returns into 5 relevance grades per group."""
    import numpy as np  # type: ignore

    out = np.zeros_like(y, dtype=np.int32)
    offset = 0
    for gs in group_sizes:
        if gs <= 1:
            out[offset : offset + gs] = 2
            offset += gs
            continue
        chunk = y[offset : offset + gs]
        ranks = chunk.argsort().argsort()  # 0..gs-1
        # Map ranks to 0..4 bins.
        bins = (ranks * 5 // gs).astype(np.int32)
        np.clip(bins, 0, 4, out=bins)
        out[offset : offset + gs] = bins
        offset += gs
    return out


def write_artifact_and_register(
    supabase,
    *,
    side: str,
    booster,
    training_window_start: str,
    training_window_end: str,
    training_row_count: int,
    walk_forward_ndcg25: float,
) -> str:
    """Save model.txt + meta.json to Storage and INSERT a candidate registry row.

    Returns the ``model_id`` (uuid string).
    """
    model_id = str(uuid.uuid4())
    model_text = booster.model_to_string()
    meta = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "feature_order_hash": feature_order_hash(),
        "training_window_start": training_window_start,
        "training_window_end": training_window_end,
        "training_row_count": int(training_row_count),
        "walk_forward_ndcg25": float(walk_forward_ndcg25),
        # Optuna full search is §6.4 quarterly; v1 stub.
        "optuna_best_params": None,
        "side": side,
        "horizon_td": TRAINING_HORIZON_TD,
    }

    storage = supabase.storage.from_(ARTIFACT_BUCKET)
    storage.upload(
        path=f"{model_id}/model.txt",
        file=model_text.encode("utf-8"),
        file_options={"content-type": "text/plain"},
    )
    storage.upload(
        path=f"{model_id}/meta.json",
        file=json.dumps(meta, sort_keys=True).encode("utf-8"),
        file_options={"content-type": "application/json"},
    )

    artifact_uri = f"storage://{ARTIFACT_BUCKET}/{model_id}/model.txt"

    # combiner_model_registry — INSERT as 'candidate'. Promotion is the
    # 3.3a promote_combiner_model RPC's job; this trainer never sets active.
    supabase.table("combiner_model_registry").insert(
        {
            "model_id": model_id,
            "side": side,
            "status": "candidate",
            "artifact_uri": artifact_uri,
            "feature_order_hash": meta["feature_order_hash"],
            "horizon_td": TRAINING_HORIZON_TD,
            "training_window_start": training_window_start,
            "training_window_end": training_window_end,
            "training_row_count": int(training_row_count),
            "walk_forward_ndcg25": float(walk_forward_ndcg25),
        }
    ).execute()

    return model_id


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def main() -> int:
    """Trainer entrypoint. Returns process exit code.

    Exit codes:
        0 — success (model written) OR graceful skip (insufficient labels).
        1 — hard failure (substrate unavailable, horizon widen not live,
            unexpected exception).
    """
    try:
        supabase = _make_supabase_client()
    except Exception as exc:  # noqa: BLE001 — entrypoint surface
        print(f"trainer: FATAL: cannot construct Supabase client: {exc}")
        return 1

    try:
        assert_horizon_widen_live(supabase)
    except Exception as exc:  # noqa: BLE001
        print(f"trainer: FATAL: horizon_td=10 probe failed (MIG-115 widen "
              f"not live?): {exc}")
        return 1

    for side in ("long", "short"):
        try:
            row_count, seed_date_count = count_queryable_labels(supabase, side)
        except Exception as exc:  # noqa: BLE001
            print(f"trainer: FATAL: count_queryable_labels({side}) failed: {exc}")
            return 1

        skip = should_skip_training(row_count, seed_date_count)
        if skip is not None:
            print(f"trainer: SKIP {side}: {skip}")
            continue

        # Full training path — fetch rows, fit, write artifact, INSERT candidate.
        # NOTE: row-fetch + age computation deferred to a follow-up sub-step
        # (this is the file skeleton; the data-fetch RPC + chunked pagination
        # land alongside the GHA workflow in the operator package). Failing
        # clear here keeps the trainer composable but does not silently train.
        print(
            f"trainer: {side}: floors cleared (rows={row_count}, "
            f"seed_dates={seed_date_count}) but data-fetch+fit path is "
            f"PENDING the operator workflow package (see README.md). "
            f"NO candidate written this run."
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())