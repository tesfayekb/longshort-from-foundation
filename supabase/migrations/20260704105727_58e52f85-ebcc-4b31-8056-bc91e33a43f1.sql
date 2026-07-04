UPDATE public.job_registry SET enabled=false, updated_at=now() WHERE id='overshoot.detection.run';

INSERT INTO public.overshoot_audit_logs (action, target_type, target_id, metadata)
VALUES (
  'job_disarmed',
  'job_registry',
  'overshoot.detection.run',
  jsonb_build_object(
    'reason', 'live_run_zero_selected_investigation',
    'correlation_id_operator', 'w35c-live-postfix-001',
    'run_id', 'ded4213d-0a78-46b5-aab7-393dbd7b4bcd',
    'dry_run', false,
    'event_count', 720,
    'selected_count', 0,
    'refusal_histogram', jsonb_build_object(
      'excess_below_threshold_short', 213,
      'window_out_of_set_long', 199,
      'excess_below_threshold_long', 189,
      'drawdown_out_of_set_short', 63,
      'momentum_out_of_set_short', 40,
      'si_below_squeeze_threshold_short', 11,
      'momentum_out_of_set_long', 5,
      'no_study_cell', 0
    ),
    'bandLabelFor_fix_verdict', 'deployed_but_not_reached',
    'note', 'All 720 candidates refuse at filters 0-5 (pre-study-cell). Zero reach filter 6, so bandLabelFor fix cannot be evidenced on as_of=2026-07-02.'
  )
);