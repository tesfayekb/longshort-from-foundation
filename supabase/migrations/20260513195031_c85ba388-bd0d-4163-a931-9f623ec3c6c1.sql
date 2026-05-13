ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS is_permission_locked BOOLEAN NOT NULL DEFAULT false;

UPDATE public.roles SET is_permission_locked = true WHERE key = 'superadmin';