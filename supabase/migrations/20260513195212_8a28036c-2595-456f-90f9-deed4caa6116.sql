-- system_config: restrict to superadmins only (edge functions use service role and bypass RLS)
DROP POLICY IF EXISTS "Authenticated users can read system config" ON public.system_config;
CREATE POLICY "Superadmins can read system config"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- mfa_recovery_codes: owner-only SELECT (hashes still useless without raw codes, but defense-in-depth)
CREATE POLICY "Users can read own mfa recovery codes"
  ON public.mfa_recovery_codes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- mfa_recovery_attempts: owner-only SELECT
CREATE POLICY "Users can read own mfa recovery attempts"
  ON public.mfa_recovery_attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- invitations: admins (users.invite) or the accepting user
CREATE POLICY "Admins or accepting user can read invitations"
  ON public.invitations FOR SELECT
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'users.invite')
    OR auth.uid() = accepted_by
  );