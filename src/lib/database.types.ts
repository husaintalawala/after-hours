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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      _bak_garbage_destinations_20260617: {
        Row: {
          address: string | null
          booking_url: string | null
          city: string | null
          confirmation_number: string | null
          country: string | null
          created_at: string | null
          date: string | null
          dedupe_key: string | null
          display_order: number | null
          duration_minutes: number | null
          guest_count: number | null
          id: string | null
          import_source_provider: string | null
          is_bookable: boolean | null
          latitude: number | null
          location_name: string | null
          longitude: number | null
          nights: number | null
          notes: string | null
          parent_step_id: string | null
          place_category: string | null
          place_id: string | null
          scheduled_at: string | null
          source: string | null
          spots: string | null
          step_number: number | null
          step_type: string | null
          title: string | null
          transport_mode: string | null
          trip_id: string | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          booking_url?: string | null
          city?: string | null
          confirmation_number?: string | null
          country?: string | null
          created_at?: string | null
          date?: string | null
          dedupe_key?: string | null
          display_order?: number | null
          duration_minutes?: number | null
          guest_count?: number | null
          id?: string | null
          import_source_provider?: string | null
          is_bookable?: boolean | null
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          nights?: number | null
          notes?: string | null
          parent_step_id?: string | null
          place_category?: string | null
          place_id?: string | null
          scheduled_at?: string | null
          source?: string | null
          spots?: string | null
          step_number?: number | null
          step_type?: string | null
          title?: string | null
          transport_mode?: string | null
          trip_id?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          booking_url?: string | null
          city?: string | null
          confirmation_number?: string | null
          country?: string | null
          created_at?: string | null
          date?: string | null
          dedupe_key?: string | null
          display_order?: number | null
          duration_minutes?: number | null
          guest_count?: number | null
          id?: string | null
          import_source_provider?: string | null
          is_bookable?: boolean | null
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          nights?: number | null
          notes?: string | null
          parent_step_id?: string | null
          place_category?: string | null
          place_id?: string | null
          scheduled_at?: string | null
          source?: string | null
          spots?: string | null
          step_number?: number | null
          step_type?: string | null
          title?: string | null
          transport_mode?: string | null
          trip_id?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      _expense_categories_snapshot_20260509: {
        Row: {
          category: string | null
          n: number | null
        }
        Insert: {
          category?: string | null
          n?: number | null
        }
        Update: {
          category?: string | null
          n?: number | null
        }
        Relationships: []
      }
      _expense_categories_snapshot_after_20260509: {
        Row: {
          category: string | null
          n: number | null
        }
        Insert: {
          category?: string | null
          n?: number | null
        }
        Update: {
          category?: string | null
          n?: number | null
        }
        Relationships: []
      }
      _expenses_cat_snapshot_20260610: {
        Row: {
          category: string | null
          n: number | null
        }
        Insert: {
          category?: string | null
          n?: number | null
        }
        Update: {
          category?: string | null
          n?: number | null
        }
        Relationships: []
      }
      _expenses_cat_snapshot_after_20260610: {
        Row: {
          category: string | null
          n: number | null
        }
        Insert: {
          category?: string | null
          n?: number | null
        }
        Update: {
          category?: string | null
          n?: number | null
        }
        Relationships: []
      }
      _expenses_r31_snapshot_20260611: {
        Row: {
          amount: number | null
          category: string | null
          category_overridden: boolean | null
          created_at: string | null
          currency: string | null
          destination_step_id: string | null
          expense_date: string | null
          id: string | null
          label: string | null
          source: string | null
          source_id: string | null
          subtitle: string | null
          trip_id: string | null
          user_id: string | null
          version: number | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          category_overridden?: boolean | null
          created_at?: string | null
          currency?: string | null
          destination_step_id?: string | null
          expense_date?: string | null
          id?: string | null
          label?: string | null
          source?: string | null
          source_id?: string | null
          subtitle?: string | null
          trip_id?: string | null
          user_id?: string | null
          version?: number | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          category_overridden?: boolean | null
          created_at?: string | null
          currency?: string | null
          destination_step_id?: string | null
          expense_date?: string | null
          id?: string | null
          label?: string | null
          source?: string | null
          source_id?: string | null
          subtitle?: string | null
          trip_id?: string | null
          user_id?: string | null
          version?: number | null
        }
        Relationships: []
      }
      _expenses_version_snapshot_20260611: {
        Row: {
          amount: number | null
          category: string | null
          category_overridden: boolean | null
          created_at: string | null
          currency: string | null
          destination_step_id: string | null
          expense_date: string | null
          id: string | null
          label: string | null
          source: string | null
          source_id: string | null
          subtitle: string | null
          trip_id: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          category_overridden?: boolean | null
          created_at?: string | null
          currency?: string | null
          destination_step_id?: string | null
          expense_date?: string | null
          id?: string | null
          label?: string | null
          source?: string | null
          source_id?: string | null
          subtitle?: string | null
          trip_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          category_overridden?: boolean | null
          created_at?: string | null
          currency?: string | null
          destination_step_id?: string | null
          expense_date?: string | null
          id?: string | null
          label?: string | null
          source?: string | null
          source_id?: string | null
          subtitle?: string | null
          trip_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      _households_snapshot_20260611: {
        Row: {
          created_at: string | null
          id: string | null
          member_user_ids: string[] | null
          name: string | null
          trip_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          member_user_ids?: string[] | null
          name?: string | null
          trip_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          member_user_ids?: string[] | null
          name?: string | null
          trip_id?: string | null
        }
        Relationships: []
      }
      ai_feedback: {
        Row: {
          created_at: string
          id: string
          message_id: string | null
          message_text: string | null
          signal: string
          trip_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id?: string | null
          message_text?: string | null
          signal: string
          trip_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string | null
          message_text?: string | null
          signal?: string
          trip_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_op_rejections: {
        Row: {
          created_at: string
          function: string
          id: string
          op: Json
          reason: string
          trip_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          function: string
          id?: string
          op: Json
          reason: string
          trip_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          function?: string
          id?: string
          op?: Json
          reason?: string
          trip_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_resolution_log: {
        Row: {
          card_title: string | null
          created_at: string
          expected_name: string | null
          id: string
          matched: boolean | null
          place_query: string | null
          resolved_name: string | null
          user_id: string
        }
        Insert: {
          card_title?: string | null
          created_at?: string
          expected_name?: string | null
          id?: string
          matched?: boolean | null
          place_query?: string | null
          resolved_name?: string | null
          user_id: string
        }
        Update: {
          card_title?: string | null
          created_at?: string
          expected_name?: string | null
          id?: string
          matched?: boolean | null
          place_query?: string | null
          resolved_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      booking_import_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          current_phase: string | null
          error_code: string | null
          found_counts: Json
          id: string
          message: string | null
          progress: number
          source: string
          source_status: Json
          started_at: string
          status: string
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_phase?: string | null
          error_code?: string | null
          found_counts?: Json
          id?: string
          message?: string | null
          progress?: number
          source: string
          source_status?: Json
          started_at?: string
          status?: string
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_phase?: string | null
          error_code?: string | null
          found_counts?: Json
          id?: string
          message?: string | null
          progress?: number
          source?: string
          source_status?: Json
          started_at?: string
          status?: string
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_sessions: {
        Row: {
          anchor_id: string | null
          anchor_label: string | null
          anchor_type: string
          created_at: string
          id: string
          last_message_at: string
          summary: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor_id?: string | null
          anchor_label?: string | null
          anchor_type: string
          created_at?: string
          id?: string
          last_message_at?: string
          summary?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor_id?: string | null
          anchor_label?: string | null
          anchor_type?: string
          created_at?: string
          id?: string
          last_message_at?: string
          summary?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_suggestion_outcome: {
        Row: {
          created_at: string
          id: string
          outcome: string
          suggestion: string
          tab: string
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          outcome: string
          suggestion: string
          tab: string
          trip_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          outcome?: string
          suggestion?: string
          tab?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_suggestion_outcome_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string | null
          id: string
          parent_comment_id: string | null
          step_id: string | null
          trip_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          parent_comment_id?: string | null
          step_id?: string | null
          trip_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          parent_comment_id?: string | null
          step_id?: string | null
          trip_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_day_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_rates: {
        Row: {
          country: string
          daily_activities_usd: number
          daily_food_usd: number
          nightly_stay_usd: number
          updated_at: string
        }
        Insert: {
          country: string
          daily_activities_usd: number
          daily_food_usd: number
          nightly_stay_usd: number
          updated_at?: string
        }
        Update: {
          country?: string
          daily_activities_usd?: number
          daily_food_usd?: number
          nightly_stay_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      dismissed_loose_ends: {
        Row: {
          dismissed_at: string
          id: string
          loose_end_key: string
          trip_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          id?: string
          loose_end_key: string
          trip_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          id?: string
          loose_end_key?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: []
      }
      email_aliases: {
        Row: {
          created_at: string
          disabled_at: string | null
          email_address: string
          id: string
          is_active: boolean
          slug: string
          token: string
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          email_address: string
          id?: string
          is_active?: boolean
          slug: string
          token: string
          trip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          email_address?: string
          id?: string
          is_active?: boolean
          slug?: string
          token?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_aliases_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_aliases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_line_items: {
        Row: {
          amount_minor: number
          created_at: string
          expense_id: string
          id: string
          label: string
          participant_household_ids: string[]
        }
        Insert: {
          amount_minor: number
          created_at?: string
          expense_id: string
          id?: string
          label: string
          participant_household_ids: string[]
        }
        Update: {
          amount_minor?: number
          created_at?: string
          expense_id?: string
          id?: string
          label?: string
          participant_household_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "expense_line_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_splits: {
        Row: {
          expense_id: string
          household_id: string
          share_minor: number
        }
        Insert: {
          expense_id: string
          household_id: string
          share_minor: number
        }
        Update: {
          expense_id?: string
          household_id?: string
          share_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_splits_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          category_overridden: boolean
          created_at: string
          currency: string
          destination_step_id: string | null
          expense_date: string
          id: string
          label: string
          payer_user_id: string | null
          receipt_url: string | null
          source: string
          source_id: string | null
          split_household_ids: string[] | null
          split_mode: string
          subtitle: string | null
          trip_id: string
          user_id: string
          version: number
        }
        Insert: {
          amount: number
          category: string
          category_overridden?: boolean
          created_at?: string
          currency?: string
          destination_step_id?: string | null
          expense_date?: string
          id?: string
          label: string
          payer_user_id?: string | null
          receipt_url?: string | null
          source?: string
          source_id?: string | null
          split_household_ids?: string[] | null
          split_mode?: string
          subtitle?: string | null
          trip_id: string
          user_id: string
          version?: number
        }
        Update: {
          amount?: number
          category?: string
          category_overridden?: boolean
          created_at?: string
          currency?: string
          destination_step_id?: string | null
          expense_date?: string
          id?: string
          label?: string
          payer_user_id?: string | null
          receipt_url?: string | null
          source?: string
          source_id?: string | null
          split_household_ids?: string[] | null
          split_mode?: string
          subtitle?: string | null
          trip_id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "expenses_destination_step_id_fkey"
            columns: ["destination_step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explore_city_content: {
        Row: {
          city_name: string
          content: Json
          country: string
          created_at: string | null
        }
        Insert: {
          city_name: string
          content: Json
          country: string
          created_at?: string | null
        }
        Update: {
          city_name?: string
          content?: Json
          country?: string
          created_at?: string | null
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_deltas: {
        Row: {
          actual_usd: number
          captured_at: string
          category: string
          country: string | null
          estimated_usd: number
          id: string
          trip_id: string
          user_id: string
        }
        Insert: {
          actual_usd: number
          captured_at?: string
          category: string
          country?: string | null
          estimated_usd: number
          id?: string
          trip_id: string
          user_id: string
        }
        Update: {
          actual_usd?: number
          captured_at?: string
          category?: string
          country?: string | null
          estimated_usd?: number
          id?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: []
      }
      gear_rules: {
        Row: {
          category: string
          created_at: string
          enabled: boolean
          id: string
          item_name: string
          phase: string
          quantity_basis: string | null
          reason_template: string
          trigger_type: string
          trigger_value: string
        }
        Insert: {
          category: string
          created_at?: string
          enabled?: boolean
          id?: string
          item_name: string
          phase?: string
          quantity_basis?: string | null
          reason_template: string
          trigger_type: string
          trigger_value: string
        }
        Update: {
          category?: string
          created_at?: string
          enabled?: boolean
          id?: string
          item_name?: string
          phase?: string
          quantity_basis?: string | null
          reason_template?: string
          trigger_type?: string
          trigger_value?: string
        }
        Relationships: []
      }
      households: {
        Row: {
          created_at: string
          id: string
          member_user_ids: string[]
          name: string | null
          trip_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_user_ids: string[]
          name?: string | null
          trip_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_user_ids?: string[]
          name?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "households_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          segments_applied: number
          segments_matched: number
          segments_total: number
          source: string
          status: string
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          segments_applied?: number
          segments_matched?: number
          segments_total?: number
          source: string
          status?: string
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          segments_applied?: number
          segments_matched?: number
          segments_total?: number
          source?: string
          status?: string
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_sources: {
        Row: {
          created_at: string
          id: string
          last_scan_at: string | null
          metadata: Json
          provider: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_scan_at?: string | null
          metadata?: Json
          provider: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_scan_at?: string | null
          metadata?: Json
          provider?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_sources_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_emails: {
        Row: {
          body_html_length: number | null
          body_text_length: number | null
          created_at: string
          email_fingerprint: string | null
          from_email: string | null
          html_body: string | null
          id: string
          parse_error: string | null
          parse_status: string
          parser_input_preview: string | null
          raw_download_url: string | null
          received_at: string | null
          resend_email_id: string | null
          subject: string | null
          text_body: string | null
          to_email: string
          trip_id: string | null
          user_id: string | null
        }
        Insert: {
          body_html_length?: number | null
          body_text_length?: number | null
          created_at?: string
          email_fingerprint?: string | null
          from_email?: string | null
          html_body?: string | null
          id?: string
          parse_error?: string | null
          parse_status?: string
          parser_input_preview?: string | null
          raw_download_url?: string | null
          received_at?: string | null
          resend_email_id?: string | null
          subject?: string | null
          text_body?: string | null
          to_email: string
          trip_id?: string | null
          user_id?: string | null
        }
        Update: {
          body_html_length?: number | null
          body_text_length?: number | null
          created_at?: string
          email_fingerprint?: string | null
          from_email?: string | null
          html_body?: string | null
          id?: string
          parse_error?: string | null
          parse_status?: string
          parser_input_preview?: string | null
          raw_download_url?: string | null
          received_at?: string | null
          resend_email_id?: string | null
          subject?: string | null
          text_body?: string | null
          to_email?: string
          trip_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_emails_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_emails_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_apply_audit: {
        Row: {
          applied_at: string
          error_message: string | null
          id: string
          operation: Json
          result: string
          suggestion_id: string
          trip_id: string
          user_id: string
        }
        Insert: {
          applied_at?: string
          error_message?: string | null
          id?: string
          operation: Json
          result: string
          suggestion_id: string
          trip_id: string
          user_id: string
        }
        Update: {
          applied_at?: string
          error_message?: string | null
          id?: string
          operation?: Json
          result?: string
          suggestion_id?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: []
      }
      itinerary_refine_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          current_phase: string | null
          error_code: string | null
          id: string
          progress: number
          response_json: Json | null
          review_comparison: Json | null
          review_subtitle: string | null
          review_take: Json | null
          review_title: string | null
          started_at: string
          status: string
          suggestion_count: number
          tasks: Json
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_phase?: string | null
          error_code?: string | null
          id?: string
          progress?: number
          response_json?: Json | null
          review_comparison?: Json | null
          review_subtitle?: string | null
          review_take?: Json | null
          review_title?: string | null
          started_at?: string
          status?: string
          suggestion_count?: number
          tasks?: Json
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_phase?: string | null
          error_code?: string | null
          id?: string
          progress?: number
          response_json?: Json | null
          review_comparison?: Json | null
          review_subtitle?: string | null
          review_take?: Json | null
          review_title?: string | null
          started_at?: string
          status?: string
          suggestion_count?: number
          tasks?: Json
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      itinerary_suggestions: {
        Row: {
          after_snapshot: Json
          applied_at: string | null
          before_snapshot: Json
          confidence: number | null
          created_at: string
          day_id: string | null
          destination_id: string | null
          error_message: string | null
          id: string
          impact: Json
          is_risky: boolean
          is_selected_default: boolean
          operations: Json
          reason: string | null
          risk_reason: string | null
          session_id: string
          sort_order: number
          status: string
          suggestion_type: string
          summary: string | null
          title: string
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          after_snapshot?: Json
          applied_at?: string | null
          before_snapshot?: Json
          confidence?: number | null
          created_at?: string
          day_id?: string | null
          destination_id?: string | null
          error_message?: string | null
          id?: string
          impact?: Json
          is_risky?: boolean
          is_selected_default?: boolean
          operations?: Json
          reason?: string | null
          risk_reason?: string | null
          session_id: string
          sort_order?: number
          status?: string
          suggestion_type: string
          summary?: string | null
          title: string
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          after_snapshot?: Json
          applied_at?: string | null
          before_snapshot?: Json
          confidence?: number | null
          created_at?: string
          day_id?: string | null
          destination_id?: string | null
          error_message?: string | null
          id?: string
          impact?: Json
          is_risky?: boolean
          is_selected_default?: boolean
          operations?: Json
          reason?: string | null
          risk_reason?: string | null
          session_id?: string
          sort_order?: number
          status?: string
          suggestion_type?: string
          summary?: string | null
          title?: string
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kit_bags: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          sort_order: number
          trip_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
          trip_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kit_bags_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      kit_item_checks: {
        Row: {
          item_id: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          item_id: string
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          item_id?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kit_item_checks_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "kit_items"
            referencedColumns: ["id"]
          },
        ]
      }
      kit_items: {
        Row: {
          assignee_user_id: string | null
          bag_id: string | null
          category: string
          claimed_as_household: boolean
          claimed_by: string | null
          created_at: string
          id: string
          phase: string
          quantity: number
          quantity_basis: string | null
          reason: string | null
          source: string
          source_step_id: string | null
          state: string
          title: string
          trip_id: string
          updated_at: string
          used: boolean | null
          verified_at: string | null
          verify_due: string | null
          version: number
          wakes_at: string | null
        }
        Insert: {
          assignee_user_id?: string | null
          bag_id?: string | null
          category?: string
          claimed_as_household?: boolean
          claimed_by?: string | null
          created_at?: string
          id?: string
          phase?: string
          quantity?: number
          quantity_basis?: string | null
          reason?: string | null
          source?: string
          source_step_id?: string | null
          state?: string
          title: string
          trip_id: string
          updated_at?: string
          used?: boolean | null
          verified_at?: string | null
          verify_due?: string | null
          version?: number
          wakes_at?: string | null
        }
        Update: {
          assignee_user_id?: string | null
          bag_id?: string | null
          category?: string
          claimed_as_household?: boolean
          claimed_by?: string | null
          created_at?: string
          id?: string
          phase?: string
          quantity?: number
          quantity_basis?: string | null
          reason?: string | null
          source?: string
          source_step_id?: string | null
          state?: string
          title?: string
          trip_id?: string
          updated_at?: string
          used?: boolean | null
          verified_at?: string | null
          verify_due?: string | null
          version?: number
          wakes_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kit_items_bag_id_fkey"
            columns: ["bag_id"]
            isOneToOne: false
            referencedRelation: "kit_bags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kit_items_source_step_id_fkey"
            columns: ["source_step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kit_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      kit_items_snapshot_20260611_b1: {
        Row: {
          assignee_user_id: string | null
          bag: string | null
          category: string | null
          claimed_as_household: boolean | null
          claimed_by: string | null
          created_at: string | null
          id: string | null
          phase: string | null
          quantity: number | null
          quantity_basis: string | null
          reason: string | null
          source: string | null
          source_step_id: string | null
          state: string | null
          title: string | null
          trip_id: string | null
          updated_at: string | null
          used: boolean | null
          verified_at: string | null
          verify_due: string | null
          version: number | null
          wakes_at: string | null
        }
        Insert: {
          assignee_user_id?: string | null
          bag?: string | null
          category?: string | null
          claimed_as_household?: boolean | null
          claimed_by?: string | null
          created_at?: string | null
          id?: string | null
          phase?: string | null
          quantity?: number | null
          quantity_basis?: string | null
          reason?: string | null
          source?: string | null
          source_step_id?: string | null
          state?: string | null
          title?: string | null
          trip_id?: string | null
          updated_at?: string | null
          used?: boolean | null
          verified_at?: string | null
          verify_due?: string | null
          version?: number | null
          wakes_at?: string | null
        }
        Update: {
          assignee_user_id?: string | null
          bag?: string | null
          category?: string | null
          claimed_as_household?: boolean | null
          claimed_by?: string | null
          created_at?: string | null
          id?: string | null
          phase?: string | null
          quantity?: number | null
          quantity_basis?: string | null
          reason?: string | null
          source?: string | null
          source_step_id?: string | null
          state?: string | null
          title?: string | null
          trip_id?: string | null
          updated_at?: string | null
          used?: boolean | null
          verified_at?: string | null
          verify_due?: string | null
          version?: number | null
          wakes_at?: string | null
        }
        Relationships: []
      }
      kit_lists: {
        Row: {
          category: string
          color: number | null
          created_at: string
          id: string
          sort_order: number
          symbol: string | null
          title: string
          trip_id: string
          type: string
        }
        Insert: {
          category: string
          color?: number | null
          created_at?: string
          id?: string
          sort_order?: number
          symbol?: string | null
          title: string
          trip_id: string
          type?: string
        }
        Update: {
          category?: string
          color?: number | null
          created_at?: string
          id?: string
          sort_order?: number
          symbol?: string | null
          title?: string
          trip_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "kit_lists_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      kit_lists_snapshot_20260611_b1: {
        Row: {
          category: string | null
          created_at: string | null
          id: string | null
          sort_order: number | null
          symbol: string | null
          title: string | null
          trip_id: string | null
          type: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string | null
          sort_order?: number | null
          symbol?: string | null
          title?: string | null
          trip_id?: string | null
          type?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string | null
          sort_order?: number | null
          symbol?: string | null
          title?: string | null
          trip_id?: string | null
          type?: string | null
        }
        Relationships: []
      }
      likes: {
        Row: {
          created_at: string | null
          id: string
          step_id: string | null
          trip_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          step_id?: string | null
          trip_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          step_id?: string | null
          trip_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_day_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          id: string
          size_bytes: number | null
          step_id: string | null
          thumbnail_url: string | null
          trip_id: string
          type: string | null
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          size_bytes?: number | null
          step_id?: string | null
          thumbnail_url?: string | null
          trip_id: string
          type?: string | null
          url: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          size_bytes?: number | null
          step_id?: string | null
          thumbnail_url?: string | null
          trip_id?: string
          type?: string | null
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string
          comment_id: string | null
          created_at: string | null
          id: string
          read: boolean | null
          trip_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          comment_id?: string | null
          created_at?: string | null
          id?: string
          read?: boolean | null
          trip_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string
          comment_id?: string | null
          created_at?: string | null
          id?: string
          read?: boolean | null
          trip_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parsed_reservations: {
        Row: {
          batch_id: string | null
          category: string
          confidence: number
          created_at: string
          created_object_id: string | null
          created_object_type: string | null
          destination_id: string | null
          email_fingerprint: string | null
          id: string
          inbound_email_id: string | null
          parsed_json: Json
          resolved_at: string | null
          status: string
          trip_id: string
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          category: string
          confidence?: number
          created_at?: string
          created_object_id?: string | null
          created_object_type?: string | null
          destination_id?: string | null
          email_fingerprint?: string | null
          id?: string
          inbound_email_id?: string | null
          parsed_json?: Json
          resolved_at?: string | null
          status?: string
          trip_id: string
          user_id: string
        }
        Update: {
          batch_id?: string | null
          category?: string
          confidence?: number
          created_at?: string
          created_object_id?: string | null
          created_object_type?: string | null
          destination_id?: string | null
          email_fingerprint?: string | null
          id?: string
          inbound_email_id?: string | null
          parsed_json?: Json
          resolved_at?: string | null
          status?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parsed_reservations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parsed_reservations_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parsed_reservations_inbound_email_id_fkey"
            columns: ["inbound_email_id"]
            isOneToOne: false
            referencedRelation: "inbound_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parsed_reservations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parsed_reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      place_query_cache: {
        Row: {
          created_at: string
          destination_key: string
          normalized_query: string
          place_ids: string[]
          refreshed_at: string
        }
        Insert: {
          created_at?: string
          destination_key?: string
          normalized_query: string
          place_ids?: string[]
          refreshed_at?: string
        }
        Update: {
          created_at?: string
          destination_key?: string
          normalized_query?: string
          place_ids?: string[]
          refreshed_at?: string
        }
        Relationships: []
      }
      places: {
        Row: {
          city: string | null
          country: string | null
          first_seen_at: string
          formatted_address: string | null
          google_data: Json | null
          hero_image_attribution: string | null
          hero_image_confidence: number | null
          hero_image_refreshed_at: string | null
          hero_image_source: string | null
          hero_image_url: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          normalized_name: string | null
          photo_ref: string | null
          price_level: string | null
          primary_type: string | null
          rating: number | null
          refreshed_at: string
          review_count: number | null
          types: string[] | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          first_seen_at?: string
          formatted_address?: string | null
          google_data?: Json | null
          hero_image_attribution?: string | null
          hero_image_confidence?: number | null
          hero_image_refreshed_at?: string | null
          hero_image_source?: string | null
          hero_image_url?: string | null
          id: string
          latitude?: number | null
          longitude?: number | null
          name: string
          normalized_name?: string | null
          photo_ref?: string | null
          price_level?: string | null
          primary_type?: string | null
          rating?: number | null
          refreshed_at?: string
          review_count?: number | null
          types?: string[] | null
        }
        Update: {
          city?: string | null
          country?: string | null
          first_seen_at?: string
          formatted_address?: string | null
          google_data?: Json | null
          hero_image_attribution?: string | null
          hero_image_confidence?: number | null
          hero_image_refreshed_at?: string | null
          hero_image_source?: string | null
          hero_image_url?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          normalized_name?: string | null
          photo_ref?: string | null
          price_level?: string | null
          primary_type?: string | null
          rating?: number | null
          refreshed_at?: string
          review_count?: number | null
          types?: string[] | null
        }
        Relationships: []
      }
      plaid_accounts: {
        Row: {
          created_at: string
          id: string
          is_sync_eligible: boolean | null
          iso_currency_code: string | null
          item_id: string
          mask: string | null
          name: string
          plaid_account_id: string
          subtype: string | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_sync_eligible?: boolean | null
          iso_currency_code?: string | null
          item_id: string
          mask?: string | null
          name: string
          plaid_account_id: string
          subtype?: string | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_sync_eligible?: boolean | null
          iso_currency_code?: string | null
          item_id?: string
          mask?: string | null
          name?: string
          plaid_account_id?: string
          subtype?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaid_accounts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plaid_items"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_items: {
        Row: {
          access_token_enc: string | null
          created_at: string
          cursor: string | null
          id: string
          institution_name: string | null
          last_error: string | null
          last_synced_at: string | null
          plaid_institution_id: string | null
          plaid_item_id: string
          status: string
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          created_at?: string
          cursor?: string | null
          id?: string
          institution_name?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          plaid_institution_id?: string | null
          plaid_item_id: string
          status?: string
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          created_at?: string
          cursor?: string | null
          id?: string
          institution_name?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          plaid_institution_id?: string | null
          plaid_item_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaid_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_transactions: {
        Row: {
          account_id: string
          amount: number
          authorized_date: string | null
          candidate_for_trip_id: string | null
          date: string
          destination_step_id: string | null
          dismissed_at: string | null
          drift_category: string | null
          effective_date: string | null
          expense_id: string | null
          id: string
          imported_at: string
          is_booking_candidate: boolean
          iso_currency_code: string | null
          item_id: string
          location_city: string | null
          location_country: string | null
          location_region: string | null
          merchant_name: string | null
          name: string | null
          needs_review: boolean
          payment_channel: string | null
          pending: boolean
          pfc_confidence: string | null
          pfc_detailed: string | null
          pfc_primary: string | null
          plaid_transaction_id: string
          raw: Json
          removed_at: string | null
          trip_id: string | null
          unofficial_currency_code: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          authorized_date?: string | null
          candidate_for_trip_id?: string | null
          date: string
          destination_step_id?: string | null
          dismissed_at?: string | null
          drift_category?: string | null
          effective_date?: string | null
          expense_id?: string | null
          id?: string
          imported_at?: string
          is_booking_candidate?: boolean
          iso_currency_code?: string | null
          item_id: string
          location_city?: string | null
          location_country?: string | null
          location_region?: string | null
          merchant_name?: string | null
          name?: string | null
          needs_review?: boolean
          payment_channel?: string | null
          pending?: boolean
          pfc_confidence?: string | null
          pfc_detailed?: string | null
          pfc_primary?: string | null
          plaid_transaction_id: string
          raw: Json
          removed_at?: string | null
          trip_id?: string | null
          unofficial_currency_code?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          authorized_date?: string | null
          candidate_for_trip_id?: string | null
          date?: string
          destination_step_id?: string | null
          dismissed_at?: string | null
          drift_category?: string | null
          effective_date?: string | null
          expense_id?: string | null
          id?: string
          imported_at?: string
          is_booking_candidate?: boolean
          iso_currency_code?: string | null
          item_id?: string
          location_city?: string | null
          location_country?: string | null
          location_region?: string | null
          merchant_name?: string | null
          name?: string | null
          needs_review?: boolean
          payment_channel?: string | null
          pending?: boolean
          pfc_confidence?: string | null
          pfc_detailed?: string | null
          pfc_primary?: string | null
          plaid_transaction_id?: string
          raw?: Json
          removed_at?: string | null
          trip_id?: string | null
          unofficial_currency_code?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaid_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "plaid_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaid_transactions_candidate_for_trip_id_fkey"
            columns: ["candidate_for_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaid_transactions_destination_step_id_fkey"
            columns: ["destination_step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaid_transactions_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaid_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plaid_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaid_transactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaid_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prefetch_log: {
        Row: {
          destination_lat: number | null
          destination_lng: number | null
          destination_name: string
          error: string | null
          id: string
          last_prefetched_at: string
          result_count: number
        }
        Insert: {
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name: string
          error?: string | null
          id?: string
          last_prefetched_at?: string
          result_count?: number
        }
        Update: {
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string
          error?: string | null
          id?: string
          last_prefetched_at?: string
          result_count?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          cashapp_cashtag: string | null
          created_at: string | null
          deleted_at: string | null
          display_name: string | null
          id: string
          is_deleted: boolean | null
          paypal_me: string | null
          plaid_enabled: boolean
          updated_at: string | null
          username: string | null
          venmo_handle: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          cashapp_cashtag?: string | null
          created_at?: string | null
          deleted_at?: string | null
          display_name?: string | null
          id: string
          is_deleted?: boolean | null
          paypal_me?: string | null
          plaid_enabled?: boolean
          updated_at?: string | null
          username?: string | null
          venmo_handle?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          cashapp_cashtag?: string | null
          created_at?: string | null
          deleted_at?: string | null
          display_name?: string | null
          id?: string
          is_deleted?: boolean | null
          paypal_me?: string | null
          plaid_enabled?: boolean
          updated_at?: string | null
          username?: string | null
          venmo_handle?: string | null
          website?: string | null
        }
        Relationships: []
      }
      reservation_segments: {
        Row: {
          address: string | null
          applied_at: string | null
          applied_object_id: string | null
          applied_object_type: string | null
          category: string
          confirmation_number: string | null
          cost: number | null
          created_at: string
          currency: string | null
          dedupe_key: string | null
          destination_code: string | null
          destination_name: string | null
          ends_at: string | null
          guest_count: number | null
          id: string
          match_confidence: number
          match_day_date: string | null
          match_destination_id: string | null
          match_label: string | null
          match_route_leg_id: string | null
          needs_review: boolean
          origin_code: string | null
          origin_name: string | null
          parsed_reservation_id: string
          raw_evidence: Json | null
          source_provider: string | null
          starts_at: string | null
          status: string
          title: string | null
          trip_id: string
          user_id: string
        }
        Insert: {
          address?: string | null
          applied_at?: string | null
          applied_object_id?: string | null
          applied_object_type?: string | null
          category: string
          confirmation_number?: string | null
          cost?: number | null
          created_at?: string
          currency?: string | null
          dedupe_key?: string | null
          destination_code?: string | null
          destination_name?: string | null
          ends_at?: string | null
          guest_count?: number | null
          id?: string
          match_confidence?: number
          match_day_date?: string | null
          match_destination_id?: string | null
          match_label?: string | null
          match_route_leg_id?: string | null
          needs_review?: boolean
          origin_code?: string | null
          origin_name?: string | null
          parsed_reservation_id: string
          raw_evidence?: Json | null
          source_provider?: string | null
          starts_at?: string | null
          status?: string
          title?: string | null
          trip_id: string
          user_id: string
        }
        Update: {
          address?: string | null
          applied_at?: string | null
          applied_object_id?: string | null
          applied_object_type?: string | null
          category?: string
          confirmation_number?: string | null
          cost?: number | null
          created_at?: string
          currency?: string | null
          dedupe_key?: string | null
          destination_code?: string | null
          destination_name?: string | null
          ends_at?: string | null
          guest_count?: number | null
          id?: string
          match_confidence?: number
          match_day_date?: string | null
          match_destination_id?: string | null
          match_label?: string | null
          match_route_leg_id?: string | null
          needs_review?: boolean
          origin_code?: string | null
          origin_name?: string | null
          parsed_reservation_id?: string
          raw_evidence?: Json | null
          source_provider?: string | null
          starts_at?: string | null
          status?: string
          title?: string | null
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_segments_match_destination_id_fkey"
            columns: ["match_destination_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_segments_match_route_leg_id_fkey"
            columns: ["match_route_leg_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_segments_parsed_reservation_id_fkey"
            columns: ["parsed_reservation_id"]
            isOneToOne: false
            referencedRelation: "parsed_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_segments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_segments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_places: {
        Row: {
          address: string | null
          category: string | null
          country: string | null
          created_at: string
          destination_name: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          note: string | null
          photo_ref: string | null
          place_id: string | null
          price_level: string | null
          primary_type: string | null
          rating: number | null
          source: string | null
          trip_id: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          country?: string | null
          created_at?: string
          destination_name?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          note?: string | null
          photo_ref?: string | null
          place_id?: string | null
          price_level?: string | null
          primary_type?: string | null
          rating?: number | null
          source?: string | null
          trip_id?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          category?: string | null
          country?: string | null
          created_at?: string
          destination_name?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          note?: string | null
          photo_ref?: string | null
          place_id?: string | null
          price_level?: string | null
          primary_type?: string | null
          rating?: number | null
          source?: string | null
          trip_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_places_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount_minor: number
          created_at: string
          created_by: string
          from_household: string
          id: string
          rail: string
          status: string
          to_household: string
          trip_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          created_by: string
          from_household: string
          id?: string
          rail: string
          status?: string
          to_household: string
          trip_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          created_by?: string
          from_household?: string
          id?: string
          rail?: string
          status?: string
          to_household?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_from_household_fkey"
            columns: ["from_household"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_to_household_fkey"
            columns: ["to_household"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      steps: {
        Row: {
          address: string | null
          author_id: string | null
          booking_url: string | null
          city: string | null
          confirmation_number: string | null
          country: string | null
          created_at: string | null
          date: string
          dedupe_key: string | null
          display_order: number | null
          duration_minutes: number | null
          guest_count: number | null
          id: string
          import_source_provider: string | null
          is_bookable: boolean | null
          latitude: number | null
          location_name: string | null
          longitude: number | null
          nights: number
          notes: string | null
          parent_step_id: string | null
          place_category: string | null
          place_id: string | null
          scheduled_at: string | null
          source: string | null
          spots: string | null
          step_number: number | null
          step_type: string | null
          title: string | null
          transport_mode: string | null
          trip_id: string | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          author_id?: string | null
          booking_url?: string | null
          city?: string | null
          confirmation_number?: string | null
          country?: string | null
          created_at?: string | null
          date: string
          dedupe_key?: string | null
          display_order?: number | null
          duration_minutes?: number | null
          guest_count?: number | null
          id?: string
          import_source_provider?: string | null
          is_bookable?: boolean | null
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          nights?: number
          notes?: string | null
          parent_step_id?: string | null
          place_category?: string | null
          place_id?: string | null
          scheduled_at?: string | null
          source?: string | null
          spots?: string | null
          step_number?: number | null
          step_type?: string | null
          title?: string | null
          transport_mode?: string | null
          trip_id?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          author_id?: string | null
          booking_url?: string | null
          city?: string | null
          confirmation_number?: string | null
          country?: string | null
          created_at?: string | null
          date?: string
          dedupe_key?: string | null
          display_order?: number | null
          duration_minutes?: number | null
          guest_count?: number | null
          id?: string
          import_source_provider?: string | null
          is_bookable?: boolean | null
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          nights?: number
          notes?: string | null
          parent_step_id?: string | null
          place_category?: string | null
          place_id?: string | null
          scheduled_at?: string | null
          source?: string | null
          spots?: string | null
          step_number?: number | null
          step_type?: string | null
          title?: string | null
          transport_mode?: string | null
          trip_id?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "days_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steps_parent_step_id_fkey"
            columns: ["parent_step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_bookings: {
        Row: {
          arrival_at: string | null
          arrival_code: string | null
          arrival_location: string | null
          attachment_url: string | null
          booking_url: string | null
          confirmation_number: string | null
          cost: number | null
          created_at: string
          currency: string | null
          dedupe_key: string | null
          departure_at: string | null
          departure_code: string | null
          departure_location: string | null
          flight_number: string | null
          from_destination_id: string | null
          id: string
          leg_type: string
          mode: string
          notes: string | null
          operator_name: string | null
          provider: string | null
          seat: string | null
          segments: Json | null
          terminal_or_platform: string | null
          title: string | null
          to_destination_id: string | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          arrival_at?: string | null
          arrival_code?: string | null
          arrival_location?: string | null
          attachment_url?: string | null
          booking_url?: string | null
          confirmation_number?: string | null
          cost?: number | null
          created_at?: string
          currency?: string | null
          dedupe_key?: string | null
          departure_at?: string | null
          departure_code?: string | null
          departure_location?: string | null
          flight_number?: string | null
          from_destination_id?: string | null
          id?: string
          leg_type?: string
          mode: string
          notes?: string | null
          operator_name?: string | null
          provider?: string | null
          seat?: string | null
          segments?: Json | null
          terminal_or_platform?: string | null
          title?: string | null
          to_destination_id?: string | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          arrival_at?: string | null
          arrival_code?: string | null
          arrival_location?: string | null
          attachment_url?: string | null
          booking_url?: string | null
          confirmation_number?: string | null
          cost?: number | null
          created_at?: string
          currency?: string | null
          dedupe_key?: string | null
          departure_at?: string | null
          departure_code?: string | null
          departure_location?: string | null
          flight_number?: string | null
          from_destination_id?: string | null
          id?: string
          leg_type?: string
          mode?: string
          notes?: string | null
          operator_name?: string | null
          provider?: string | null
          seat?: string | null
          segments?: Json | null
          terminal_or_platform?: string | null
          title?: string | null
          to_destination_id?: string | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_bookings_from_destination_id_fkey"
            columns: ["from_destination_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_bookings_to_destination_id_fkey"
            columns: ["to_destination_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_bookings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_buddies: {
        Row: {
          added_at: string
          invited_by: string
          status: string
          trip_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          invited_by: string
          status?: string
          trip_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          invited_by?: string
          status?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_buddies_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_buddies_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_buddies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_chat_messages: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          role: string
          session_id: string | null
          text: string
          trip_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          role: string
          session_id?: string | null
          text: string
          trip_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          role?: string
          session_id?: string | null
          text?: string
          trip_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_chat_messages_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_recommendations: {
        Row: {
          created_at: string | null
          dismissed_at: string | null
          id: string
          match_reason: string
          place_data: Json
          place_id: string
          place_name: string
          recommendation_type: string
          trip_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          dismissed_at?: string | null
          id?: string
          match_reason: string
          place_data: Json
          place_id: string
          place_name: string
          recommendation_type: string
          trip_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          dismissed_at?: string | null
          id?: string
          match_reason?: string
          place_data?: Json
          place_id?: string
          place_name?: string
          recommendation_type?: string
          trip_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_recommendations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_recommendations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          budget_amount_usd: number | null
          budget_currency: string | null
          budget_mode: string | null
          cities: string[] | null
          countries: string[] | null
          cover_url: string | null
          created_at: string | null
          distance_km: number | null
          end_date: string | null
          id: string
          is_active: boolean | null
          location_visibility: string
          privacy: string | null
          start_date: string | null
          status: string | null
          title: string
          travel_tracker: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          budget_amount_usd?: number | null
          budget_currency?: string | null
          budget_mode?: string | null
          cities?: string[] | null
          countries?: string[] | null
          cover_url?: string | null
          created_at?: string | null
          distance_km?: number | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          location_visibility?: string
          privacy?: string | null
          start_date?: string | null
          status?: string | null
          title: string
          travel_tracker?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          budget_amount_usd?: number | null
          budget_currency?: string | null
          budget_mode?: string | null
          cities?: string[] | null
          countries?: string[] | null
          cover_url?: string | null
          created_at?: string | null
          distance_km?: number | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          location_visibility?: string
          privacy?: string | null
          start_date?: string | null
          status?: string | null
          title?: string
          travel_tracker?: boolean
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_travel_memories: {
        Row: {
          confidence: number
          content: string
          content_json: Json
          created_at: string
          destination_key: string | null
          destination_label: string | null
          id: string
          kind: string
          last_used_at: string | null
          memory_key: string
          scope: string
          source_message: string | null
          source_response: string | null
          source_trip_id: string | null
          source_trip_title: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number
          content: string
          content_json?: Json
          created_at?: string
          destination_key?: string | null
          destination_label?: string | null
          id?: string
          kind: string
          last_used_at?: string | null
          memory_key: string
          scope: string
          source_message?: string | null
          source_response?: string | null
          source_trip_id?: string | null
          source_trip_title?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          content?: string
          content_json?: Json
          created_at?: string
          destination_key?: string | null
          destination_label?: string | null
          id?: string
          kind?: string
          last_used_at?: string | null
          memory_key?: string
          scope?: string
          source_message?: string | null
          source_response?: string | null
          source_trip_id?: string | null
          source_trip_title?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_travel_preferences: {
        Row: {
          budget_style: string
          created_at: string
          food_moods: string[]
          mobility_style: string
          notes: string | null
          priorities: string[]
          travel_rhythm: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_style?: string
          created_at?: string
          food_moods?: string[]
          mobility_style?: string
          notes?: string | null
          priorities?: string[]
          travel_rhythm?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_style?: string
          created_at?: string
          food_moods?: string[]
          mobility_style?: string
          notes?: string | null
          priorities?: string[]
          travel_rhythm?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      viator_activity_cache: {
        Row: {
          cache_key: string
          destination_id: string
          products: Json
          refreshed_at: string
        }
        Insert: {
          cache_key: string
          destination_id: string
          products: Json
          refreshed_at?: string
        }
        Update: {
          cache_key?: string
          destination_id?: string
          products?: Json
          refreshed_at?: string
        }
        Relationships: []
      }
      viator_destinations: {
        Row: {
          destination_id: string
          lat: number | null
          lng: number | null
          name: string
          refreshed_at: string
          type: string | null
        }
        Insert: {
          destination_id: string
          lat?: number | null
          lng?: number | null
          name: string
          refreshed_at?: string
          type?: string | null
        }
        Update: {
          destination_id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          refreshed_at?: string
          type?: string | null
        }
        Relationships: []
      }
      waypoints: {
        Row: {
          ai_story: string | null
          altitude: number | null
          city: string | null
          country: string | null
          country_code: string | null
          created_at: string | null
          id: string
          latitude: number
          longitude: number
          note: string | null
          timestamp: string | null
          trip_id: string
          user_id: string
        }
        Insert: {
          ai_story?: string | null
          altitude?: number | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          id?: string
          latitude: number
          longitude: number
          note?: string | null
          timestamp?: string | null
          trip_id: string
          user_id: string
        }
        Update: {
          ai_story?: string | null
          altitude?: number | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          id?: string
          latitude?: number
          longitude?: number
          note?: string | null
          timestamp?: string | null
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "steps_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_trip_for_chat: {
        Args: { target_trip_id: string }
        Returns: boolean
      }
      generate_alias_token: { Args: never; Returns: string }
      generate_trip_email_alias: {
        Args: {
          p_domain?: string
          p_title: string
          p_trip_id: string
          p_user_id: string
        }
        Returns: {
          created_at: string
          disabled_at: string | null
          email_address: string
          id: string
          is_active: boolean
          slug: string
          token: string
          trip_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "email_aliases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_accepted_trip_buddy: {
        Args: { _trip_id: string; _user_id: string }
        Returns: boolean
      }
      is_trip_member: { Args: { p_trip_id: string }; Returns: boolean }
      is_trip_member_of: {
        Args: { p_trip_id: string; p_user_id: string }
        Returns: boolean
      }
      join_trip_by_id: {
        Args: { p_trip_id: string }
        Returns: {
          result: string
          title: string
          trip_id: string
        }[]
      }
      plaid_booking_candidates: {
        Args: { p_item_id: string }
        Returns: {
          amount: number
          candidate_trip_end: string
          candidate_trip_id: string
          candidate_trip_start: string
          candidate_trip_title: string
          iso_currency_code: string
          merchant_name: string
          pfc_detailed: string
          pfc_primary: string
          tx_date: string
          tx_id: string
        }[]
      }
      plaid_dismiss_transaction: {
        Args: { p_tx_id: string }
        Returns: undefined
      }
      plaid_expense_candidates: {
        Args: { p_trip_id: string }
        Returns: {
          amount: number
          drift_category: string
          iso_currency_code: string
          merchant_name: string
          pfc_primary: string
          tx_date: string
          tx_id: string
        }[]
      }
      plaid_item_summary: {
        Args: { p_item_id: string }
        Returns: {
          in_trip_count: number
          last_transaction_at: string
          needs_review_count: number
          newest_tx_date: string
          oldest_tx_date: string
          pretrip_candidate_count: number
          transaction_count: number
        }[]
      }
      plaid_promote_candidate: {
        Args: {
          p_destination_step_id?: string
          p_trip_id?: string
          p_tx_id: string
        }
        Returns: {
          destination_step_id: string
          expense_id: string
          trip_id: string
        }[]
      }
      plaid_review_imports: {
        Args: { p_item_id: string }
        Returns: {
          amount: number
          destination_name: string
          destination_step_id: string
          expense_id: string
          iso_currency_code: string
          merchant_name: string
          pfc_detailed: string
          pfc_primary: string
          status: string
          trip_end: string
          trip_id: string
          trip_start: string
          trip_title: string
          tx_date: string
          tx_id: string
        }[]
      }
      purge_stale_places: { Args: never; Returns: undefined }
      slugify: { Args: { input: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
