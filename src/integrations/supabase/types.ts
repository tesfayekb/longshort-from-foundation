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
      analyst_revision_observations: {
        Row: {
          age_days: number
          analyst_company: string
          analyst_company_key: string
          analyst_name: string
          analyst_name_key: string
          as_of_date: string
          computed_at: string
          contribution: number
          direction: number
          focal_published_at: string
          magnitude_pct: number
          new_target: number
          operator_id: string
          pair_basis: string
          prior_published_at: string
          prior_target: number
          signal_id: string
          source: string
          target_delta: number
          ticker: string
        }
        Insert: {
          age_days: number
          analyst_company: string
          analyst_company_key: string
          analyst_name: string
          analyst_name_key: string
          as_of_date: string
          computed_at: string
          contribution: number
          direction: number
          focal_published_at: string
          magnitude_pct: number
          new_target: number
          operator_id: string
          pair_basis: string
          prior_published_at: string
          prior_target: number
          signal_id: string
          source?: string
          target_delta: number
          ticker: string
        }
        Update: {
          age_days?: number
          analyst_company?: string
          analyst_company_key?: string
          analyst_name?: string
          analyst_name_key?: string
          as_of_date?: string
          computed_at?: string
          contribution?: number
          direction?: number
          focal_published_at?: string
          magnitude_pct?: number
          new_target?: number
          operator_id?: string
          pair_basis?: string
          prior_published_at?: string
          prior_target?: number
          signal_id?: string
          source?: string
          target_delta?: number
          ticker?: string
        }
        Relationships: []
      }
      api_provider_registry: {
        Row: {
          consumers: string[]
          cost_monthly_usd: number | null
          cost_surface: boolean
          created_at: string
          endpoint_classes: string[]
          env_key_names: string[]
          feeds: string
          freshness_source: string
          id: string
          notes: string | null
          product_tier: string
          provider: string
          strategy: string
          updated_at: string
        }
        Insert: {
          consumers?: string[]
          cost_monthly_usd?: number | null
          cost_surface?: boolean
          created_at?: string
          endpoint_classes?: string[]
          env_key_names?: string[]
          feeds: string
          freshness_source: string
          id?: string
          notes?: string | null
          product_tier: string
          provider: string
          strategy: string
          updated_at?: string
        }
        Update: {
          consumers?: string[]
          cost_monthly_usd?: number | null
          cost_surface?: boolean
          created_at?: string
          endpoint_classes?: string[]
          env_key_names?: string[]
          feeds?: string
          freshness_source?: string
          id?: string
          notes?: string | null
          product_tier?: string
          provider?: string
          strategy?: string
          updated_at?: string
        }
        Relationships: []
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
          entered_at: string | null
          intraday_slot: number
          operator_id: string
          rank_within_side: number
          ranker_source: string
          score: number
          side: string
          ticker: string
          transition_reason: string | null
        }
        Insert: {
          as_of_date: string
          computed_at?: string
          entered_at?: string | null
          intraday_slot?: number
          operator_id: string
          rank_within_side: number
          ranker_source: string
          score: number
          side: string
          ticker: string
          transition_reason?: string | null
        }
        Update: {
          as_of_date?: string
          computed_at?: string
          entered_at?: string | null
          intraday_slot?: number
          operator_id?: string
          rank_within_side?: number
          ranker_source?: string
          score?: number
          side?: string
          ticker?: string
          transition_reason?: string | null
        }
        Relationships: []
      }
      combiner_book_shadow: {
        Row: {
          as_of_date: string
          computed_at: string
          inclusion_rule: string
          intraday_slot: number
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
          intraday_slot?: number
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
          intraday_slot?: number
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
          gated_signals: Json | null
          gics_sector: string | null
          intraday_slot: number
          operator_id: string
          ticker: string
        }
        Insert: {
          as_of_date: string
          computed_at?: string
          coverage_count: number
          excluded_reason?: string | null
          features: Json
          gated_signals?: Json | null
          gics_sector?: string | null
          intraday_slot?: number
          operator_id: string
          ticker: string
        }
        Update: {
          as_of_date?: string
          computed_at?: string
          coverage_count?: number
          excluded_reason?: string | null
          features?: Json
          gated_signals?: Json | null
          gics_sector?: string | null
          intraday_slot?: number
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
          intraday_slot: number
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
          intraday_slot?: number
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
          intraday_slot?: number
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
          intraday_slot: number
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
          intraday_slot?: number
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
          intraday_slot?: number
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
          intraday_slot: number
          model_id: string | null
          operator_id: string
          side: string
          ticker: string
        }
        Insert: {
          as_of_date: string
          attributions: Json
          computed_at?: string
          intraday_slot?: number
          model_id?: string | null
          operator_id: string
          side: string
          ticker: string
        }
        Update: {
          as_of_date?: string
          attributions?: Json
          computed_at?: string
          intraday_slot?: number
          model_id?: string | null
          operator_id?: string
          side?: string
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
            columns: ["operator_id", "as_of_date", "ticker", "intraday_slot"]
            isOneToOne: false
            referencedRelation: "combiner_rankings"
            referencedColumns: [
              "operator_id",
              "as_of_date",
              "ticker",
              "intraday_slot",
            ]
          },
        ]
      }
      corporate_actions: {
        Row: {
          action_type: string
          announced_at: string | null
          applied_at: string | null
          applied_lot_count: number | null
          basis_allocation_pct: number | null
          ca_id: string
          cash_per_share: number | null
          created_at: string
          ex_date: string
          operator_id: string
          ratio_denominator: number | null
          ratio_numerator: number | null
          source: string
          source_payload: Json | null
          successor_symbol: string | null
          symbol: string
          updated_at: string
        }
        Insert: {
          action_type: string
          announced_at?: string | null
          applied_at?: string | null
          applied_lot_count?: number | null
          basis_allocation_pct?: number | null
          ca_id?: string
          cash_per_share?: number | null
          created_at?: string
          ex_date: string
          operator_id?: string
          ratio_denominator?: number | null
          ratio_numerator?: number | null
          source?: string
          source_payload?: Json | null
          successor_symbol?: string | null
          symbol: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          announced_at?: string | null
          applied_at?: string | null
          applied_lot_count?: number | null
          basis_allocation_pct?: number | null
          ca_id?: string
          cash_per_share?: number | null
          created_at?: string
          ex_date?: string
          operator_id?: string
          ratio_denominator?: number | null
          ratio_numerator?: number | null
          source?: string
          source_payload?: Json | null
          successor_symbol?: string | null
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      cron_last_fire: {
        Row: {
          completed_at: string | null
          failure_reason: string | null
          job_id: string
          outcome: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          failure_reason?: string | null
          job_id: string
          outcome?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          failure_reason?: string | null
          job_id?: string
          outcome?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cron_last_fire_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "job_registry"
            referencedColumns: ["id"]
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
          set_by_kind: string | null
          source_ref: string | null
          state: Database["public"]["Enums"]["kill_switch_state"]
          strategy_key: string
        }
        Insert: {
          operator_id?: string
          reason?: string | null
          set_at?: string
          set_by?: string | null
          set_by_kind?: string | null
          source_ref?: string | null
          state?: Database["public"]["Enums"]["kill_switch_state"]
          strategy_key: string
        }
        Update: {
          operator_id?: string
          reason?: string | null
          set_at?: string
          set_by?: string | null
          set_by_kind?: string | null
          source_ref?: string | null
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
      longshort_equity_snapshots: {
        Row: {
          account_equity: number
          cash: number | null
          gross: number
          long_mv: number
          mode: string | null
          net: number
          operator_id: string
          short_mv: number
          source: string
          ts: string
        }
        Insert: {
          account_equity: number
          cash?: number | null
          gross: number
          long_mv: number
          mode?: string | null
          net: number
          operator_id: string
          short_mv: number
          source: string
          ts: string
        }
        Update: {
          account_equity?: number
          cash?: number | null
          gross?: number
          long_mv?: number
          mode?: string | null
          net?: number
          operator_id?: string
          short_mv?: number
          source?: string
          ts?: string
        }
        Relationships: []
      }
      longshort_lots: {
        Row: {
          closed_at: string | null
          cost_basis: number
          created_at: string
          entry_ts: string
          exit_price: number | null
          exit_ts: string | null
          expected_settlement_ts: string | null
          locate_id: string | null
          lot_id: string
          net_pnl: number | null
          operator_id: string
          qty: number
          realized_pnl: number | null
          settled_at: string | null
          settlement_state: string
          side: string
          source_order_id: string | null
          status: string
          symbol: string
          updated_at: string
          wash_sale_adjustment: number
          wash_sale_status: string | null
        }
        Insert: {
          closed_at?: string | null
          cost_basis: number
          created_at?: string
          entry_ts: string
          exit_price?: number | null
          exit_ts?: string | null
          expected_settlement_ts?: string | null
          locate_id?: string | null
          lot_id?: string
          net_pnl?: number | null
          operator_id?: string
          qty: number
          realized_pnl?: number | null
          settled_at?: string | null
          settlement_state?: string
          side: string
          source_order_id?: string | null
          status?: string
          symbol: string
          updated_at?: string
          wash_sale_adjustment?: number
          wash_sale_status?: string | null
        }
        Update: {
          closed_at?: string | null
          cost_basis?: number
          created_at?: string
          entry_ts?: string
          exit_price?: number | null
          exit_ts?: string | null
          expected_settlement_ts?: string | null
          locate_id?: string | null
          lot_id?: string
          net_pnl?: number | null
          operator_id?: string
          qty?: number
          realized_pnl?: number | null
          settled_at?: string | null
          settlement_state?: string
          side?: string
          source_order_id?: string | null
          status?: string
          symbol?: string
          updated_at?: string
          wash_sale_adjustment?: number
          wash_sale_status?: string | null
        }
        Relationships: []
      }
      longshort_rebalance_ranking_snapshot: {
        Row: {
          as_of_date: string
          generation_skew: boolean
          gics_sector: string | null
          operator_id: string
          rank_within_side: number
          ranker_source: string
          score: number
          side: string
          snapshot_computed_at: string
          snapshotted_at: string
          submit_reference_computed_at: string | null
          ticker: string
        }
        Insert: {
          as_of_date: string
          generation_skew?: boolean
          gics_sector?: string | null
          operator_id: string
          rank_within_side: number
          ranker_source: string
          score: number
          side: string
          snapshot_computed_at: string
          snapshotted_at?: string
          submit_reference_computed_at?: string | null
          ticker: string
        }
        Update: {
          as_of_date?: string
          generation_skew?: boolean
          gics_sector?: string | null
          operator_id?: string
          rank_within_side?: number
          ranker_source?: string
          score?: number
          side?: string
          snapshot_computed_at?: string
          snapshotted_at?: string
          submit_reference_computed_at?: string | null
          ticker?: string
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
      longshort_short_availability_cache: {
        Row: {
          created_at: string
          expires_at: string
          marked_htb_at: string
          symbol: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          marked_htb_at: string
          symbol: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          marked_htb_at?: string
          symbol?: string
        }
        Relationships: []
      }
      longshort_target_positions: {
        Row: {
          allocation_pct: number
          as_of_date: string
          book_ref_computed_at: string
          book_size: number
          capital_base: number
          computed_at: string
          leverage: number
          operator_id: string
          ranker_source: string
          side: string
          sizing_basis: string
          sizing_basis_value: number
          target_notional: number
          target_shares: number | null
          ticker: string
        }
        Insert: {
          allocation_pct: number
          as_of_date: string
          book_ref_computed_at: string
          book_size: number
          capital_base: number
          computed_at?: string
          leverage: number
          operator_id: string
          ranker_source: string
          side: string
          sizing_basis: string
          sizing_basis_value: number
          target_notional: number
          target_shares?: number | null
          ticker: string
        }
        Update: {
          allocation_pct?: number
          as_of_date?: string
          book_ref_computed_at?: string
          book_size?: number
          capital_base?: number
          computed_at?: string
          leverage?: number
          operator_id?: string
          ranker_source?: string
          side?: string
          sizing_basis?: string
          sizing_basis_value?: number
          target_notional?: number
          target_shares?: number | null
          ticker?: string
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
      news_attention_observations: {
        Row: {
          article_count: number
          as_of_date: string
          computed_at: string
          operator_id: string
          signal_id: string
          ticker: string
        }
        Insert: {
          article_count: number
          as_of_date: string
          computed_at: string
          operator_id: string
          signal_id: string
          ticker: string
        }
        Update: {
          article_count?: number
          as_of_date?: string
          computed_at?: string
          operator_id?: string
          signal_id?: string
          ticker?: string
        }
        Relationships: []
      }
      overshoot_alert_dispatch: {
        Row: {
          body_preview: string | null
          channel: string
          correlation_id: string
          created_at: string
          dispatched_at: string
          error_message: string | null
          id: string
          outcome: string
          provider_message_id: string | null
          recipient: string
          severity: string
          source_row_id: string
          source_table: string
          subject: string
          trigger_kind: string
        }
        Insert: {
          body_preview?: string | null
          channel?: string
          correlation_id: string
          created_at?: string
          dispatched_at?: string
          error_message?: string | null
          id?: string
          outcome: string
          provider_message_id?: string | null
          recipient: string
          severity: string
          source_row_id: string
          source_table: string
          subject: string
          trigger_kind: string
        }
        Update: {
          body_preview?: string | null
          channel?: string
          correlation_id?: string
          created_at?: string
          dispatched_at?: string
          error_message?: string | null
          id?: string
          outcome?: string
          provider_message_id?: string | null
          recipient?: string
          severity?: string
          source_row_id?: string
          source_table?: string
          subject?: string
          trigger_kind?: string
        }
        Relationships: []
      }
      overshoot_audit_logs: {
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
      overshoot_backfill_runs: {
        Row: {
          completed_as_of: string | null
          created_at: string
          cursor: string | null
          kind: string
          outcome: string | null
          request_count: number | null
          row_count: number | null
          run_id: string
          started_as_of: string
          updated_at: string
        }
        Insert: {
          completed_as_of?: string | null
          created_at?: string
          cursor?: string | null
          kind: string
          outcome?: string | null
          request_count?: number | null
          row_count?: number | null
          run_id?: string
          started_as_of: string
          updated_at?: string
        }
        Update: {
          completed_as_of?: string | null
          created_at?: string
          cursor?: string | null
          kind?: string
          outcome?: string | null
          request_count?: number | null
          row_count?: number | null
          run_id?: string
          started_as_of?: string
          updated_at?: string
        }
        Relationships: []
      }
      overshoot_daily_bars: {
        Row: {
          adjusted: boolean
          close: number
          created_at: string
          fetched_as_of: string
          high: number
          low: number
          open: number
          source_run_id: string
          ticker: string
          trade_count: number | null
          trade_date: string
          volume: number
          vwap: number | null
        }
        Insert: {
          adjusted?: boolean
          close: number
          created_at?: string
          fetched_as_of: string
          high: number
          low: number
          open: number
          source_run_id: string
          ticker: string
          trade_count?: number | null
          trade_date: string
          volume: number
          vwap?: number | null
        }
        Update: {
          adjusted?: boolean
          close?: number
          created_at?: string
          fetched_as_of?: string
          high?: number
          low?: number
          open?: number
          source_run_id?: string
          ticker?: string
          trade_count?: number | null
          trade_date?: string
          volume?: number
          vwap?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "overshoot_daily_bars_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "overshoot_backfill_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      overshoot_detection_runs: {
        Row: {
          append_run_ids: Json | null
          as_of: string
          correlation_id: string | null
          created_at: string
          detected_at: string
          durations_ms: Json
          event_count: number
          git_sha: string | null
          outcome: string
          run_id: string
          selected_count: number
        }
        Insert: {
          append_run_ids?: Json | null
          as_of: string
          correlation_id?: string | null
          created_at?: string
          detected_at: string
          durations_ms?: Json
          event_count?: number
          git_sha?: string | null
          outcome: string
          run_id?: string
          selected_count?: number
        }
        Update: {
          append_run_ids?: Json | null
          as_of?: string
          correlation_id?: string | null
          created_at?: string
          detected_at?: string
          durations_ms?: Json
          event_count?: number
          git_sha?: string | null
          outcome?: string
          run_id?: string
          selected_count?: number
        }
        Relationships: []
      }
      overshoot_earnings_calendar: {
        Row: {
          announcement_date: string
          created_at: string
          eps_actual: number | null
          eps_estimate: number | null
          fetched_as_of: string
          fiscal_year: number | null
          hour: string | null
          quarter: number | null
          revenue_actual: number | null
          revenue_estimate: number | null
          source: string
          source_run_id: string
          ticker: string
        }
        Insert: {
          announcement_date: string
          created_at?: string
          eps_actual?: number | null
          eps_estimate?: number | null
          fetched_as_of: string
          fiscal_year?: number | null
          hour?: string | null
          quarter?: number | null
          revenue_actual?: number | null
          revenue_estimate?: number | null
          source: string
          source_run_id: string
          ticker: string
        }
        Update: {
          announcement_date?: string
          created_at?: string
          eps_actual?: number | null
          eps_estimate?: number | null
          fetched_as_of?: string
          fiscal_year?: number | null
          hour?: string | null
          quarter?: number | null
          revenue_actual?: number | null
          revenue_estimate?: number | null
          source?: string
          source_run_id?: string
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "overshoot_earnings_calendar_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "overshoot_backfill_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      overshoot_entry_runs: {
        Row: {
          correlation_id: string | null
          created_at: string
          detection_run_id: string | null
          dry_run: boolean
          git_sha: string | null
          orders_submitted: number
          outcome: string
          regime: string | null
          regime_signal_context: Json | null
          run_id: string
          session_date: string
          targets_loaded: number
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          detection_run_id?: string | null
          dry_run?: boolean
          git_sha?: string | null
          orders_submitted?: number
          outcome: string
          regime?: string | null
          regime_signal_context?: Json | null
          run_id?: string
          session_date: string
          targets_loaded?: number
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          detection_run_id?: string | null
          dry_run?: boolean
          git_sha?: string | null
          orders_submitted?: number
          outcome?: string
          regime?: string | null
          regime_signal_context?: Json | null
          run_id?: string
          session_date?: string
          targets_loaded?: number
        }
        Relationships: []
      }
      overshoot_equity_snapshots: {
        Row: {
          broker_equity: number
          cash: number | null
          correlation_id: string
          created_at: string
          fetched_at: string
          long_market_value: number | null
          operator_id: string
          position_mark_total: number | null
          positions_priced: number
          positions_total: number
          short_market_value: number | null
          snapshot_date: string
          source: string
          updated_at: string
        }
        Insert: {
          broker_equity: number
          cash?: number | null
          correlation_id: string
          created_at?: string
          fetched_at: string
          long_market_value?: number | null
          operator_id?: string
          position_mark_total?: number | null
          positions_priced?: number
          positions_total?: number
          short_market_value?: number | null
          snapshot_date: string
          source?: string
          updated_at?: string
        }
        Update: {
          broker_equity?: number
          cash?: number | null
          correlation_id?: string
          created_at?: string
          fetched_at?: string
          long_market_value?: number | null
          operator_id?: string
          position_mark_total?: number | null
          positions_priced?: number
          positions_total?: number
          short_market_value?: number | null
          snapshot_date?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      overshoot_events: {
        Row: {
          argmax_window_days: number | null
          as_of_date: string
          created_at: string
          days_to_nearest_earnings: number | null
          drawdown_bucket: number | null
          earnings_alias_used: string | null
          event_id: string
          excess_w1: number | null
          excess_w2: number | null
          excess_w3: number | null
          excess_w4: number | null
          excess_w5: number | null
          filter_passes: Json
          filter_refusal_reason: string | null
          momentum_quintile: number | null
          rank_score: number | null
          run_id: string
          selected_for_entry: boolean
          side: string
          study_cell_ref: Json | null
          ticker: string
          tier: string | null
        }
        Insert: {
          argmax_window_days?: number | null
          as_of_date: string
          created_at?: string
          days_to_nearest_earnings?: number | null
          drawdown_bucket?: number | null
          earnings_alias_used?: string | null
          event_id?: string
          excess_w1?: number | null
          excess_w2?: number | null
          excess_w3?: number | null
          excess_w4?: number | null
          excess_w5?: number | null
          filter_passes?: Json
          filter_refusal_reason?: string | null
          momentum_quintile?: number | null
          rank_score?: number | null
          run_id: string
          selected_for_entry?: boolean
          side: string
          study_cell_ref?: Json | null
          ticker: string
          tier?: string | null
        }
        Update: {
          argmax_window_days?: number | null
          as_of_date?: string
          created_at?: string
          days_to_nearest_earnings?: number | null
          drawdown_bucket?: number | null
          earnings_alias_used?: string | null
          event_id?: string
          excess_w1?: number | null
          excess_w2?: number | null
          excess_w3?: number | null
          excess_w4?: number | null
          excess_w5?: number | null
          filter_passes?: Json
          filter_refusal_reason?: string | null
          momentum_quintile?: number | null
          rank_score?: number | null
          run_id?: string
          selected_for_entry?: boolean
          side?: string
          study_cell_ref?: Json | null
          ticker?: string
          tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "overshoot_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "overshoot_detection_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      overshoot_lots: {
        Row: {
          avg_exit_price: number | null
          closed_at: string | null
          cohort_band: string | null
          cohort_cell_id: string | null
          cohort_drawdown_bucket: number | null
          cohort_entry_day_offset: number | null
          cost_basis: number
          created_at: string
          entry_ts: string
          exit_attempts: number
          expected_settlement_ts: string | null
          filled_qty: number
          lot_id: string
          operator_id: string
          qty: number
          realized_pnl_partial: number
          remaining_qty: number
          settlement_state: string
          side: string
          source_order_id: string | null
          status: string
          symbol: string
          tier: string | null
          tier_source_as_of_date: string | null
          tier_source_event_run_id: string | null
          updated_at: string
          w5_reallocation_ref: string | null
        }
        Insert: {
          avg_exit_price?: number | null
          closed_at?: string | null
          cohort_band?: string | null
          cohort_cell_id?: string | null
          cohort_drawdown_bucket?: number | null
          cohort_entry_day_offset?: number | null
          cost_basis: number
          created_at?: string
          entry_ts: string
          exit_attempts?: number
          expected_settlement_ts?: string | null
          filled_qty?: number
          lot_id?: string
          operator_id?: string
          qty: number
          realized_pnl_partial?: number
          remaining_qty?: number
          settlement_state?: string
          side: string
          source_order_id?: string | null
          status?: string
          symbol: string
          tier?: string | null
          tier_source_as_of_date?: string | null
          tier_source_event_run_id?: string | null
          updated_at?: string
          w5_reallocation_ref?: string | null
        }
        Update: {
          avg_exit_price?: number | null
          closed_at?: string | null
          cohort_band?: string | null
          cohort_cell_id?: string | null
          cohort_drawdown_bucket?: number | null
          cohort_entry_day_offset?: number | null
          cost_basis?: number
          created_at?: string
          entry_ts?: string
          exit_attempts?: number
          expected_settlement_ts?: string | null
          filled_qty?: number
          lot_id?: string
          operator_id?: string
          qty?: number
          realized_pnl_partial?: number
          remaining_qty?: number
          settlement_state?: string
          side?: string
          source_order_id?: string | null
          status?: string
          symbol?: string
          tier?: string | null
          tier_source_as_of_date?: string | null
          tier_source_event_run_id?: string | null
          updated_at?: string
          w5_reallocation_ref?: string | null
        }
        Relationships: []
      }
      overshoot_reconciliation_state: {
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
      overshoot_short_interest: {
        Row: {
          as_of_date: string
          computed_at: string
          dtc: number | null
          si_pct_float: number | null
          source_run_id: string | null
          ticker: string
        }
        Insert: {
          as_of_date: string
          computed_at?: string
          dtc?: number | null
          si_pct_float?: number | null
          source_run_id?: string | null
          ticker: string
        }
        Update: {
          as_of_date?: string
          computed_at?: string
          dtc?: number | null
          si_pct_float?: number | null
          source_run_id?: string | null
          ticker?: string
        }
        Relationships: []
      }
      overshoot_strategy_config: {
        Row: {
          account_key: string
          margin_multiplier: number
          strategy_allocation_pct: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_key: string
          margin_multiplier: number
          strategy_allocation_pct: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_key?: string
          margin_multiplier?: number
          strategy_allocation_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      overshoot_study_candidate_events: {
        Row: {
          alias_used: string | null
          created_at: string
          days_to_nearest_earnings: number | null
          drawdown_bucket: number | null
          event_date: string
          event_id: number
          excess_w1: number | null
          excess_w2: number | null
          excess_w3: number | null
          excess_w4: number | null
          excess_w5: number | null
          fwd_return_1d: number | null
          fwd_return_20d: number | null
          fwd_return_5d: number | null
          momentum_quintile: number | null
          move_pct: number
          run_id: string
          side: string
          ticker: string
          window_days: number
        }
        Insert: {
          alias_used?: string | null
          created_at?: string
          days_to_nearest_earnings?: number | null
          drawdown_bucket?: number | null
          event_date: string
          event_id?: number
          excess_w1?: number | null
          excess_w2?: number | null
          excess_w3?: number | null
          excess_w4?: number | null
          excess_w5?: number | null
          fwd_return_1d?: number | null
          fwd_return_20d?: number | null
          fwd_return_5d?: number | null
          momentum_quintile?: number | null
          move_pct: number
          run_id: string
          side: string
          ticker: string
          window_days: number
        }
        Update: {
          alias_used?: string | null
          created_at?: string
          days_to_nearest_earnings?: number | null
          drawdown_bucket?: number | null
          event_date?: string
          event_id?: number
          excess_w1?: number | null
          excess_w2?: number | null
          excess_w3?: number | null
          excess_w4?: number | null
          excess_w5?: number | null
          fwd_return_1d?: number | null
          fwd_return_20d?: number | null
          fwd_return_5d?: number | null
          momentum_quintile?: number | null
          move_pct?: number
          run_id?: string
          side?: string
          ticker?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "overshoot_study_candidate_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "overshoot_study_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      overshoot_study_cell_results: {
        Row: {
          arrival_count: number
          band: string
          created_at: string
          drawdown_bucket: number
          exclusion_width_days: number
          hit_rate_5d: number | null
          mean_fwd_return_1d: number | null
          mean_fwd_return_20d: number | null
          mean_fwd_return_5d: number | null
          median_fwd_return_5d: number | null
          momentum_quintile: number
          notes: Json | null
          p05_fwd_return_5d: number | null
          p10_fwd_return_5d: number | null
          p25_fwd_return_5d: number | null
          p50_fwd_return_5d: number | null
          p75_fwd_return_5d: number | null
          p90_fwd_return_5d: number | null
          p95_fwd_return_5d: number | null
          run_id: string
          side: string
          window_days: number
        }
        Insert: {
          arrival_count: number
          band: string
          created_at?: string
          drawdown_bucket: number
          exclusion_width_days: number
          hit_rate_5d?: number | null
          mean_fwd_return_1d?: number | null
          mean_fwd_return_20d?: number | null
          mean_fwd_return_5d?: number | null
          median_fwd_return_5d?: number | null
          momentum_quintile: number
          notes?: Json | null
          p05_fwd_return_5d?: number | null
          p10_fwd_return_5d?: number | null
          p25_fwd_return_5d?: number | null
          p50_fwd_return_5d?: number | null
          p75_fwd_return_5d?: number | null
          p90_fwd_return_5d?: number | null
          p95_fwd_return_5d?: number | null
          run_id: string
          side: string
          window_days: number
        }
        Update: {
          arrival_count?: number
          band?: string
          created_at?: string
          drawdown_bucket?: number
          exclusion_width_days?: number
          hit_rate_5d?: number | null
          mean_fwd_return_1d?: number | null
          mean_fwd_return_20d?: number | null
          mean_fwd_return_5d?: number | null
          median_fwd_return_5d?: number | null
          momentum_quintile?: number
          notes?: Json | null
          p05_fwd_return_5d?: number | null
          p10_fwd_return_5d?: number | null
          p25_fwd_return_5d?: number | null
          p50_fwd_return_5d?: number | null
          p75_fwd_return_5d?: number | null
          p90_fwd_return_5d?: number | null
          p95_fwd_return_5d?: number | null
          run_id?: string
          side?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "overshoot_study_cell_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "overshoot_study_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      overshoot_study_runs: {
        Row: {
          as_of: string
          bars_snapshot_max_date: string
          completed_at: string | null
          earnings_snapshot_max_date: string
          git_sha: string
          outcome: string
          param_grid: Json
          param_grid_hash: string
          performance_stamp: string
          return_basis: string
          run_id: string
          run_label: string
          short_filter_stamp: string
          slippage_haircut_bps_long: number
          slippage_haircut_bps_short: number
          started_at: string
          survivorship_stamp: string
        }
        Insert: {
          as_of: string
          bars_snapshot_max_date: string
          completed_at?: string | null
          earnings_snapshot_max_date: string
          git_sha: string
          outcome?: string
          param_grid: Json
          param_grid_hash: string
          performance_stamp: string
          return_basis: string
          run_id?: string
          run_label: string
          short_filter_stamp: string
          slippage_haircut_bps_long: number
          slippage_haircut_bps_short: number
          started_at?: string
          survivorship_stamp: string
        }
        Update: {
          as_of?: string
          bars_snapshot_max_date?: string
          completed_at?: string | null
          earnings_snapshot_max_date?: string
          git_sha?: string
          outcome?: string
          param_grid?: Json
          param_grid_hash?: string
          performance_stamp?: string
          return_basis?: string
          run_id?: string
          run_label?: string
          short_filter_stamp?: string
          slippage_haircut_bps_long?: number
          slippage_haircut_bps_short?: number
          started_at?: string
          survivorship_stamp?: string
        }
        Relationships: []
      }
      overshoot_target_positions: {
        Row: {
          computed_at: string
          rank_score: number | null
          run_id: string
          side: string
          target_notional: number
          target_shares: number
          ticker: string
          w5_reallocation_ref: string | null
        }
        Insert: {
          computed_at: string
          rank_score?: number | null
          run_id: string
          side: string
          target_notional: number
          target_shares: number
          ticker: string
          w5_reallocation_ref?: string | null
        }
        Update: {
          computed_at?: string
          rank_score?: number | null
          run_id?: string
          side?: string
          target_notional?: number
          target_shares?: number
          ticker?: string
          w5_reallocation_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "overshoot_target_positions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "overshoot_detection_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      overshoot_universe: {
        Row: {
          active: boolean
          added_as_of: string
          created_at: string
          source: string
          ticker: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          added_as_of: string
          created_at?: string
          source: string
          ticker: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          added_as_of?: string
          created_at?: string
          source?: string
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
      pead_consensus_observations: {
        Row: {
          as_of_date: string
          computed_at: string
          consensus_eps_avg: number
          eps_actual: number
          eps_high: number
          eps_low: number
          number_analysts: number
          operator_id: string
          report_period_date: string
          sigma_proxy: number
          signal_id: string
          sue: number
          ticker: string
          trading_days_since: number
        }
        Insert: {
          as_of_date: string
          computed_at: string
          consensus_eps_avg: number
          eps_actual: number
          eps_high: number
          eps_low: number
          number_analysts: number
          operator_id: string
          report_period_date: string
          sigma_proxy: number
          signal_id: string
          sue: number
          ticker: string
          trading_days_since: number
        }
        Update: {
          as_of_date?: string
          computed_at?: string
          consensus_eps_avg?: number
          eps_actual?: number
          eps_high?: number
          eps_low?: number
          number_analysts?: number
          operator_id?: string
          report_period_date?: string
          sigma_proxy?: number
          signal_id?: string
          sue?: number
          ticker?: string
          trading_days_since?: number
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
      reversal_ungated_observations: {
        Row: {
          as_of_date: string
          computed_at: string
          gate_decision: string
          operator_id: string
          raw_value: number | null
          signal_id: string
          ticker: string
        }
        Insert: {
          as_of_date: string
          computed_at: string
          gate_decision: string
          operator_id: string
          raw_value?: number | null
          signal_id: string
          ticker: string
        }
        Update: {
          as_of_date?: string
          computed_at?: string
          gate_decision?: string
          operator_id?: string
          raw_value?: number | null
          signal_id?: string
          ticker?: string
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
      short_etb_state_history: {
        Row: {
          etb: boolean
          observed_at: string
          operator_id: string
          recorded_at: string
          source: string
          symbol: string
        }
        Insert: {
          etb: boolean
          observed_at: string
          operator_id: string
          recorded_at?: string
          source: string
          symbol: string
        }
        Update: {
          etb?: boolean
          observed_at?: string
          operator_id?: string
          recorded_at?: string
          source?: string
          symbol?: string
        }
        Relationships: []
      }
      short_interest_alpha_shadow: {
        Row: {
          as_of_date: string
          computed_at: string
          gics_sector: string | null
          operator_id: string
          raw_value: number | null
          ticker: string
          variant: string
        }
        Insert: {
          as_of_date: string
          computed_at: string
          gics_sector?: string | null
          operator_id: string
          raw_value?: number | null
          ticker: string
          variant: string
        }
        Update: {
          as_of_date?: string
          computed_at?: string
          gics_sector?: string | null
          operator_id?: string
          raw_value?: number | null
          ticker?: string
          variant?: string
        }
        Relationships: []
      }
      short_interest_days_to_cover: {
        Row: {
          as_of_date: string
          latest_days_to_cover: number | null
          operator_id: string
          report_date: string
          ticker: string
          updated_at: string
        }
        Insert: {
          as_of_date: string
          latest_days_to_cover?: number | null
          operator_id: string
          report_date: string
          ticker: string
          updated_at?: string
        }
        Update: {
          as_of_date?: string
          latest_days_to_cover?: number | null
          operator_id?: string
          report_date?: string
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
      signal_compute_log: {
        Row: {
          as_of_date: string
          completed_at: string
          failure_reason: string | null
          gate_counts: Json | null
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
          gate_counts?: Json | null
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
          gate_counts?: Json | null
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
      signal_decay_log: {
        Row: {
          as_of_date: string
          by_status: Json | null
          completed_at: string
          distinct_tickers_fetched: number
          failure_reason: string | null
          observations_considered: number
          operator_id: string
          outcome: string
          rows_written: number
          run_id: string
          signals_considered: number
          started_at: string
        }
        Insert: {
          as_of_date: string
          by_status?: Json | null
          completed_at: string
          distinct_tickers_fetched?: number
          failure_reason?: string | null
          observations_considered?: number
          operator_id: string
          outcome: string
          rows_written?: number
          run_id?: string
          signals_considered?: number
          started_at: string
        }
        Update: {
          as_of_date?: string
          by_status?: Json | null
          completed_at?: string
          distinct_tickers_fetched?: number
          failure_reason?: string | null
          observations_considered?: number
          operator_id?: string
          outcome?: string
          rows_written?: number
          run_id?: string
          signals_considered?: number
          started_at?: string
        }
        Relationships: []
      }
      signal_decay_returns: {
        Row: {
          computed_at: string
          horizon_label: string
          next_open: number | null
          next_open_date: string | null
          notes: Json | null
          open_decay_return: number | null
          operator_id: string
          price_source: string
          price_source_status: string
          seed_as_of_date: string
          seed_close: number | null
          seed_close_date: string | null
          seed_value: number | null
          signal_id: string
          ticker: string
        }
        Insert: {
          computed_at: string
          horizon_label: string
          next_open?: number | null
          next_open_date?: string | null
          notes?: Json | null
          open_decay_return?: number | null
          operator_id: string
          price_source?: string
          price_source_status: string
          seed_as_of_date: string
          seed_close?: number | null
          seed_close_date?: string | null
          seed_value?: number | null
          signal_id: string
          ticker: string
        }
        Update: {
          computed_at?: string
          horizon_label?: string
          next_open?: number | null
          next_open_date?: string | null
          notes?: Json | null
          open_decay_return?: number | null
          operator_id?: string
          price_source?: string
          price_source_status?: string
          seed_as_of_date?: string
          seed_close?: number | null
          seed_close_date?: string | null
          seed_value?: number | null
          signal_id?: string
          ticker?: string
        }
        Relationships: []
      }
      signal_observations: {
        Row: {
          as_of_date: string
          carried_forward: boolean
          computed_at: string
          gics_sector: string | null
          is_present: boolean
          operator_id: string
          signal_id: string
          skip_reason: string | null
          ticker: string
          value: number | null
        }
        Insert: {
          as_of_date: string
          carried_forward?: boolean
          computed_at?: string
          gics_sector?: string | null
          is_present: boolean
          operator_id: string
          signal_id: string
          skip_reason?: string | null
          ticker: string
          value?: number | null
        }
        Update: {
          as_of_date?: string
          carried_forward?: boolean
          computed_at?: string
          gics_sector?: string | null
          is_present?: boolean
          operator_id?: string
          signal_id?: string
          skip_reason?: string | null
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
      wash_sale_events: {
        Row: {
          attached_to_lot_id: string | null
          block_until: string | null
          created_at: string
          disallowed_amount: number | null
          event_id: string
          exit_ts: string
          lot_ids_affected: string[]
          operator_id: string
          outcome: string
          realized_loss: number
          source_lot_ids: string[]
          status: string
          symbol: string
          updated_at: string
        }
        Insert: {
          attached_to_lot_id?: string | null
          block_until?: string | null
          created_at?: string
          disallowed_amount?: number | null
          event_id?: string
          exit_ts: string
          lot_ids_affected: string[]
          operator_id?: string
          outcome: string
          realized_loss: number
          source_lot_ids: string[]
          status: string
          symbol: string
          updated_at?: string
        }
        Update: {
          attached_to_lot_id?: string | null
          block_until?: string | null
          created_at?: string
          disallowed_amount?: number | null
          event_id?: string
          exit_ts?: string
          lot_ids_affected?: string[]
          operator_id?: string
          outcome?: string
          realized_loss?: number
          source_lot_ids?: string[]
          status?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wash_sale_events_attached_to_lot_id_fkey"
            columns: ["attached_to_lot_id"]
            isOneToOne: false
            referencedRelation: "longshort_lots"
            referencedColumns: ["lot_id"]
          },
        ]
      }
      wash_sale_pending_review: {
        Row: {
          broker_pnl: number | null
          context: string
          created_at: string
          flagged_ts: string
          internal_pnl: number
          operator_id: string
          pending_id: string
          resolution_event_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_lot_ids: string[]
          status: string
          symbol: string
          updated_at: string
          verify_outcome: string | null
        }
        Insert: {
          broker_pnl?: number | null
          context: string
          created_at?: string
          flagged_ts: string
          internal_pnl: number
          operator_id?: string
          pending_id?: string
          resolution_event_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_lot_ids: string[]
          status?: string
          symbol: string
          updated_at?: string
          verify_outcome?: string | null
        }
        Update: {
          broker_pnl?: number | null
          context?: string
          created_at?: string
          flagged_ts?: string
          internal_pnl?: number
          operator_id?: string
          pending_id?: string
          resolution_event_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_lot_ids?: string[]
          status?: string
          symbol?: string
          updated_at?: string
          verify_outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wash_sale_pending_review_resolution_fk"
            columns: ["operator_id", "resolution_event_id"]
            isOneToOne: false
            referencedRelation: "wash_sale_events"
            referencedColumns: ["operator_id", "event_id"]
          },
        ]
      }
    }
    Views: {
      analyst_backfill_coverage: {
        Row: {
          backfill_first_event: string | null
          backfill_last_event: string | null
          backfill_max_date: string | null
          backfill_min_date: string | null
          live_max_date: string | null
          live_min_date: string | null
          n_backfill: number | null
          n_live: number | null
          n_total: number | null
          ticker: string | null
        }
        Relationships: []
      }
      overshoot_dial_daily: {
        Row: {
          as_of_date: string | null
          band: string | null
          dd: number | null
          entry_date: string | null
          is_realized: boolean | null
          ladder_n: number | null
          ladder_rung: string | null
          lot_id: string | null
          mark: number | null
          mq: number | null
          p10_bps: number | null
          p50_bps: number | null
          p90_bps: number | null
          return_bps: number | null
          side: string | null
          symbol: string | null
          verdict: string | null
          win: number | null
        }
        Relationships: []
      }
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
      get_api_provider_freshness: {
        Args: never
        Returns: {
          freshness_source: string
          last_seen_at: string
          product_tier: string
          provider: string
        }[]
      }
      get_my_authorization_context: { Args: never; Returns: Json }
      has_permission: {
        Args: { _permission_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: { _role_key: string; _user_id: string }
        Returns: boolean
      }
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
      kill_switch_system_pause: {
        Args: {
          p_operator_id?: string
          p_reason: string
          p_source_ref: string
          p_strategy_key: string
        }
        Returns: Json
      }
      longshort_get_heal_date: { Args: never; Returns: string }
      overshoot_update_strategy_config: {
        Args: {
          p_account_key: string
          p_allocation_pct: number
          p_margin_multiplier: number
        }
        Returns: {
          account_key: string
          margin_multiplier: number
          strategy_allocation_pct: number
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "overshoot_strategy_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      promote_combiner_model: { Args: { p_model_id: string }; Returns: Json }
      purge_retired_combiner_artifacts: { Args: never; Returns: Json }
      rollback_combiner_model: { Args: { p_side: string }; Returns: Json }
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
