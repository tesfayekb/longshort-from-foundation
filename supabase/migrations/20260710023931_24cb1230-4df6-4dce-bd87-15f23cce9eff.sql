
-- ACT-497 H2 — alerting infrastructure for overshoot strategy (retry with owner_module).

-- (1) CREATE TABLE
CREATE TABLE IF NOT EXISTS public.overshoot_alert_dispatch (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_kind    text NOT NULL,
  severity        text NOT NULL CHECK (severity IN ('CRITICAL','HIGH','INFO')),
  source_table    text NOT NULL,
  source_row_id   text NOT NULL,
  channel         text NOT NULL DEFAULT 'resend_email',
  recipient       text NOT NULL,
  subject         text NOT NULL,
  body_preview    text,
  outcome         text NOT NULL CHECK (outcome IN ('dispatched','failed','skipped_idempotent')),
  provider_message_id text,
  error_message   text,
  correlation_id  text NOT NULL,
  dispatched_at   timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS overshoot_alert_dispatch_idem_uk
  ON public.overshoot_alert_dispatch (trigger_kind, source_table, source_row_id)
  WHERE outcome = 'dispatched';

CREATE INDEX IF NOT EXISTS overshoot_alert_dispatch_dispatched_at_idx
  ON public.overshoot_alert_dispatch (dispatched_at DESC);

CREATE INDEX IF NOT EXISTS overshoot_alert_dispatch_severity_idx
  ON public.overshoot_alert_dispatch (severity, dispatched_at DESC);

GRANT SELECT ON public.overshoot_alert_dispatch TO authenticated;
GRANT ALL    ON public.overshoot_alert_dispatch TO service_role;

ALTER TABLE public.overshoot_alert_dispatch ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overshoot_alert_dispatch_read_view_perm"
  ON public.overshoot_alert_dispatch
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'overshoot.view')
    OR public.is_superadmin(auth.uid())
  );

-- (5) job_registry seed — DISARMED, owner_module='overshoot'.
INSERT INTO public.job_registry (
  id, owner_module, description, schedule, enabled, status, created_at, updated_at
)
VALUES (
  'overshoot.alerts.dispatcher',
  'overshoot',
  'ACT-497 H2 — Overshoot alerts dispatcher: watchdog (cron overdue detection), digest, and audit-tail scan for missed CRITICAL/HIGH events. Every 5 minutes.',
  '*/5 * * * *',
  false,
  'registered',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
