ALTER TABLE public.overshoot_lots
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.overshoot_lots.metadata IS
  'Free-form jsonb stamped at INSERT time by entry engines. L-01 (charter): {"limit_arm":"A"|"B","limit_slippage_bps":N}. Additive-only; readers must tolerate missing keys.';