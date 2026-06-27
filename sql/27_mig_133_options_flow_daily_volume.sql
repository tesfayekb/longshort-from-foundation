-- MIG-133 — FP-057 Sub-step 4c (DW-167 charter parallel)
-- OOB operator migration.
--
-- Sidecar volume store for the options-flow dynamic-subset resolver.
-- The adapter persists `total_options_volume` (the day's contract-volume
-- aggregate, currently DISCARDED post-compute) here on every value-
-- producing per-ticker compute. The intraday-subset resolver reads the
-- PRIOR trading-day's top-N from this table to seed the base tier.
--
-- Wall-clock discipline (DEC-034 cl.4): the adapter writes `computed_at`
-- from the injected `asOf` timestamp — NEVER `new Date()` / `now()` at
-- this layer. The optional `default now()` is for ops-side INSERTs only
-- (e.g. backfills); the financial-path writer always supplies it.
--
-- This table NEVER enters the combiner feature vector — it is a SCOPING
-- input (which names to seed at the intraday tier), not an alpha signal.

create table if not exists public.options_flow_daily_volume (
  ticker             text        not null,
  as_of_date         date        not null,
  day_options_volume numeric     not null,
  computed_at        timestamptz not null default now(),
  primary key (ticker, as_of_date)
);

-- Top-N-by-volume read pattern (resolver base tier).
create index if not exists options_flow_daily_volume_date_vol_desc_idx
  on public.options_flow_daily_volume (as_of_date, day_options_volume desc);

alter table public.options_flow_daily_volume enable row level security;

drop policy if exists options_flow_daily_volume_service_role_all
  on public.options_flow_daily_volume;
create policy options_flow_daily_volume_service_role_all
  on public.options_flow_daily_volume
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.options_flow_daily_volume is
  'MIG-133 (FP-057 Sub-step 4c): per (ticker, as_of_date) day options volume sidecar. SCOPING input for the intraday subset resolver — NEVER enters combiner_feature_vectors.features (which would corrupt §4.4.3 signal economics).';