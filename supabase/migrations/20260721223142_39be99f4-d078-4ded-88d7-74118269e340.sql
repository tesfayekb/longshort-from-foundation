ALTER TABLE public.overshoot_detection_runs
  ADD COLUMN IF NOT EXISTS detector_version text,
  ADD COLUMN IF NOT EXISTS refusal_class_counts jsonb;

COMMENT ON COLUMN public.overshoot_detection_runs.detector_version IS
  'ACT-563: compile-time RATIFIED_DETECTOR_VERSION echoed at persist. Complements git_sha (pipeline BUILD_SHA). Two stamps, two truths.';
COMMENT ON COLUMN public.overshoot_detection_runs.refusal_class_counts IS
  'INC-129: jsonb enumerating full RefusalReason union with explicit zeros at persist. Zero-firing classes stay visible.';
