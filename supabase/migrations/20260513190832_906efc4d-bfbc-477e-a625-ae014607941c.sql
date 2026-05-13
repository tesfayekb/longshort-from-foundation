CREATE TABLE IF NOT EXISTS public.system_health_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy')),
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_health_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monitoring_view_select" ON public.system_health_snapshots;
CREATE POLICY "monitoring_view_select"
  ON public.system_health_snapshots
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'monitoring.view'));

CREATE INDEX IF NOT EXISTS idx_system_health_snapshots_created_at
  ON public.system_health_snapshots(created_at DESC);

COMMENT ON TABLE public.system_health_snapshots IS 'Periodic health check snapshots for system monitoring (Stage 5A)';