-- MIG-132 — DW-162a (Squeeze Protection Component 3a)
-- OOB operator migration (parallel to MIG-131 DTC sibling table).
--
-- Persistence for the easy_to_borrow transition monitor. Idempotent on
-- (operator_id, symbol, observed_at) — a repeated tick at the same ts is a
-- PK no-op (replay-deterministic per DEC-034 cl.4). Long-term ledger of
-- broker-emitted ETB state for HELD shorts; cheap.
--
-- The numeric annual_rate_pct is intentionally absent — Alpaca paper does
-- NOT expose one. The full rate-magnitude monitor is vendor-gated under
-- DW-162b / DW-166 (see deferred-work-register.md).

create table if not exists public.short_etb_state_history (
  operator_id   uuid        not null,
  symbol        text        not null,
  observed_at   timestamptz not null,
  etb           boolean     not null,
  source        text        not null default 'alpaca_shortability',
  recorded_at   timestamptz not null default now(),
  primary key (operator_id, symbol, observed_at)
);

create index if not exists short_etb_state_history_symbol_observed_at_idx
  on public.short_etb_state_history (operator_id, symbol, observed_at desc);

alter table public.short_etb_state_history enable row level security;

drop policy if exists short_etb_state_history_service_role_all
  on public.short_etb_state_history;
create policy short_etb_state_history_service_role_all
  on public.short_etb_state_history
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.short_etb_state_history is
  'DW-162a (MIG-132): per-tick easy_to_borrow observations for HELD shorts. Source of the short_etb_lost transition warning. Boolean broker state only — no fabricated numeric rate (§9 SENTINEL).';