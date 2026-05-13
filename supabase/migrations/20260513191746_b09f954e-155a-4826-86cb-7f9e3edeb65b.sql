CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user_id
  ON public.mfa_recovery_codes(user_id);

ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: service-role-only access via edge functions.