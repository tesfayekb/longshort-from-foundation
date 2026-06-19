export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alert_configs: {
        Row: {
          comparison: string
          cooldown_seconds: number
          created_at: string
          created_by: string
          enabled: boolean
          id: string
          metric_key: string
          severity: string
          threshold_value: number
          updated_at: string
        }
        Insert: {
          comparison: string
          cooldown_seconds?: number
          created_at?: string
          created_by: string
          enabled?: boolean
          id?: string
          metric_key: string
          severity: string
          threshold_value: number
          updated_at?: string
        }
        Update: {
          comparison?: string
          cooldown_seconds?: number
          created_at?: string
          created_by?: string
          enabled?: boolean
          id?: string
          metric_key?: string
          severity?: string
          threshold_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      alert_history: {
        Row: {
          alert_config_id: string
          created_at: string
          id: string
          metric_key: string
          metric_value: number
          resolved_at: string | null
          severity: string
          threshold_value: number
        }
        Insert: {
          alert_config_id: string
          created_at?: string
          id?: string
          metric_key: string
          metric_value: number
          resolved_at?: string | null
          severity: string
          threshold_value: number
        }
        Update: {
          alert_config_id?: string
          created_at?: string
          id?: string
          metric_key?: string
          metric_value?: number
          resolved_at?: string | null
          severity?: string
          threshold_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "alert_history_alert_config_id_fkey"
            columns: ["alert_config_id"]
            isOneToOne: false
            referencedRelation: "alert_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          correlation_id: string | null
          created_at: string
          id: string
          ip_address: unknown
          metadata: Json | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      combiner_book: {
        Row: {
          as_of_date: string
          computed_at: string
          operator_id: string
          rank_within_side: number
          ranker_source: string
          score: number
          side: string
          ticker: string
        }
        Insert: {
          as_of_date: string
          computed_at?: string
          operator_id: string
          rank_within_side: number
          ranker_source: string
          score: number
          side: string
          ticker: string
        }
        Update: {
          as_of_date?: string
          computed_at?: string
          operator_id?: string
          rank_within_side?: number
          ranker_source?: string
          score?: number
          side?: string
          ticker?: string
        }
        Relationships: []
      }
      combiner_book_shadow: {
        Row: {
          as_of_date: string
          computed_at: string
          inclusion_rule: string
          k: number
          operator_id: string
          rank_within_side: number
          ranker_source: string
          score: number
          side: string
          ticker: string
          variant: string
        }
        Insert: {
          as_of_date: string
          computed_at?: string
          inclusion_rule: string
          k: number
          operator_id: string
          rank_within_side: number
          ranker_source: string
          score: number
          side: string
          ticker: string
          variant: string
        }
        Update: {
          as_of_date?: string
          computed_at?: string
          inclusion_rule?: string
          k?: number
          operator_id?: string
          rank_within_side?: number
          ranker_source?: string
          score?: number
          side?: string
          ticker?: string
          variant?: string
        }
        Relationships: []
      }
      combiner_feature_vectors: {
        Row: {
          as_of_date: string
          computed_at: string
          coverage_count: number
          excluded_reason: string | null
          features: Json
          gics_sector: string | null
          operator_id: string
          ticker: string
        }
        Insert: {
          as_of_date: string
          computed_at?: string
          coverage_count: number
          excluded_reason?: string | null
          features: Json
          gics_sector?: string | null
          operator_id: string
          ticker: string
        }
        Update: {
          as_of_date?: string
          computed_at?: string
          coverage_count?: number
          excluded_reason?: string | null
          features?: Json
          gics_sector?: string | null
          operator_id?: string
          ticker?: string
        }
        Relationships: []
      }
      combiner_forward_returns: {
        Row: {
          computed_at: string
          horizon_close_date: string | null
          horizon_td: number
          operator_id: string
          price_source_status: string
          raw_return: number | null
          seed_as_of_date: string
          seed_score: number | null
          side: string
          side_signed_return: number | null
          source_table: string
          ticker: string
          variant: string
        }
        Insert: {
          computed_at?: string
          horizon_close_date?: string | null
          horizon_td: number
          operator_id: string
          price_source_status: string
          raw_return?: number | null
          seed_as_of_date: string
          seed_score?: number | null
          side: string
          side_signed_return?: number | null
          source_table: string
          ticker: string
          variant: string
        }
        Update: {
          computed_at?: string
          horizon_close_date?: string | null
          horizon_td?: number
          operator_id?: string
          price_source_status?: string
          raw_return?: number | null
          seed_as_of_date?: string
          seed_score?: number | null
          side?: string
          side_signed_return?: number | null
          source_table?: string
          ticker?: string
          variant?: string
        }
        Relationships: []
      }
      combiner_model_registry: {
        Row: {
          artifact_uri: string | null
          created_at: string
          metadata: Json
          model_id: string
          model_key: string
          promoted_at: string | null
          retired_at: string | null
          side: string
          status: string
          trained_at: string | null
          updated_at: string
          version: string
        }
        Insert: {
          artifact_uri?: string | null
          created_at?: string
          metadata?: Json
          model_id?: string
          model_key: string
          promoted_at?: string | null
          retired_at?: string | null
          side: string
          status: string
          trained_at?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          artifact_uri?: string | null
          created_at?: string
          metadata?: Json
          model_id?: string
          model_key?: string
          promoted_at?: string | null
          retired_at?: string | null
          side?: string
          status?: string
          trained_at?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      combiner_rankings: {
        Row: {
          as_of_date: string
          computed_at: string
          gics_sector: string | null
          long_rank: number
          long_score: number
          operator_id: string
          ranker_source: string
          short_rank: number
          short_score: number
          ticker: string
        }
        Insert: {
          as_of_date: string
          computed_at?: string
          gics_sector?: string | null
          long_rank: number
          long_score: number
          operator_id: string
          ranker_source: string
          short_rank: number
          short_score: number
          ticker: string
        }
        Update: {
          as_of_date?: string
          computed_at?: string
          gics_sector?: string | null
          long_rank?: number
          long_score?: number
          operator_id?: string
          ranker_source?: string
          short_rank?: number
          short_score?: number
          ticker?: string
        }
        Relationships: []
      }
      combiner_shadow_variant_config: {
        Row: {
          active: boolean
          created_at: string
          inclusion_rule: string
          k: number
          variant: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          inclusion_rule: string
          k: number
          variant: string
        }
        Update: {
          active?: boolean
          created_at?: string
          inclusion_rule?: string
          k?: number
          variant?: string
        }
        Relationships: []
      }
      combiner_shap_attribution: {
        Row: {
          as_of_date: string
          attributions: Json
          computed_at: string
          model_id: string | null
          operator_id: string
          ticker: string
        }
        Insert: {
          as_of_date: string
          attributions: Json
          computed_at?: string
          model_id?: string | null
          operator_id: string
          ticker: string
        }
        Update: {
          as_of_date?: string
          attributions?: Json
          computed_at?: string
          model_id?: string | null
          operator_id?: string
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "combiner_shap_attribution_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "combiner_model_registry"
            referencedColumns: ["model_id"]
          },
          {
            foreignKeyName: "combiner_shap_attribution_operator_id_as_of_date_ticker_fkey"
            columns: ["operator_id", "as_of_date", "ticker"]
            isOneToOne: true
            referencedRelation: "combiner_rankings"
            referencedColumns: ["operator_id", "as_of_date", "ticker"]
          },
        ]
      }
      feature_flags: {
        Row: {
          enabled: boolean
          evidence_tier: string
          flag_key: string
          operator_id: string
          reason: string | null
          set_at: string
          set_by: string | null
        }
        Insert: {
          enabled?: boolean
          evidence_tier?: string
          flag_key: string
          operator_id?: string
          reason?: string | null
          set_at?: string
          set_by?: string | null
        }
        Update: {
          enabled?: boolean
          evidence_tier?: string
          flag_key?: string
          operator_id?: string
          reason?: string | null
          set_at?: string
          set_by?: string | null
        }
        Relationships: []
      }
      hard_exclusions: {
        Row: {
          applied_at: string
          as_of_date: string
          firing_reasons: Json
          firing_rules: string[]
          operator_id: string
          refresh_id: string | null
          ticker: string
        }
        Insert: {
          applied_at?: string
          as_of_date: string
          firing_reasons: Json
          firing_rules: string[]
          operator_id: string
          refresh_id?: string | null
          ticker: string
        }
        Update: {
          applied_at?: string
          as_of_date?: string
          firing_reasons?: Json
          firing_rules?: string[]
          operator_id?: string
          refresh_id?: string | null
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "hard_exclusions_refresh_fk"
            columns: ["refresh_id"]
            isOneToOne: false
            referencedRelation: "universe_refresh_log"
            referencedColumns: ["refresh_id"]
          },
        ]
      }
      insider_accession_discovery_queue: {
        Row: {
          acceptance_datetime: string
          accession_number: string
          as_of_date: string
          company_name: string
          consumed_at: string | null
          consumed_run_id: string | null
          discovered_at: string
          discovered_by: string
          discovery_correlation_id: string
          filename: string
          form_type: string
          issuer_cik: string
          ticker: string
        }
        Insert: {
          acceptance_datetime: string
          accession_number: string
          as_of_date: string
          company_name: string
          consumed_at?: string | null
          consumed_run_id?: string | null
          discovered_at?: string
          discovered_by: string
          discovery_correlation_id: string
          filename: string
          form_type: string
          issuer_cik: string
          ticker: string
        }
        Update: {
          acceptance_datetime?: string
          accession_number?: string
          as_of_date?: string
          company_name?: string
          consumed_at?: string | null
          consumed_run_id?: string | null
          discovered_at?: string
          discovered_by?: string
          discovery_correlation_id?: string
          filename?: string
          form_type?: string
          issuer_cik?: string
          ticker?: string
        }
        Relationships: []
      }
      insider_form4_rows: {
        Row: {
          acceptance_datetime: string
          accession_number: string
          aff_10b5_one: boolean
          filing_form_type: string
          ingested_at: string
          ingested_run_id: string | null
          is_director: boolean
          is_officer: boolean
          is_ten_percent_owner: boolean
          issuer_cik: string
          not_subject_to_section_16: boolean
          officer_title: string | null
          owner_cik: string
          security_type: string | null
          ticker: string
          transaction_acquired_disposed: string
          transaction_code: string
          transaction_date: string
          transaction_price_per_share: number | null
          transaction_seq: number
          transaction_shares: number
        }
        Insert: {
          acceptance_datetime: string
          accession_number: string
          aff_10b5_one?: boolean
          filing_form_type: string
          ingested_at?: string
          ingested_run_id?: string | null
          is_director?: boolean
          is_officer?: boolean
          is_ten_percent_owner?: boolean
          issuer_cik: string
          not_subject_to_section_16?: boolean
          officer_title?: string | null
          owner_cik: string
          security_type?: string | null
          ticker: string
          transaction_acquired_disposed: string
          transaction_code: string
          transaction_date: string
          transaction_price_per_share?: number | null
          transaction_seq: number
          transaction_shares: number
        }
        Update: {
          acceptance_datetime?: string
          accession_number?: string
          aff_10b5_one?: boolean
          filing_form_type?: string
          ingested_at?: string
          ingested_run_id?: string | null
          is_director?: boolean
          is_officer?: boolean
          is_ten_percent_owner?: boolean
          issuer_cik?: string
          not_subject_to_section_16?: boolean
          officer_title?: string | null
          owner_cik?: string
          security_type?: string | null
          ticker?: string
          transaction_acquired_disposed?: string
          transaction_code?: string
          transaction_date?: string
          transaction_price_per_share?: number | null
          transaction_seq?: number
          transaction_shares?: number
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          role_id: string | null
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role_id?: string | null
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role_id?: string | null
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_executions: {
        Row: {
          affected_records: number | null
          attempt: number
          completed_at: string | null
          correlation_id: string | null
          created_at: string
          duration_ms: number | null
          error: Json | null
          execution_id: string
          failure_type: string | null
          id: string
          job_id: string
          job_version: string
          metadata: Json | null
          parent_execution_id: string | null
          queue_delay_ms: number | null
          resource_usage: Json | null
          root_execution_id: string | null
          schedule_window_id: string | null
          scheduled_time: string | null
          started_at: string | null
          state: string
        }
        Insert: {
          affected_records?: number | null
          attempt?: number
          completed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: Json | null
          execution_id?: string
          failure_type?: string | null
          id?: string
          job_id: string
          job_version?: string
          metadata?: Json | null
          parent_execution_id?: string | null
          queue_delay_ms?: number | null
          resource_usage?: Json | null
          root_execution_id?: string | null
          schedule_window_id?: string | null
          scheduled_time?: string | null
          started_at?: string | null
          state?: string
        }
        Update: {
          affected_records?: number | null
          attempt?: number
          completed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: Json | null
          execution_id?: string
          failure_type?: string | null
          id?: string
          job_id?: string
          job_version?: string
          metadata?: Json | null
          parent_execution_id?: string | null
          queue_delay_ms?: number | null
          resource_usage?: Json | null
          root_execution_id?: string | null
          schedule_window_id?: string | null
          scheduled_time?: string | null
          started_at?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      job_idempotency_keys: {
        Row: {
          created_at: string
          execution_id: string
          expires_at: string
          id: string
          idempotency_key: string
          job_id: string
          result_hash: string | null
        }
        Insert: {
          created_at?: string
          execution_id: string
          expires_at?: string
          id?: string
          idempotency_key: string
          job_id: string
          result_hash?: string | null
        }
        Update: {
          created_at?: string
          execution_id?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          job_id?: string
          result_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_idempotency_keys_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "job_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_idempotency_keys_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      job_registry: {
        Row: {
          circuit_breaker_threshold: number | null
          class: string
          concurrency_policy: string
          created_at: string
          description: string | null
          enabled: boolean
          execution_guarantee: string
          handler_path: string | null
          id: string
          max_retries: number
          owner_module: string
          priority: string
          replay_safe: boolean
          retry_policy: string
          schedule: string
          status: string
          timeout_seconds: number
          trigger_type: string
          updated_at: string
          version: string
        }
        Insert: {
          circuit_breaker_threshold?: number | null
          class?: string
          concurrency_policy?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          execution_guarantee?: string
          handler_path?: string | null
          id: string
          max_retries?: number
          owner_module: string
          priority?: string
          replay_safe?: boolean
          retry_policy?: string
          schedule?: string
          status?: string
          timeout_seconds?: number
          trigger_type?: string
          updated_at?: string
          version?: string
        }
        Update: {
          circuit_breaker_threshold?: number | null
          class?: string
          concurrency_policy?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          execution_guarantee?: string
          handler_path?: string | null
          id?: string
          max_retries?: number
          owner_module?: string
          priority?: string
          replay_safe?: boolean
          retry_policy?: string
          schedule?: string
          status?: string
          timeout_seconds?: number
          trigger_type?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      kill_switches: {
        Row: {
          operator_id: string
          reason: string | null
          set_at: string
          set_by: string | null
          state: Database["public"]["Enums"]["kill_switch_state"]
          strategy_key: string
        }
        Insert: {
          operator_id?: string
          reason?: string | null
          set_at?: string
          set_by?: string | null
          state?: Database["public"]["Enums"]["kill_switch_state"]
          strategy_key: string
        }
        Update: {
          operator_id?: string
          reason?: string | null
          set_at?: string
          set_by?: string | null
          state?: Database["public"]["Enums"]["kill_switch_state"]
          strategy_key?: string
        }
        Relationships: []
      }
      longshort_audit_logs: {
        Row: {
          action: string
          correlation_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json
          operator_id: string
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          correlation_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          operator_id?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          correlation_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          operator_id?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      longshort_reconciliation_state: {
        Row: {
          call_name: string
          cooldown_until: string | null
          escalation_active: boolean
          escalation_count_24h: number
          last_firing_ts: string | null
          operator_id: string
          rolling_window_count: number
          rolling_window_start: string
          symbol: string
          updated_at: string
        }
        Insert: {
          call_name: string
          cooldown_until?: string | null
          escalation_active?: boolean
          escalation_count_24h?: number
          last_firing_ts?: string | null
          operator_id?: string
          rolling_window_count?: number
          rolling_window_start: string
          symbol: string
          updated_at?: string
        }
        Update: {
          call_name?: string
          cooldown_until?: string | null
          escalation_active?: boolean
          escalation_count_24h?: number
          last_firing_ts?: string | null
          operator_id?: string
          rolling_window_count?: number
          rolling_window_start?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      mfa_recovery_attempts: {
        Row: {
          failed_count: number
          last_attempt_at: string
          locked_until: string | null
          user_id: string
        }
        Insert: {
          failed_count?: number
          last_attempt_at?: string
          locked_until?: string | null
          user_id: string
        }
        Update: {
          failed_count?: number
          last_attempt_at?: string
          locked_until?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          email_verified: boolean | null
          id: string
          last_name: string | null
          require_mfa_for_self: boolean
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_verified?: boolean | null
          id: string
          last_name?: string | null
          require_mfa_for_self?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_verified?: boolean | null
          id?: string
          last_name?: string | null
          require_mfa_for_self?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      reconciliation_events: {
        Row: {
          call_name: string
          divergence: Json | null
          engine_version: string
          event_id: string
          expected_value: Json | null
          failure_action: string | null
          fetcher_source: string
          notes: string | null
          observed_value: Json | null
          operator_id: string
          outcome: Database["public"]["Enums"]["reconciliation_outcome"]
          phase_0b_run_id: string | null
          pr_evidence_ref: string | null
          resolution_pr_ref: string | null
          resolved_at: string | null
          symbol: string | null
          tier: Database["public"]["Enums"]["reconciliation_tier"]
          tolerance: Json | null
          ts: string
        }
        Insert: {
          call_name: string
          divergence?: Json | null
          engine_version: string
          event_id?: string
          expected_value?: Json | null
          failure_action?: string | null
          fetcher_source: string
          notes?: string | null
          observed_value?: Json | null
          operator_id?: string
          outcome: Database["public"]["Enums"]["reconciliation_outcome"]
          phase_0b_run_id?: string | null
          pr_evidence_ref?: string | null
          resolution_pr_ref?: string | null
          resolved_at?: string | null
          symbol?: string | null
          tier: Database["public"]["Enums"]["reconciliation_tier"]
          tolerance?: Json | null
          ts: string
        }
        Update: {
          call_name?: string
          divergence?: Json | null
          engine_version?: string
          event_id?: string
          expected_value?: Json | null
          failure_action?: string | null
          fetcher_source?: string
          notes?: string | null
          observed_value?: Json | null
          operator_id?: string
          outcome?: Database["public"]["Enums"]["reconciliation_outcome"]
          phase_0b_run_id?: string | null
          pr_evidence_ref?: string | null
          resolution_pr_ref?: string | null
          resolved_at?: string | null
          symbol?: string | null
          tier?: Database["public"]["Enums"]["reconciliation_tier"]
          tolerance?: Json | null
          ts?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_base: boolean
          is_immutable: boolean
          is_permission_locked: boolean
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_base?: boolean
          is_immutable?: boolean
          is_permission_locked?: boolean
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_base?: boolean
          is_immutable?: boolean
          is_permission_locked?: boolean
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      signal_compute_log: {
        Row: {
          as_of_date: string
          completed_at: string
          failure_reason: string | null
          operator_id: string
          outcome: string
          persisted_count: number
          run_id: string
          signal_id: string
          skip_counts: Json | null
          skipped_detail: Json
          started_at: string
          universe_size: number
        }
        Insert: {
          as_of_date: string
          completed_at: string
          failure_reason?: string | null
          operator_id: string
          outcome: string
          persisted_count: number
          run_id?: string
          signal_id: string
          skip_counts?: Json | null
          skipped_detail?: Json
          started_at: string
          universe_size: number
        }
        Update: {
          as_of_date?: string
          completed_at?: string
          failure_reason?: string | null
          operator_id?: string
          outcome?: string
          persisted_count?: number
          run_id?: string
          signal_id?: string
          skip_counts?: Json | null
          skipped_detail?: Json
          started_at?: string
          universe_size?: number
        }
        Relationships: []
      }
      signal_observations: {
        Row: {
          as_of_date: string
          computed_at: string
          gics_sector: string | null
          is_present: boolean
          operator_id: string
          signal_id: string
          ticker: string
          value: number | null
        }
        Insert: {
          as_of_date: string
          computed_at?: string
          gics_sector?: string | null
          is_present: boolean
          operator_id: string
          signal_id: string
          ticker: string
          value?: number | null
        }
        Update: {
          as_of_date?: string
          computed_at?: string
          gics_sector?: string | null
          is_present?: boolean
          operator_id?: string
          signal_id?: string
          ticker?: string
          value?: number | null
        }
        Relationships: []
      }
      signal_queue_cursor: {
        Row: {
          claimed_at: string | null
          created_at: string
          gics_sector: string | null
          run_id: string
          signal_id: string
          ticker: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          gics_sector?: string | null
          run_id: string
          signal_id: string
          ticker: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          gics_sector?: string | null
          run_id?: string
          signal_id?: string
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_queue_cursor_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "signal_queue_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      signal_queue_feed_items: {
        Row: {
          article_id: string
          created_at: string
          published_utc: string
          run_id: string
          sentiment_num: number
          ticker: string
          tier_weight: number
        }
        Insert: {
          article_id: string
          created_at?: string
          published_utc: string
          run_id: string
          sentiment_num: number
          ticker: string
          tier_weight: number
        }
        Update: {
          article_id?: string
          created_at?: string
          published_utc?: string
          run_id?: string
          sentiment_num?: number
          ticker?: string
          tier_weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "signal_queue_feed_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "signal_queue_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      signal_queue_runs: {
        Row: {
          as_of_date: string
          created_at: string
          failure_reason: string | null
          feed_cursor: string | null
          feed_pages_fetched: number
          finalized_at: string | null
          heartbeat_at: string
          metadata: Json
          operator_id: string
          run_id: string
          signal_id: string
          slice_failure_count: number
          status: string
          universe_size: number
          updated_at: string
        }
        Insert: {
          as_of_date: string
          created_at?: string
          failure_reason?: string | null
          feed_cursor?: string | null
          feed_pages_fetched?: number
          finalized_at?: string | null
          heartbeat_at?: string
          metadata?: Json
          operator_id: string
          run_id?: string
          signal_id: string
          slice_failure_count?: number
          status: string
          universe_size: number
          updated_at?: string
        }
        Update: {
          as_of_date?: string
          created_at?: string
          failure_reason?: string | null
          feed_cursor?: string | null
          feed_pages_fetched?: number
          finalized_at?: string | null
          heartbeat_at?: string
          metadata?: Json
          operator_id?: string
          run_id?: string
          signal_id?: string
          slice_failure_count?: number
          status?: string
          universe_size?: number
          updated_at?: string
        }
        Relationships: []
      }
      signal_queue_skips: {
        Row: {
          detail: Json
          recorded_at: string
          run_id: string
          signal_id: string
          skip_reason: string
          ticker: string
        }
        Insert: {
          detail?: Json
          recorded_at?: string
          run_id: string
          signal_id: string
          skip_reason: string
          ticker: string
        }
        Update: {
          detail?: Json
          recorded_at?: string
          run_id?: string
          signal_id?: string
          skip_reason?: string
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_queue_skips_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "signal_queue_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      signal_queue_staging: {
        Row: {
          computed_at: string
          gics_sector: string | null
          metadata: Json
          raw_signal: number
          run_id: string
          signal_id: string
          ticker: string
        }
        Insert: {
          computed_at?: string
          gics_sector?: string | null
          metadata?: Json
          raw_signal: number
          run_id: string
          signal_id: string
          ticker: string
        }
        Update: {
          computed_at?: string
          gics_sector?: string | null
          metadata?: Json
          raw_signal?: number
          run_id?: string
          signal_id?: string
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_queue_staging_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "signal_queue_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      signal_registry: {
        Row: {
          cadence: string | null
          created_at: string
          criticality: string | null
          display_name: string
          display_order: number
          job_registry_id: string | null
          planned_phase: string | null
          signal_id: string
          signal_num: number | null
          spec_ref: string | null
          stale_after_hours: number | null
          status: string
          updated_at: string
        }
        Insert: {
          cadence?: string | null
          created_at?: string
          criticality?: string | null
          display_name: string
          display_order: number
          job_registry_id?: string | null
          planned_phase?: string | null
          signal_id: string
          signal_num?: number | null
          spec_ref?: string | null
          stale_after_hours?: number | null
          status: string
          updated_at?: string
        }
        Update: {
          cadence?: string | null
          created_at?: string
          criticality?: string | null
          display_name?: string
          display_order?: number
          job_registry_id?: string | null
          planned_phase?: string | null
          signal_id?: string
          signal_num?: number | null
          spec_ref?: string | null
          stale_after_hours?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
          value_version: number
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
          value_version?: number
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
          value_version?: number
        }
        Relationships: []
      }
      system_health_snapshots: {
        Row: {
          checks: Json
          created_at: string
          id: string
          status: string
        }
        Insert: {
          checks?: Json
          created_at?: string
          id?: string
          status: string
        }
        Update: {
          checks?: Json
          created_at?: string
          id?: string
          status?: string
        }
        Relationships: []
      }
      system_metrics: {
        Row: {
          id: string
          metadata: Json | null
          metric_key: string
          recorded_at: string
          value: number
        }
        Insert: {
          id?: string
          metadata?: Json | null
          metric_key: string
          recorded_at?: string
          value: number
        }
        Update: {
          id?: string
          metadata?: Json | null
          metric_key?: string
          recorded_at?: string
          value?: number
        }
        Relationships: []
      }
      universe_eligibility_coverage: {
        Row: {
          as_of_date: string
          covers_3_3a: boolean
          covers_3_3b: boolean
          covers_3_3c: boolean
          covers_3_3d: boolean
          covers_3_3e: boolean
          operator_id: string
          written_at: string
          written_by: string | null
        }
        Insert: {
          as_of_date: string
          covers_3_3a?: boolean
          covers_3_3b?: boolean
          covers_3_3c?: boolean
          covers_3_3d?: boolean
          covers_3_3e?: boolean
          operator_id?: string
          written_at?: string
          written_by?: string | null
        }
        Update: {
          as_of_date?: string
          covers_3_3a?: boolean
          covers_3_3b?: boolean
          covers_3_3c?: boolean
          covers_3_3d?: boolean
          covers_3_3e?: boolean
          operator_id?: string
          written_at?: string
          written_by?: string | null
        }
        Relationships: []
      }
      universe_membership: {
        Row: {
          as_of_date: string
          created_at: string
          gics_sector: string | null
          long_eligible: boolean
          operator_id: string
          quarter_label: string
          refresh_id: string
          short_eligible: boolean
          ticker: string
        }
        Insert: {
          as_of_date: string
          created_at?: string
          gics_sector?: string | null
          long_eligible: boolean
          operator_id: string
          quarter_label: string
          refresh_id: string
          short_eligible: boolean
          ticker: string
        }
        Update: {
          as_of_date?: string
          created_at?: string
          gics_sector?: string | null
          long_eligible?: boolean
          operator_id?: string
          quarter_label?: string
          refresh_id?: string
          short_eligible?: boolean
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "universe_membership_refresh_fk"
            columns: ["refresh_id"]
            isOneToOne: false
            referencedRelation: "universe_refresh_log"
            referencedColumns: ["refresh_id"]
          },
        ]
      }
      universe_refresh_log: {
        Row: {
          as_of_date: string
          created_at: string
          enrichment_skip_counts: Json | null
          failure_reason: string | null
          filter_rejection_counts: Json | null
          hard_exclusion_counts: Json | null
          ishares_cross_check_snapshot: Json | null
          operator_id: string
          outcome: string | null
          quarter_label: string
          refresh_completed_at: string | null
          refresh_id: string
          refresh_started_at: string
          total_constituents_raw: number | null
          total_eligible_long: number | null
          total_eligible_short: number | null
          total_post_filters: number | null
        }
        Insert: {
          as_of_date: string
          created_at?: string
          enrichment_skip_counts?: Json | null
          failure_reason?: string | null
          filter_rejection_counts?: Json | null
          hard_exclusion_counts?: Json | null
          ishares_cross_check_snapshot?: Json | null
          operator_id: string
          outcome?: string | null
          quarter_label: string
          refresh_completed_at?: string | null
          refresh_id?: string
          refresh_started_at: string
          total_constituents_raw?: number | null
          total_eligible_long?: number | null
          total_eligible_short?: number | null
          total_post_filters?: number | null
        }
        Update: {
          as_of_date?: string
          created_at?: string
          enrichment_skip_counts?: Json | null
          failure_reason?: string | null
          filter_rejection_counts?: Json | null
          hard_exclusion_counts?: Json | null
          ishares_cross_check_snapshot?: Json | null
          operator_id?: string
          outcome?: string | null
          quarter_label?: string
          refresh_completed_at?: string | null
          refresh_id?: string
          refresh_started_at?: string
          total_constituents_raw?: number | null
          total_eligible_long?: number | null
          total_eligible_short?: number | null
          total_post_filters?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      reconciliation_events_daily_agg: {
        Row: {
          bucket_day: string | null
          call_name: string | null
          event_count: number | null
          outcome: Database["public"]["Enums"]["reconciliation_outcome"] | null
        }
        Relationships: []
      }
      reconciliation_events_monthly_agg: {
        Row: {
          bucket_month: string | null
          call_name: string | null
          event_count: number | null
          outcome: Database["public"]["Enums"]["reconciliation_outcome"] | null
        }
        Relationships: []
      }
      reconciliation_events_weekly_agg: {
        Row: {
          bucket_week: string | null
          call_name: string | null
          event_count: number | null
          outcome: Database["public"]["Enums"]["reconciliation_outcome"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      assert_eligibility_complete: {
        Args: { _as_of_date: string; _operator_id: string }
        Returns: boolean
      }
      compare_reconciliation_baseline: {
        Args: {
          p_baseline_days?: number
          p_call_name: string
          p_outcome: Database["public"]["Enums"]["reconciliation_outcome"]
          p_window_days?: number
        }
        Returns: {
          baseline_rate_per_day: number
          current_rate_per_day: number
          exceeds_3x_threshold: boolean
          ratio_current_vs_baseline: number
        }[]
      }
      get_my_authorization_context: { Args: never; Returns: Json }
      has_permission: {
        Args: { _permission_key: string; _user_id: string }
        Returns: boolean
      }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { _role_key: string; _user_id: string }; Returns: boolean }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      kill_switch_hard_pause: {
        Args: {
          p_operator_id?: string
          p_reason: string
          p_strategy_key: string
        }
        Returns: Json
      }
      kill_switch_manual_liquidate: {
        Args: {
          p_operator_id?: string
          p_reason: string
          p_strategy_key: string
        }
        Returns: Json
      }
      kill_switch_resume: {
        Args: {
          p_operator_id?: string
          p_reason: string
          p_strategy_key: string
        }
        Returns: Json
      }
      kill_switch_soft_pause: {
        Args: {
          p_operator_id?: string
          p_reason: string
          p_strategy_key: string
        }
        Returns: Json
      }
      signal_queue_cas_finalizing: {
        Args: { p_now: string; p_run_id: string }
        Returns: boolean
      }
      signal_queue_claim_slice: {
        Args: { p_limit: number; p_run_id: string }
        Returns: {
          gics_sector: string
          ticker: string
        }[]
      }
      write_universe_eligibility_coverage: {
        Args: { _as_of_date: string; _coverage: Json; _operator_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      kill_switch_state:
        | "active"
        | "soft_paused"
        | "hard_paused"
        | "liquidating"
      reconciliation_outcome:
        | "false_positive_within_tolerance"
        | "failure_handled"
        | "failure_escalated"
        | "expected_divergence_handled"
        | "system_bug"
      reconciliation_tier: "strong_plus" | "strong" | "medium" | "weak"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      kill_switch_state: [
        "active",
        "soft_paused",
        "hard_paused",
        "liquidating",
      ],
      reconciliation_outcome: [
        "false_positive_within_tolerance",
        "failure_handled",
        "failure_escalated",
        "expected_divergence_handled",
        "system_bug",
      ],
      reconciliation_tier: ["strong_plus", "strong", "medium", "weak"],
    },
  },
} as const
