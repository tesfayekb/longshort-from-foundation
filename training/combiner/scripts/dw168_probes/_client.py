"""Shared service-role Supabase client constructor for the DW-168 probes.

Mirrors trainer.py:_make_supabase_client (DEC-064 GHA env-var contract).
Lazy import so probes' pure compute helpers stay importable in the
Lovable sandbox without the supabase-py native dep.
"""
from __future__ import annotations

import os


def make_service_role_client():
    from supabase import create_client  # type: ignore

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set "
            "(GHA secrets per DEC-064)"
        )
    return create_client(url, key)


# §6.1/§6.2 training horizon — the probes filter to the same horizon the
# trainer trains against, otherwise the tie-ratio / cardinality readings
# are not comparable to the trainer's actual lambdarank pairs.
TRAINING_HORIZON_TD = 10
SOURCE_TABLE_LIVE = "combiner_book"
PRICE_STATUS_OK = "success"