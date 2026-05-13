-- system_config
CREATE TABLE IF NOT EXISTS public.system_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_by  UUID,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read system config" ON public.system_config;
CREATE POLICY "Authenticated users can read system config"
  ON public.system_config FOR SELECT TO authenticated USING (true);

INSERT INTO public.system_config (key, value, description) VALUES
  ('onboarding_mode', '{"signup_enabled": true, "invite_enabled": true}',
   'Controls user onboarding pathways. At least one must be true at all times.')
ON CONFLICT (key) DO NOTHING;

-- invitations
CREATE TABLE IF NOT EXISTS public.invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL,
  token_hash      TEXT NOT NULL UNIQUE,
  role_id         UUID REFERENCES public.roles(id) ON DELETE SET NULL,
  invited_by      UUID NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '72 hours'),
  accepted_at     TIMESTAMPTZ,
  accepted_by     UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_email_pending
  ON public.invitations(email) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash ON public.invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_expires_at ON public.invitations(expires_at);

-- Foreign keys to auth.users
DO $$ BEGIN
  ALTER TABLE public.invitations
    ADD CONSTRAINT invitations_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.invitations
    ADD CONSTRAINT invitations_accepted_by_fkey
    FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.system_config
    ADD CONSTRAINT system_config_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Validation trigger
CREATE OR REPLACE FUNCTION public.validate_invitation_status()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'accepted', 'expired', 'revoked') THEN
    RAISE EXCEPTION 'Invalid invitation status: %. Must be pending, accepted, expired, or revoked.', NEW.status;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS validate_invitation_status_trigger ON public.invitations;
CREATE TRIGGER validate_invitation_status_trigger
  BEFORE INSERT OR UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.validate_invitation_status();

-- Updated handle_new_user_role with invitation acceptance + first-superadmin bootstrap
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _user_role_id UUID;
  _superadmin_role_id UUID;
  _superadmin_count INTEGER;
  _invitation_id UUID;
  _invited_role_id UUID;
BEGIN
  SELECT id INTO _user_role_id FROM public.roles WHERE key = 'user';
  IF _user_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, _user_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  _invitation_id := (NEW.raw_user_meta_data->>'invitation_id')::UUID;

  IF _invitation_id IS NOT NULL THEN
    SELECT role_id INTO _invited_role_id
    FROM public.invitations
    WHERE id = _invitation_id AND status = 'pending';

    IF _invited_role_id IS NOT NULL AND _invited_role_id != _user_role_id THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, _invited_role_id)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;

    UPDATE public.invitations
    SET status = 'accepted', accepted_at = now(), accepted_by = NEW.id
    WHERE id = _invitation_id AND status = 'pending';

    INSERT INTO public.audit_logs (action, actor_id, target_type, target_id, metadata)
    VALUES ('user.invitation_accepted', NEW.id, 'invitations', _invitation_id,
      jsonb_build_object('email', NEW.email, 'invited_role_id', _invited_role_id));
  END IF;

  PERFORM pg_advisory_xact_lock(42);

  SELECT COUNT(*) INTO _superadmin_count
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE r.key = 'superadmin';

  IF _superadmin_count = 0 THEN
    SELECT id INTO _superadmin_role_id FROM public.roles WHERE key = 'superadmin';
    IF _superadmin_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, _superadmin_role_id)
      ON CONFLICT (user_id, role_id) DO NOTHING;

      INSERT INTO public.audit_logs (action, actor_id, target_type, target_id, metadata)
      VALUES ('rbac.first_superadmin_bootstrapped', NEW.id, 'user_roles', NEW.id,
        jsonb_build_object('role_key', 'superadmin',
          'bootstrap_reason', 'First user signup — no existing superadmin'));
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- New permissions
INSERT INTO public.permissions (key, description) VALUES
  ('users.invite', 'Send individual or bulk user invitations'),
  ('users.invite.manage', 'View, revoke, and resend existing invitations')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.key = 'admin'
  AND p.key IN ('users.invite', 'users.invite.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;