export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_user_profiles: {
        Row: {
          created_at: string
          email: string | null
          primary_wallet_address: string | null
          privy_user_id: string
          updated_at: string
          wallet_addresses: string[]
        }
        Insert: {
          created_at?: string
          email?: string | null
          primary_wallet_address?: string | null
          privy_user_id: string
          updated_at?: string
          wallet_addresses?: string[]
        }
        Update: {
          created_at?: string
          email?: string | null
          primary_wallet_address?: string | null
          privy_user_id?: string
          updated_at?: string
          wallet_addresses?: string[]
        }
        Relationships: []
      }
      attestation_challenges: {
        Row: {
          attestation_id: string
          challenge_reason: string
          challenged_address: string
          challenger_address: string
          created_at: string
          evidence_description: string | null
          evidence_url: string | null
          id: string
          resolution_reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          stake_amount: number | null
          status: string
          updated_at: string
        }
        Insert: {
          attestation_id: string
          challenge_reason: string
          challenged_address: string
          challenger_address: string
          created_at?: string
          evidence_description?: string | null
          evidence_url?: string | null
          id?: string
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stake_amount?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          attestation_id?: string
          challenge_reason?: string
          challenged_address?: string
          challenger_address?: string
          created_at?: string
          evidence_description?: string | null
          evidence_url?: string | null
          id?: string
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stake_amount?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attestation_challenges_attestation_id_fkey"
            columns: ["attestation_id"]
            isOneToOne: false
            referencedRelation: "attestations"
            referencedColumns: ["id"]
          },
        ]
      }
      attestation_delegations: {
        Row: {
          created_at: string
          data: string
          deadline: string
          event_id: string
          event_title: string | null
          executed: boolean
          executed_at: string | null
          executed_tx_hash: string | null
          id: string
          lock_address: string | null
          message_hash: string
          recipient: string
          schema_uid: string
          signature: string
          signer_address: string
        }
        Insert: {
          created_at?: string
          data: string
          deadline: string
          event_id: string
          event_title?: string | null
          executed?: boolean
          executed_at?: string | null
          executed_tx_hash?: string | null
          id?: string
          lock_address?: string | null
          message_hash: string
          recipient: string
          schema_uid: string
          signature: string
          signer_address: string
        }
        Update: {
          created_at?: string
          data?: string
          deadline?: string
          event_id?: string
          event_title?: string | null
          executed?: boolean
          executed_at?: string | null
          executed_tx_hash?: string | null
          id?: string
          lock_address?: string | null
          message_hash?: string
          recipient?: string
          schema_uid?: string
          signature?: string
          signer_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "attestation_delegations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      attestation_schemas: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          name: string
          revocable: boolean
          schema_definition: string
          schema_uid: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id?: string
          name: string
          revocable?: boolean
          schema_definition: string
          schema_uid: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          revocable?: boolean
          schema_definition?: string
          schema_uid?: string
          updated_at?: string
        }
        Relationships: []
      }
      attestation_votes: {
        Row: {
          attestation_id: string
          created_at: string
          id: string
          vote_type: string
          voter_address: string
          weight: number
        }
        Insert: {
          attestation_id: string
          created_at?: string
          id?: string
          vote_type: string
          voter_address: string
          weight?: number
        }
        Update: {
          attestation_id?: string
          created_at?: string
          id?: string
          vote_type?: string
          voter_address?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "attestation_votes_attestation_id_fkey"
            columns: ["attestation_id"]
            isOneToOne: false
            referencedRelation: "attestations"
            referencedColumns: ["id"]
          },
        ]
      }
      attestations: {
        Row: {
          attestation_uid: string
          attester: string
          created_at: string
          creator_address: string | null
          data: Json
          event_id: string | null
          expiration_time: string | null
          id: string
          is_revoked: boolean
          lock_address: string | null
          recipient: string
          revocation_time: string | null
          schema_uid: string
          ticket_token_id: string | null
          updated_at: string
        }
        Insert: {
          attestation_uid: string
          attester: string
          created_at?: string
          creator_address?: string | null
          data: Json
          event_id?: string | null
          expiration_time?: string | null
          id?: string
          is_revoked?: boolean
          lock_address?: string | null
          recipient: string
          revocation_time?: string | null
          schema_uid: string
          ticket_token_id?: string | null
          updated_at?: string
        }
        Update: {
          attestation_uid?: string
          attester?: string
          created_at?: string
          creator_address?: string | null
          data?: Json
          event_id?: string | null
          expiration_time?: string | null
          id?: string
          is_revoked?: boolean
          lock_address?: string | null
          recipient?: string
          revocation_time?: string | null
          schema_uid?: string
          ticket_token_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attestations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attestations_schema_uid_fkey"
            columns: ["schema_uid"]
            isOneToOne: false
            referencedRelation: "attestation_schemas"
            referencedColumns: ["schema_uid"]
          },
        ]
      }
      comment_likes: {
        Row: {
          attestation_uid: string | null
          comment_id: string
          created_at: string | null
          id: string
          on_chain: boolean | null
          user_address: string
        }
        Insert: {
          attestation_uid?: string | null
          comment_id: string
          created_at?: string | null
          id?: string
          on_chain?: boolean | null
          user_address: string
        }
        Update: {
          attestation_uid?: string | null
          comment_id?: string
          created_at?: string | null
          id?: string
          on_chain?: boolean | null
          user_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      csp_rate_limits: {
        Row: {
          count: number
          ip: string
          window_start: string
        }
        Insert: {
          count: number
          ip: string
          window_start: string
        }
        Update: {
          count?: number
          ip?: string
          window_start?: string
        }
        Relationships: []
      }
      csp_reports: {
        Row: {
          blocked_uri: string | null
          column_number: number | null
          document_uri: string
          id: string
          ip: string | null
          line_number: number | null
          raw_report: Json | null
          received_at: string
          source_file: string | null
          status_code: number | null
          user_agent: string | null
          violated_directive: string
        }
        Insert: {
          blocked_uri?: string | null
          column_number?: number | null
          document_uri: string
          id?: string
          ip?: string | null
          line_number?: number | null
          raw_report?: Json | null
          received_at?: string
          source_file?: string | null
          status_code?: number | null
          user_agent?: string | null
          violated_directive: string
        }
        Update: {
          blocked_uri?: string | null
          column_number?: number | null
          document_uri?: string
          id?: string
          ip?: string | null
          line_number?: number | null
          raw_report?: Json | null
          received_at?: string
          source_file?: string | null
          status_code?: number | null
          user_agent?: string | null
          violated_directive?: string
        }
        Relationships: []
      }
      dg_payout_wallet_locks: {
        Row: {
          chain_id: number
          lock_id: string | null
          locked_at: string | null
        }
        Insert: {
          chain_id: number
          lock_id?: string | null
          locked_at?: string | null
        }
        Update: {
          chain_id?: number
          lock_id?: string | null
          locked_at?: string | null
        }
        Relationships: []
      }
      dg_redemption_events: {
        Row: {
          actor_user_id: string | null
          actor_wallet_address: string | null
          created_at: string
          event_type: string
          id: string
          intent_id: string | null
          metadata: Json
        }
        Insert: {
          actor_user_id?: string | null
          actor_wallet_address?: string | null
          created_at?: string
          event_type: string
          id?: string
          intent_id?: string | null
          metadata?: Json
        }
        Update: {
          actor_user_id?: string | null
          actor_wallet_address?: string | null
          created_at?: string
          event_type?: string
          id?: string
          intent_id?: string | null
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "dg_redemption_events_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "dg_redemption_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      dg_redemption_intents: {
        Row: {
          amount_dg_raw: string
          attempts: number
          chain_id: number
          completed_at: string | null
          created_at: string
          dg_token_address: string
          estimated_up_out_raw: string
          expires_at: string
          fee_breakdown: Json
          fee_transfer_completed_at: string | null
          fee_transfer_last_error: string | null
          fee_transfer_raw_tx: string | null
          fee_transfer_status: string
          fee_transfer_tx_hash: string | null
          gross_ngn_kobo: number
          gross_usdc_micro: number | null
          id: string
          last_error: string | null
          limits_snapshot: Json
          lock_id: string | null
          locked_at: string | null
          net_dg_raw: string
          net_payout_kobo: number
          net_payout_usdc_micro: number | null
          payout_account_id: string | null
          payout_method: string
          payout_raw_tx: string | null
          payout_snapshot: Json
          payout_token_address: string | null
          payout_tx_hash: string | null
          payout_wallet_address: string | null
          paystack_reference: string
          paystack_status: string | null
          paystack_transfer_code: string | null
          paystack_transfer_id: string | null
          pricing_snapshot: Json
          redemption_wallet_address: string
          service_fee_kobo: number
          service_fee_usdc_micro: number | null
          status: string
          total_fee_kobo: number
          total_fee_usdc_micro: number | null
          tx_hash: string | null
          up_token_address: string
          updated_at: string
          user_id: string
          vat_basis: string
          vat_basis_kobo: number
          vat_kobo: number
          vat_rate_bps: number
          vendor_address: string
          vendor_fee_dg_raw: string
          vendor_snapshot: Json
          wallet_address: string
        }
        Insert: {
          amount_dg_raw: string
          attempts?: number
          chain_id: number
          completed_at?: string | null
          created_at?: string
          dg_token_address: string
          estimated_up_out_raw: string
          expires_at: string
          fee_breakdown?: Json
          fee_transfer_completed_at?: string | null
          fee_transfer_last_error?: string | null
          fee_transfer_raw_tx?: string | null
          fee_transfer_status?: string
          fee_transfer_tx_hash?: string | null
          gross_ngn_kobo: number
          gross_usdc_micro?: number | null
          id?: string
          last_error?: string | null
          limits_snapshot?: Json
          lock_id?: string | null
          locked_at?: string | null
          net_dg_raw: string
          net_payout_kobo: number
          net_payout_usdc_micro?: number | null
          payout_account_id?: string | null
          payout_method?: string
          payout_raw_tx?: string | null
          payout_snapshot?: Json
          payout_token_address?: string | null
          payout_tx_hash?: string | null
          payout_wallet_address?: string | null
          paystack_reference: string
          paystack_status?: string | null
          paystack_transfer_code?: string | null
          paystack_transfer_id?: string | null
          pricing_snapshot?: Json
          redemption_wallet_address: string
          service_fee_kobo: number
          service_fee_usdc_micro?: number | null
          status?: string
          total_fee_kobo: number
          total_fee_usdc_micro?: number | null
          tx_hash?: string | null
          up_token_address: string
          updated_at?: string
          user_id: string
          vat_basis?: string
          vat_basis_kobo?: number
          vat_kobo?: number
          vat_rate_bps?: number
          vendor_address: string
          vendor_fee_dg_raw: string
          vendor_snapshot?: Json
          wallet_address: string
        }
        Update: {
          amount_dg_raw?: string
          attempts?: number
          chain_id?: number
          completed_at?: string | null
          created_at?: string
          dg_token_address?: string
          estimated_up_out_raw?: string
          expires_at?: string
          fee_breakdown?: Json
          fee_transfer_completed_at?: string | null
          fee_transfer_last_error?: string | null
          fee_transfer_raw_tx?: string | null
          fee_transfer_status?: string
          fee_transfer_tx_hash?: string | null
          gross_ngn_kobo?: number
          gross_usdc_micro?: number | null
          id?: string
          last_error?: string | null
          limits_snapshot?: Json
          lock_id?: string | null
          locked_at?: string | null
          net_dg_raw?: string
          net_payout_kobo?: number
          net_payout_usdc_micro?: number | null
          payout_account_id?: string | null
          payout_method?: string
          payout_raw_tx?: string | null
          payout_snapshot?: Json
          payout_token_address?: string | null
          payout_tx_hash?: string | null
          payout_wallet_address?: string | null
          paystack_reference?: string
          paystack_status?: string | null
          paystack_transfer_code?: string | null
          paystack_transfer_id?: string | null
          pricing_snapshot?: Json
          redemption_wallet_address?: string
          service_fee_kobo?: number
          service_fee_usdc_micro?: number | null
          status?: string
          total_fee_kobo?: number
          total_fee_usdc_micro?: number | null
          tx_hash?: string | null
          up_token_address?: string
          updated_at?: string
          user_id?: string
          vat_basis?: string
          vat_basis_kobo?: number
          vat_kobo?: number
          vat_rate_bps?: number
          vendor_address?: string
          vendor_fee_dg_raw?: string
          vendor_snapshot?: Json
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "dg_redemption_intents_payout_account_id_fkey"
            columns: ["payout_account_id"]
            isOneToOne: false
            referencedRelation: "user_payout_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      event_allow_list: {
        Row: {
          added_by: string | null
          created_at: string
          event_id: string
          id: string
          user_email: string | null
          wallet_address: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          event_id: string
          id?: string
          user_email?: string | null
          wallet_address: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          event_id?: string
          id?: string
          user_email?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_allow_list_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_allow_list_requests: {
        Row: {
          created_at: string
          event_id: string
          id: string
          processed_at: string | null
          processed_by: string | null
          status: string
          user_email: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          user_email: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          user_email?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_allow_list_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_drafts: {
        Row: {
          allow_waitlist: boolean | null
          capacity: number
          category: string
          chain_id: number | null
          created_at: string
          currency: string
          custom_duration_days: number | null
          date: string | null
          description: string
          end_date: string | null
          ends_at: string | null
          event_type: string
          game_id: string | null
          has_allow_list: boolean | null
          id: string
          image_crop_x: number | null
          image_crop_y: number | null
          image_url: string | null
          is_public: boolean | null
          location: string
          ngn_price: number | null
          ngn_price_kobo: number
          payment_methods: string[] | null
          paystack_public_key: string | null
          price: number
          purchase_confirmation_message: string | null
          purchase_form_schema: Json | null
          refund_controller_address: string | null
          refund_event_end_at: string | null
          refund_last_synced_at: string | null
          refund_last_tx_hash: string | null
          refund_min_attendees: number | null
          refund_protection_enabled: boolean
          refund_reserve_bond: string | null
          refund_status: string | null
          refund_trigger_at: string | null
          registration_cutoff: string | null
          starts_at: string | null
          ticket_duration: string | null
          time: string
          timezone_offset_minutes: number | null
          title: string
          transferable: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_waitlist?: boolean | null
          capacity?: number
          category?: string
          chain_id?: number | null
          created_at?: string
          currency?: string
          custom_duration_days?: number | null
          date?: string | null
          description?: string
          end_date?: string | null
          ends_at?: string | null
          event_type?: string
          game_id?: string | null
          has_allow_list?: boolean | null
          id?: string
          image_crop_x?: number | null
          image_crop_y?: number | null
          image_url?: string | null
          is_public?: boolean | null
          location?: string
          ngn_price?: number | null
          ngn_price_kobo?: number
          payment_methods?: string[] | null
          paystack_public_key?: string | null
          price?: number
          purchase_confirmation_message?: string | null
          purchase_form_schema?: Json | null
          refund_controller_address?: string | null
          refund_event_end_at?: string | null
          refund_last_synced_at?: string | null
          refund_last_tx_hash?: string | null
          refund_min_attendees?: number | null
          refund_protection_enabled?: boolean
          refund_reserve_bond?: string | null
          refund_status?: string | null
          refund_trigger_at?: string | null
          registration_cutoff?: string | null
          starts_at?: string | null
          ticket_duration?: string | null
          time?: string
          timezone_offset_minutes?: number | null
          title?: string
          transferable?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_waitlist?: boolean | null
          capacity?: number
          category?: string
          chain_id?: number | null
          created_at?: string
          currency?: string
          custom_duration_days?: number | null
          date?: string | null
          description?: string
          end_date?: string | null
          ends_at?: string | null
          event_type?: string
          game_id?: string | null
          has_allow_list?: boolean | null
          id?: string
          image_crop_x?: number | null
          image_crop_y?: number | null
          image_url?: string | null
          is_public?: boolean | null
          location?: string
          ngn_price?: number | null
          ngn_price_kobo?: number
          payment_methods?: string[] | null
          paystack_public_key?: string | null
          price?: number
          purchase_confirmation_message?: string | null
          purchase_form_schema?: Json | null
          refund_controller_address?: string | null
          refund_event_end_at?: string | null
          refund_last_synced_at?: string | null
          refund_last_tx_hash?: string | null
          refund_min_attendees?: number | null
          refund_protection_enabled?: boolean
          refund_reserve_bond?: string | null
          refund_status?: string | null
          refund_trigger_at?: string | null
          registration_cutoff?: string | null
          starts_at?: string | null
          ticket_duration?: string | null
          time?: string
          timezone_offset_minutes?: number | null
          title?: string
          transferable?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_drafts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      event_managers: {
        Row: {
          added_by: string
          created_at: string
          email: string | null
          event_id: string
          id: string
          label: string | null
          permissions: Json
          privy_user_id: string | null
          revoked_at: string | null
          updated_at: string
          wallet_address: string
        }
        Insert: {
          added_by: string
          created_at?: string
          email?: string | null
          event_id: string
          id?: string
          label?: string | null
          permissions?: Json
          privy_user_id?: string | null
          revoked_at?: string | null
          updated_at?: string
          wallet_address: string
        }
        Update: {
          added_by?: string
          created_at?: string
          email?: string | null
          event_id?: string
          id?: string
          label?: string | null
          permissions?: Json
          privy_user_id?: string | null
          revoked_at?: string | null
          updated_at?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_managers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_posts: {
        Row: {
          block_number: number | null
          chain_id: number | null
          comments_enabled: boolean | null
          content: string
          content_hash: string | null
          created_at: string | null
          creator_address: string
          event_id: string
          id: string
          ipfs_cid: string | null
          is_deleted: boolean | null
          is_pinned: boolean | null
          nonce: number | null
          on_chain: boolean | null
          signature: string | null
          transaction_hash: string | null
          updated_at: string | null
        }
        Insert: {
          block_number?: number | null
          chain_id?: number | null
          comments_enabled?: boolean | null
          content: string
          content_hash?: string | null
          created_at?: string | null
          creator_address: string
          event_id: string
          id?: string
          ipfs_cid?: string | null
          is_deleted?: boolean | null
          is_pinned?: boolean | null
          nonce?: number | null
          on_chain?: boolean | null
          signature?: string | null
          transaction_hash?: string | null
          updated_at?: string | null
        }
        Update: {
          block_number?: number | null
          chain_id?: number | null
          comments_enabled?: boolean | null
          content?: string
          content_hash?: string | null
          created_at?: string | null
          creator_address?: string
          event_id?: string
          id?: string
          ipfs_cid?: string | null
          is_deleted?: boolean | null
          is_pinned?: boolean | null
          nonce?: number | null
          on_chain?: boolean | null
          signature?: string | null
          transaction_hash?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_purchase_form_schemas: {
        Row: {
          created_at: string
          event_id: string
          schema_json: Json
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          event_id: string
          schema_json: Json
          updated_at?: string
          updated_by: string
        }
        Update: {
          created_at?: string
          event_id?: string
          schema_json?: Json
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_purchase_form_schemas_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_purchase_messages: {
        Row: {
          created_at: string
          event_id: string
          message_html: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          event_id: string
          message_html: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          created_at?: string
          event_id?: string
          message_html?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_purchase_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_waitlist: {
        Row: {
          confirmation_sent: boolean | null
          created_at: string
          event_id: string
          id: string
          notified: boolean | null
          notified_at: string | null
          user_email: string
          wallet_address: string | null
        }
        Insert: {
          confirmation_sent?: boolean | null
          created_at?: string
          event_id: string
          id?: string
          notified?: boolean | null
          notified_at?: string | null
          user_email: string
          wallet_address?: string | null
        }
        Update: {
          confirmation_sent?: boolean | null
          created_at?: string
          event_id?: string
          id?: string
          notified?: boolean | null
          notified_at?: string | null
          user_email?: string
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          allow_waitlist: boolean | null
          attendance_schema_uid: string | null
          attestation_enabled: boolean
          capacity: number
          category: string
          chain_id: number
          created_at: string
          creator_id: string
          currency: string
          custom_duration_days: number | null
          date: string | null
          description: string
          end_date: string | null
          ends_at: string | null
          event_type: string
          game_id: string | null
          has_allow_list: boolean | null
          id: string
          idempotency_hash: string | null
          image_crop_x: number | null
          image_crop_y: number | null
          image_url: string | null
          is_public: boolean | null
          location: string
          lock_address: string
          max_keys_per_address: number
          nft_base_uri: string | null
          nft_metadata_set: boolean | null
          ngn_price: number | null
          ngn_price_kobo: number
          payment_methods: string[] | null
          payout_destination: string
          paystack_public_key: string | null
          price: number
          refund_controller_address: string | null
          refund_event_end_at: string | null
          refund_last_synced_at: string | null
          refund_last_tx_hash: string | null
          refund_manager_released: boolean
          refund_manager_released_at: string | null
          refund_min_attendees: number | null
          refund_protection_enabled: boolean
          refund_reserve_bond: string | null
          refund_status: string | null
          refund_trigger_at: string | null
          registration_cutoff: string | null
          requires_approval: boolean
          review_schema_uid: string | null
          service_manager_added: boolean
          starts_at: string | null
          ticket_duration: string | null
          time: string
          title: string
          transaction_hash: string
          transferable: boolean
          updated_at: string
        }
        Insert: {
          allow_waitlist?: boolean | null
          attendance_schema_uid?: string | null
          attestation_enabled?: boolean
          capacity: number
          category: string
          chain_id?: number
          created_at?: string
          creator_id: string
          currency?: string
          custom_duration_days?: number | null
          date?: string | null
          description: string
          end_date?: string | null
          ends_at?: string | null
          event_type?: string
          game_id?: string | null
          has_allow_list?: boolean | null
          id?: string
          idempotency_hash?: string | null
          image_crop_x?: number | null
          image_crop_y?: number | null
          image_url?: string | null
          is_public?: boolean | null
          location: string
          lock_address: string
          max_keys_per_address?: number
          nft_base_uri?: string | null
          nft_metadata_set?: boolean | null
          ngn_price?: number | null
          ngn_price_kobo?: number
          payment_methods?: string[] | null
          payout_destination?: string
          paystack_public_key?: string | null
          price?: number
          refund_controller_address?: string | null
          refund_event_end_at?: string | null
          refund_last_synced_at?: string | null
          refund_last_tx_hash?: string | null
          refund_manager_released?: boolean
          refund_manager_released_at?: string | null
          refund_min_attendees?: number | null
          refund_protection_enabled?: boolean
          refund_reserve_bond?: string | null
          refund_status?: string | null
          refund_trigger_at?: string | null
          registration_cutoff?: string | null
          requires_approval?: boolean
          review_schema_uid?: string | null
          service_manager_added?: boolean
          starts_at?: string | null
          ticket_duration?: string | null
          time: string
          title: string
          transaction_hash: string
          transferable?: boolean
          updated_at?: string
        }
        Update: {
          allow_waitlist?: boolean | null
          attendance_schema_uid?: string | null
          attestation_enabled?: boolean
          capacity?: number
          category?: string
          chain_id?: number
          created_at?: string
          creator_id?: string
          currency?: string
          custom_duration_days?: number | null
          date?: string | null
          description?: string
          end_date?: string | null
          ends_at?: string | null
          event_type?: string
          game_id?: string | null
          has_allow_list?: boolean | null
          id?: string
          idempotency_hash?: string | null
          image_crop_x?: number | null
          image_crop_y?: number | null
          image_url?: string | null
          is_public?: boolean | null
          location?: string
          lock_address?: string
          max_keys_per_address?: number
          nft_base_uri?: string | null
          nft_metadata_set?: boolean | null
          ngn_price?: number | null
          ngn_price_kobo?: number
          payment_methods?: string[] | null
          payout_destination?: string
          paystack_public_key?: string | null
          price?: number
          refund_controller_address?: string | null
          refund_event_end_at?: string | null
          refund_last_synced_at?: string | null
          refund_last_tx_hash?: string | null
          refund_manager_released?: boolean
          refund_manager_released_at?: string | null
          refund_min_attendees?: number | null
          refund_protection_enabled?: boolean
          refund_reserve_bond?: string | null
          refund_status?: string | null
          refund_trigger_at?: string | null
          registration_cutoff?: string | null
          requires_approval?: boolean
          review_schema_uid?: string | null
          service_manager_added?: boolean
          starts_at?: string | null
          ticket_duration?: string | null
          time?: string
          title?: string
          transaction_hash?: string
          transferable?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_results: {
        Row: {
          created_at: string
          event_id: string
          finalized_at: string | null
          game_id: string | null
          hold_until: string | null
          id: string
          idempotency_key: string
          is_ranked: boolean
          metadata: Json
          occurred_at: string
          organizer_id: string
          participant_count: number | null
          placement: number
          player_id: string | null
          result_kind: string
          reward_pool_id: string | null
          source: string
          status: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          wallet_address: string
        }
        Insert: {
          created_at?: string
          event_id: string
          finalized_at?: string | null
          game_id?: string | null
          hold_until?: string | null
          id?: string
          idempotency_key: string
          is_ranked?: boolean
          metadata?: Json
          occurred_at?: string
          organizer_id: string
          participant_count?: number | null
          placement: number
          player_id?: string | null
          result_kind?: string
          reward_pool_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          wallet_address: string
        }
        Update: {
          created_at?: string
          event_id?: string
          finalized_at?: string | null
          game_id?: string | null
          hold_until?: string | null
          id?: string
          idempotency_key?: string
          is_ranked?: boolean
          metadata?: Json
          occurred_at?: string
          organizer_id?: string
          participant_count?: number | null
          placement?: number
          player_id?: string | null
          result_kind?: string
          reward_pool_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_results_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_results_reward_pool_id_fkey"
            columns: ["reward_pool_id"]
            isOneToOne: false
            referencedRelation: "reward_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          category: string | null
          cover_url: string | null
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          scoring_profile: Json
          slug: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          scoring_profile?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          scoring_profile?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      gaming_bundle_claim_code_rotations: {
        Row: {
          created_at: string
          id: string
          new_claim_code_hash: string
          old_claim_code_hash: string
          order_id: string
          reason: string | null
          vendor_address: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_claim_code_hash: string
          old_claim_code_hash: string
          order_id: string
          reason?: string | null
          vendor_address: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_claim_code_hash?: string
          old_claim_code_hash?: string
          order_id?: string
          reason?: string | null
          vendor_address?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gaming_bundle_claim_code_rotations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "gaming_bundle_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      gaming_bundle_orders: {
        Row: {
          amount_dg: number | null
          amount_fiat: number | null
          bundle_address: string
          bundle_id: string
          buyer_address: string | null
          buyer_display_name: string | null
          buyer_email: string | null
          buyer_phone: string | null
          chain_id: number
          claim_code_hash: string | null
          created_at: string
          eas_uid: string | null
          fiat_symbol: string | null
          fulfillment_method: string
          gateway_response: Json | null
          id: string
          issuance_attempts: number
          issuance_last_error: string | null
          issuance_lock_id: string | null
          issuance_locked_at: string | null
          nft_recipient_address: string | null
          payment_provider: string
          payment_reference: string | null
          status: string
          token_id: string | null
          txn_hash: string | null
          updated_at: string
          vendor_address: string
          vendor_id: string
          verified_at: string | null
        }
        Insert: {
          amount_dg?: number | null
          amount_fiat?: number | null
          bundle_address: string
          bundle_id: string
          buyer_address?: string | null
          buyer_display_name?: string | null
          buyer_email?: string | null
          buyer_phone?: string | null
          chain_id: number
          claim_code_hash?: string | null
          created_at?: string
          eas_uid?: string | null
          fiat_symbol?: string | null
          fulfillment_method?: string
          gateway_response?: Json | null
          id?: string
          issuance_attempts?: number
          issuance_last_error?: string | null
          issuance_lock_id?: string | null
          issuance_locked_at?: string | null
          nft_recipient_address?: string | null
          payment_provider?: string
          payment_reference?: string | null
          status?: string
          token_id?: string | null
          txn_hash?: string | null
          updated_at?: string
          vendor_address: string
          vendor_id: string
          verified_at?: string | null
        }
        Update: {
          amount_dg?: number | null
          amount_fiat?: number | null
          bundle_address?: string
          bundle_id?: string
          buyer_address?: string | null
          buyer_display_name?: string | null
          buyer_email?: string | null
          buyer_phone?: string | null
          chain_id?: number
          claim_code_hash?: string | null
          created_at?: string
          eas_uid?: string | null
          fiat_symbol?: string | null
          fulfillment_method?: string
          gateway_response?: Json | null
          id?: string
          issuance_attempts?: number
          issuance_last_error?: string | null
          issuance_lock_id?: string | null
          issuance_locked_at?: string | null
          nft_recipient_address?: string | null
          payment_provider?: string
          payment_reference?: string | null
          status?: string
          token_id?: string | null
          txn_hash?: string | null
          updated_at?: string
          vendor_address?: string
          vendor_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gaming_bundle_orders_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "gaming_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      gaming_bundle_redemptions: {
        Row: {
          bundle_id: string
          created_at: string
          id: string
          metadata: Json | null
          order_id: string
          redeemed_at: string
          redeemer_address: string | null
          redemption_location: string | null
          updated_at: string
          vendor_address: string
          vendor_id: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          order_id: string
          redeemed_at?: string
          redeemer_address?: string | null
          redemption_location?: string | null
          updated_at?: string
          vendor_address: string
          vendor_id: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          order_id?: string
          redeemed_at?: string
          redeemer_address?: string | null
          redemption_location?: string | null
          updated_at?: string
          vendor_address?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gaming_bundle_redemptions_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "gaming_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gaming_bundle_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "gaming_bundle_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      gaming_bundles: {
        Row: {
          bundle_address: string
          bundle_type: string
          chain_id: number
          console: string | null
          created_at: string
          description: string
          fiat_symbol: string
          game_title: string | null
          id: string
          image_url: string | null
          is_active: boolean
          key_expiration_duration_seconds: number
          location: string
          metadata_set: boolean
          payout_destination: string
          price_dg: number | null
          price_fiat: number
          price_fiat_kobo: number
          quantity_units: number
          service_manager_added: boolean
          title: string
          unit_label: string
          updated_at: string
          vendor_address: string
          vendor_id: string
        }
        Insert: {
          bundle_address: string
          bundle_type: string
          chain_id: number
          console?: string | null
          created_at?: string
          description: string
          fiat_symbol?: string
          game_title?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          key_expiration_duration_seconds?: number
          location: string
          metadata_set?: boolean
          payout_destination?: string
          price_dg?: number | null
          price_fiat?: number
          price_fiat_kobo?: number
          quantity_units: number
          service_manager_added?: boolean
          title: string
          unit_label: string
          updated_at?: string
          vendor_address: string
          vendor_id: string
        }
        Update: {
          bundle_address?: string
          bundle_type?: string
          chain_id?: number
          console?: string | null
          created_at?: string
          description?: string
          fiat_symbol?: string
          game_title?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          key_expiration_duration_seconds?: number
          location?: string
          metadata_set?: boolean
          payout_destination?: string
          price_dg?: number | null
          price_fiat?: number
          price_fiat_kobo?: number
          quantity_units?: number
          service_manager_added?: boolean
          title?: string
          unit_label?: string
          updated_at?: string
          vendor_address?: string
          vendor_id?: string
        }
        Relationships: []
      }
      gas_transactions: {
        Row: {
          block_number: number | null
          chain_id: number
          created_at: string | null
          event_id: string | null
          gas_cost_eth: number | null
          gas_cost_wei: number | null
          gas_price: number | null
          gas_used: number | null
          id: string
          payment_transaction_id: string | null
          service_wallet_address: string
          status: string | null
          transaction_hash: string
          updated_at: string | null
        }
        Insert: {
          block_number?: number | null
          chain_id: number
          created_at?: string | null
          event_id?: string | null
          gas_cost_eth?: number | null
          gas_cost_wei?: number | null
          gas_price?: number | null
          gas_used?: number | null
          id?: string
          payment_transaction_id?: string | null
          service_wallet_address: string
          status?: string | null
          transaction_hash: string
          updated_at?: string | null
        }
        Update: {
          block_number?: number | null
          chain_id?: number
          created_at?: string | null
          event_id?: string | null
          gas_cost_eth?: number | null
          gas_cost_wei?: number | null
          gas_price?: number | null
          gas_used?: number | null
          id?: string
          payment_transaction_id?: string | null
          service_wallet_address?: string
          status?: string | null
          transaction_hash?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gas_transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gas_transactions_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "paystack_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      gasless_activity_log: {
        Row: {
          activity: string
          chain_id: number
          created_at: string
          event_id: string | null
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          activity: string
          chain_id: number
          created_at?: string
          event_id?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          activity?: string
          chain_id?: number
          created_at?: string
          event_id?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gasless_activity_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      gasless_alerts: {
        Row: {
          alert_emails: string[] | null
          alert_type: string
          created_at: string | null
          enabled: boolean
          id: string
          last_triggered_at: string | null
          threshold_value: number
          updated_at: string | null
        }
        Insert: {
          alert_emails?: string[] | null
          alert_type: string
          created_at?: string | null
          enabled?: boolean
          id?: string
          last_triggered_at?: string | null
          threshold_value: number
          updated_at?: string | null
        }
        Update: {
          alert_emails?: string[] | null
          alert_type?: string
          created_at?: string | null
          enabled?: boolean
          id?: string
          last_triggered_at?: string | null
          threshold_value?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      gasless_attestation_log: {
        Row: {
          attestation_uid: string | null
          chain_id: number
          created_at: string | null
          event_id: string | null
          gas_cost_usd: number | null
          gas_used: number | null
          id: string
          recipient: string
          schema_uid: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          attestation_uid?: string | null
          chain_id: number
          created_at?: string | null
          event_id?: string | null
          gas_cost_usd?: number | null
          gas_used?: number | null
          id?: string
          recipient: string
          schema_uid: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          attestation_uid?: string | null
          chain_id?: number
          created_at?: string | null
          event_id?: string | null
          gas_cost_usd?: number | null
          gas_used?: number | null
          id?: string
          recipient?: string
          schema_uid?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      gasless_chains: {
        Row: {
          chain_id: number
          created_at: string | null
          enabled: boolean
          name: string
          rpc_url_override: string | null
          updated_at: string | null
        }
        Insert: {
          chain_id: number
          created_at?: string | null
          enabled?: boolean
          name: string
          rpc_url_override?: string | null
          updated_at?: string | null
        }
        Update: {
          chain_id?: number
          created_at?: string | null
          enabled?: boolean
          name?: string
          rpc_url_override?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      gasless_config: {
        Row: {
          created_at: string | null
          daily_global_limit_per_user: number
          enabled: boolean
          id: string
          log_sensitive_data: boolean
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          daily_global_limit_per_user?: number
          enabled?: boolean
          id?: string
          log_sensitive_data?: boolean
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          daily_global_limit_per_user?: number
          enabled?: boolean
          id?: string
          log_sensitive_data?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      gasless_schemas: {
        Row: {
          allow_revocations: boolean
          category: string
          created_at: string | null
          daily_limit_per_user: number | null
          enabled: boolean
          exempt_from_global_limit: boolean
          name: string
          schema_uid: string
          updated_at: string | null
        }
        Insert: {
          allow_revocations?: boolean
          category: string
          created_at?: string | null
          daily_limit_per_user?: number | null
          enabled?: boolean
          exempt_from_global_limit?: boolean
          name: string
          schema_uid: string
          updated_at?: string | null
        }
        Update: {
          allow_revocations?: boolean
          category?: string
          created_at?: string | null
          daily_limit_per_user?: number | null
          enabled?: boolean
          exempt_from_global_limit?: boolean
          name?: string
          schema_uid?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      key_grant_attempts: {
        Row: {
          attempt_number: number
          created_at: string | null
          error_message: string | null
          gas_cost_wei: number | null
          grant_tx_hash: string | null
          id: string
          payment_transaction_id: string
          service_wallet_balance_after: string | null
          service_wallet_balance_before: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          attempt_number?: number
          created_at?: string | null
          error_message?: string | null
          gas_cost_wei?: number | null
          grant_tx_hash?: string | null
          id?: string
          payment_transaction_id: string
          service_wallet_balance_after?: string | null
          service_wallet_balance_before?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          attempt_number?: number
          created_at?: string | null
          error_message?: string | null
          gas_cost_wei?: number | null
          grant_tx_hash?: string | null
          id?: string
          payment_transaction_id?: string
          service_wallet_balance_after?: string | null
          service_wallet_balance_before?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "key_grant_attempts_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "paystack_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      network_configs: {
        Row: {
          block_explorer_url: string | null
          chain_id: number
          chain_name: string
          created_at: string
          dg_token_address: string | null
          dg_vendor_address: string | null
          g_token_address: string | null
          id: string
          is_active: boolean
          is_mainnet: boolean
          native_currency_decimals: number | null
          native_currency_name: string | null
          native_currency_symbol: string
          refundable_event_manager_address: string | null
          rewards_controller_address: string | null
          rpc_url: string | null
          ticket_pass_controller_address: string | null
          uniswap_v3_eth_usdc_pool_address: string | null
          uniswap_v3_quoter_address: string | null
          uniswap_v3_up_weth_fee: number | null
          uniswap_v3_weth_address: string | null
          uniswap_v3_weth_usdc_fee: number | null
          unlock_factory_address: string | null
          up_token_address: string | null
          updated_at: string
          usdc_token_address: string | null
        }
        Insert: {
          block_explorer_url?: string | null
          chain_id: number
          chain_name: string
          created_at?: string
          dg_token_address?: string | null
          dg_vendor_address?: string | null
          g_token_address?: string | null
          id?: string
          is_active?: boolean
          is_mainnet?: boolean
          native_currency_decimals?: number | null
          native_currency_name?: string | null
          native_currency_symbol?: string
          refundable_event_manager_address?: string | null
          rewards_controller_address?: string | null
          rpc_url?: string | null
          ticket_pass_controller_address?: string | null
          uniswap_v3_eth_usdc_pool_address?: string | null
          uniswap_v3_quoter_address?: string | null
          uniswap_v3_up_weth_fee?: number | null
          uniswap_v3_weth_address?: string | null
          uniswap_v3_weth_usdc_fee?: number | null
          unlock_factory_address?: string | null
          up_token_address?: string | null
          updated_at?: string
          usdc_token_address?: string | null
        }
        Update: {
          block_explorer_url?: string | null
          chain_id?: number
          chain_name?: string
          created_at?: string
          dg_token_address?: string | null
          dg_vendor_address?: string | null
          g_token_address?: string | null
          id?: string
          is_active?: boolean
          is_mainnet?: boolean
          native_currency_decimals?: number | null
          native_currency_name?: string | null
          native_currency_symbol?: string
          refundable_event_manager_address?: string | null
          rewards_controller_address?: string | null
          rpc_url?: string | null
          ticket_pass_controller_address?: string | null
          uniswap_v3_eth_usdc_pool_address?: string | null
          uniswap_v3_quoter_address?: string | null
          uniswap_v3_up_weth_fee?: number | null
          uniswap_v3_weth_address?: string | null
          uniswap_v3_weth_usdc_fee?: number | null
          unlock_factory_address?: string | null
          up_token_address?: string | null
          updated_at?: string
          usdc_token_address?: string | null
        }
        Relationships: []
      }
      paystack_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          event_id: string
          gateway_response: Json | null
          id: string
          issuance_attempts: number
          issuance_last_error: string | null
          issuance_lock_id: string | null
          issuance_locked_at: string | null
          payout_account_id: string | null
          purchase_form_response: Json | null
          reference: string
          status: string
          updated_at: string
          user_email: string
          verified_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          event_id: string
          gateway_response?: Json | null
          id?: string
          issuance_attempts?: number
          issuance_last_error?: string | null
          issuance_lock_id?: string | null
          issuance_locked_at?: string | null
          payout_account_id?: string | null
          purchase_form_response?: Json | null
          reference: string
          status?: string
          updated_at?: string
          user_email: string
          verified_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          event_id?: string
          gateway_response?: Json | null
          id?: string
          issuance_attempts?: number
          issuance_last_error?: string | null
          issuance_lock_id?: string | null
          issuance_locked_at?: string | null
          payout_account_id?: string | null
          purchase_form_response?: Json | null
          reference?: string
          status?: string
          updated_at?: string
          user_email?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paystack_transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paystack_transactions_payout_account_id_fkey"
            columns: ["payout_account_id"]
            isOneToOne: false
            referencedRelation: "vendor_payout_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          content: string
          content_hash: string | null
          created_at: string | null
          deleted_by: string | null
          id: string
          ipfs_cid: string | null
          is_deleted: boolean | null
          nonce: number | null
          on_chain: boolean | null
          parent_comment_id: string | null
          post_id: string
          signature: string | null
          transaction_hash: string | null
          updated_at: string | null
          user_address: string
        }
        Insert: {
          content: string
          content_hash?: string | null
          created_at?: string | null
          deleted_by?: string | null
          id?: string
          ipfs_cid?: string | null
          is_deleted?: boolean | null
          nonce?: number | null
          on_chain?: boolean | null
          parent_comment_id?: string | null
          post_id: string
          signature?: string | null
          transaction_hash?: string | null
          updated_at?: string | null
          user_address: string
        }
        Update: {
          content?: string
          content_hash?: string | null
          created_at?: string | null
          deleted_by?: string | null
          id?: string
          ipfs_cid?: string | null
          is_deleted?: boolean | null
          nonce?: number | null
          on_chain?: boolean | null
          parent_comment_id?: string | null
          post_id?: string
          signature?: string | null
          transaction_hash?: string | null
          updated_at?: string | null
          user_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "event_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_engagement_stats: {
        Row: {
          agree_count: number | null
          comment_count: number | null
          disagree_count: number | null
          engagement_score: number | null
          post_id: string
          updated_at: string | null
        }
        Insert: {
          agree_count?: number | null
          comment_count?: number | null
          disagree_count?: number | null
          engagement_score?: number | null
          post_id: string
          updated_at?: string | null
        }
        Update: {
          agree_count?: number | null
          comment_count?: number | null
          disagree_count?: number | null
          engagement_score?: number | null
          post_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_engagement_stats_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "event_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          attestation_uid: string | null
          created_at: string | null
          id: string
          on_chain: boolean | null
          post_id: string
          reaction_type: string
          signature: string | null
          transaction_hash: string | null
          user_address: string
        }
        Insert: {
          attestation_uid?: string | null
          created_at?: string | null
          id?: string
          on_chain?: boolean | null
          post_id: string
          reaction_type: string
          signature?: string | null
          transaction_hash?: string | null
          user_address: string
        }
        Update: {
          attestation_uid?: string | null
          created_at?: string | null
          id?: string
          on_chain?: boolean | null
          post_id?: string
          reaction_type?: string
          signature?: string | null
          transaction_hash?: string | null
          user_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "event_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_pool_disputes: {
        Row: {
          category: string
          created_at: string
          disputer_address: string
          disputer_id: string
          evidence_urls: Json
          id: string
          onchain_tx_hash: string | null
          placement: number | null
          reason_hash: string
          reason_text: string | null
          resolution_hash: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          reward_pool_id: string
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          disputer_address: string
          disputer_id: string
          evidence_urls?: Json
          id?: string
          onchain_tx_hash?: string | null
          placement?: number | null
          reason_hash: string
          reason_text?: string | null
          resolution_hash?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          reward_pool_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          disputer_address?: string
          disputer_id?: string
          evidence_urls?: Json
          id?: string
          onchain_tx_hash?: string | null
          placement?: number | null
          reason_hash?: string
          reason_text?: string | null
          resolution_hash?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          reward_pool_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_pool_disputes_reward_pool_id_fkey"
            columns: ["reward_pool_id"]
            isOneToOne: false
            referencedRelation: "reward_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_pool_managers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          manager_address: string
          reward_pool_id: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          manager_address: string
          reward_pool_id: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          manager_address?: string
          reward_pool_id?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_pool_managers_reward_pool_id_fkey"
            columns: ["reward_pool_id"]
            isOneToOne: false
            referencedRelation: "reward_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_pool_positions: {
        Row: {
          amount_wei: string
          assigned_at: string | null
          claim_tx_hash: string | null
          claimed: boolean
          claimed_at: string | null
          created_at: string
          hold_until: string | null
          id: string
          placement: number
          reclaimed: boolean
          reward_pool_id: string
          updated_at: string
          winner_address: string | null
          winner_alias: string | null
        }
        Insert: {
          amount_wei: string
          assigned_at?: string | null
          claim_tx_hash?: string | null
          claimed?: boolean
          claimed_at?: string | null
          created_at?: string
          hold_until?: string | null
          id?: string
          placement: number
          reclaimed?: boolean
          reward_pool_id: string
          updated_at?: string
          winner_address?: string | null
          winner_alias?: string | null
        }
        Update: {
          amount_wei?: string
          assigned_at?: string | null
          claim_tx_hash?: string | null
          claimed?: boolean
          claimed_at?: string | null
          created_at?: string
          hold_until?: string | null
          id?: string
          placement?: number
          reclaimed?: boolean
          reward_pool_id?: string
          updated_at?: string
          winner_address?: string | null
          winner_alias?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reward_pool_positions_reward_pool_id_fkey"
            columns: ["reward_pool_id"]
            isOneToOne: false
            referencedRelation: "reward_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_pools: {
        Row: {
          attendance_controller_address: string | null
          chain_id: number
          challenge_window_secs: number
          claim_end: string
          claim_start: string
          claimed_amount_wei: string
          controller_address: string
          created_at: string
          creator_address: string
          creator_id: string
          event_lock_address: string
          frozen: boolean
          frozen_accrued_secs: number
          id: string
          payout_token_address: string | null
          payout_token_symbol: string | null
          pool_id: number
          position_count: number
          rules_hash: string
          rules_uri: string | null
          status: string
          token_decimals: number | null
          total_funded_wei: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          attendance_controller_address?: string | null
          chain_id: number
          challenge_window_secs: number
          claim_end: string
          claim_start: string
          claimed_amount_wei?: string
          controller_address: string
          created_at?: string
          creator_address: string
          creator_id: string
          event_lock_address: string
          frozen?: boolean
          frozen_accrued_secs?: number
          id?: string
          payout_token_address?: string | null
          payout_token_symbol?: string | null
          pool_id: number
          position_count: number
          rules_hash: string
          rules_uri?: string | null
          status?: string
          token_decimals?: number | null
          total_funded_wei: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          attendance_controller_address?: string | null
          chain_id?: number
          challenge_window_secs?: number
          claim_end?: string
          claim_start?: string
          claimed_amount_wei?: string
          controller_address?: string
          created_at?: string
          creator_address?: string
          creator_id?: string
          event_lock_address?: string
          frozen?: boolean
          frozen_accrued_secs?: number
          id?: string
          payout_token_address?: string | null
          payout_token_symbol?: string | null
          pool_id?: number
          position_count?: number
          rules_hash?: string
          rules_uri?: string | null
          status?: string
          token_decimals?: number | null
          total_funded_wei?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ticket_pass_orders: {
        Row: {
          amount_fiat: number | null
          buyer_address: string | null
          buyer_email: string | null
          buyer_id: string | null
          chain_id: number
          created_at: string
          creator_id: string
          dispensed_at: string | null
          fiat_symbol: string | null
          gateway_response: Json | null
          grant_dispense_txn_hash: string | null
          id: string
          issuance_attempts: number
          issuance_lock_id: string | null
          issuance_locked_at: string | null
          last_error: string | null
          lock_address: string
          order_ref: string | null
          pass_id: string
          payment_provider: string
          payment_reference: string | null
          refund_amount_kobo: number | null
          refund_error: string | null
          refund_id: string | null
          refund_last_synced_at: string | null
          refund_processed_at: string | null
          refund_reference: string | null
          refund_requested_at: string | null
          refund_status: string | null
          status: string
          token_id: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          amount_fiat?: number | null
          buyer_address?: string | null
          buyer_email?: string | null
          buyer_id?: string | null
          chain_id: number
          created_at?: string
          creator_id: string
          dispensed_at?: string | null
          fiat_symbol?: string | null
          gateway_response?: Json | null
          grant_dispense_txn_hash?: string | null
          id?: string
          issuance_attempts?: number
          issuance_lock_id?: string | null
          issuance_locked_at?: string | null
          last_error?: string | null
          lock_address: string
          order_ref?: string | null
          pass_id: string
          payment_provider?: string
          payment_reference?: string | null
          refund_amount_kobo?: number | null
          refund_error?: string | null
          refund_id?: string | null
          refund_last_synced_at?: string | null
          refund_processed_at?: string | null
          refund_reference?: string | null
          refund_requested_at?: string | null
          refund_status?: string | null
          status?: string
          token_id?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          amount_fiat?: number | null
          buyer_address?: string | null
          buyer_email?: string | null
          buyer_id?: string | null
          chain_id?: number
          created_at?: string
          creator_id?: string
          dispensed_at?: string | null
          fiat_symbol?: string | null
          gateway_response?: Json | null
          grant_dispense_txn_hash?: string | null
          id?: string
          issuance_attempts?: number
          issuance_lock_id?: string | null
          issuance_locked_at?: string | null
          last_error?: string | null
          lock_address?: string
          order_ref?: string | null
          pass_id?: string
          payment_provider?: string
          payment_reference?: string | null
          refund_amount_kobo?: number | null
          refund_error?: string | null
          refund_id?: string | null
          refund_last_synced_at?: string | null
          refund_processed_at?: string | null
          refund_reference?: string | null
          refund_requested_at?: string | null
          refund_status?: string | null
          status?: string
          token_id?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_pass_orders_pass_id_fkey"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "ticket_passes"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_passes: {
        Row: {
          chain_id: number
          controller_address: string
          created_at: string
          creator_address: string
          creator_id: string
          deploy_txn_hash: string | null
          description: string
          escrow_eth_total_wei: string
          escrow_token_total_wei: string
          eth_per_copy_wei: string
          fiat_symbol: string
          id: string
          image_url: string | null
          issuance_enabled: boolean
          key_expiration_duration_seconds: number
          lock_address: string
          max_copies: number
          max_per_buyer: number
          metadata_set: boolean
          payout_destination: string
          payout_token_address: string | null
          payout_token_symbol: string | null
          price_fiat: number
          price_fiat_kobo: number | null
          status: string
          target_event_address: string | null
          title: string
          token_decimals: number | null
          token_per_copy_wei: string
          updated_at: string
        }
        Insert: {
          chain_id: number
          controller_address: string
          created_at?: string
          creator_address: string
          creator_id: string
          deploy_txn_hash?: string | null
          description: string
          escrow_eth_total_wei?: string
          escrow_token_total_wei?: string
          eth_per_copy_wei?: string
          fiat_symbol?: string
          id?: string
          image_url?: string | null
          issuance_enabled?: boolean
          key_expiration_duration_seconds: number
          lock_address: string
          max_copies: number
          max_per_buyer?: number
          metadata_set?: boolean
          payout_destination?: string
          payout_token_address?: string | null
          payout_token_symbol?: string | null
          price_fiat?: number
          price_fiat_kobo?: number | null
          status?: string
          target_event_address?: string | null
          title: string
          token_decimals?: number | null
          token_per_copy_wei?: string
          updated_at?: string
        }
        Update: {
          chain_id?: number
          controller_address?: string
          created_at?: string
          creator_address?: string
          creator_id?: string
          deploy_txn_hash?: string | null
          description?: string
          escrow_eth_total_wei?: string
          escrow_token_total_wei?: string
          eth_per_copy_wei?: string
          fiat_symbol?: string
          id?: string
          image_url?: string | null
          issuance_enabled?: boolean
          key_expiration_duration_seconds?: number
          lock_address?: string
          max_copies?: number
          max_per_buyer?: number
          metadata_set?: boolean
          payout_destination?: string
          payout_token_address?: string | null
          payout_token_symbol?: string | null
          price_fiat?: number
          price_fiat_kobo?: number | null
          status?: string
          target_event_address?: string | null
          title?: string
          token_decimals?: number | null
          token_per_copy_wei?: string
          updated_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          created_at: string | null
          event_id: string
          expires_at: string | null
          grant_tx_hash: string | null
          granted_at: string | null
          id: string
          owner_wallet: string
          payment_transaction_id: string | null
          purchase_confirmation_message_snapshot: string | null
          purchase_confirmation_message_snapshot_at: string | null
          purchase_form_response_snapshot: Json | null
          purchase_form_schema_version_at: string | null
          status: string | null
          token_id: string | null
          updated_at: string | null
          user_email: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          expires_at?: string | null
          grant_tx_hash?: string | null
          granted_at?: string | null
          id?: string
          owner_wallet: string
          payment_transaction_id?: string | null
          purchase_confirmation_message_snapshot?: string | null
          purchase_confirmation_message_snapshot_at?: string | null
          purchase_form_response_snapshot?: Json | null
          purchase_form_schema_version_at?: string | null
          status?: string | null
          token_id?: string | null
          updated_at?: string | null
          user_email?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          expires_at?: string | null
          grant_tx_hash?: string | null
          granted_at?: string | null
          id?: string
          owner_wallet?: string
          payment_transaction_id?: string | null
          purchase_confirmation_message_snapshot?: string | null
          purchase_confirmation_message_snapshot_at?: string | null
          purchase_form_response_snapshot?: Json | null
          purchase_form_schema_version_at?: string | null
          status?: string | null
          token_id?: string | null
          updated_at?: string | null
          user_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "paystack_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_payout_accounts: {
        Row: {
          account_holder_name: string
          account_number_hash: string
          account_number_last4: string
          bank_code: string
          bank_name: string
          created_at: string
          currency: string
          encrypted_account_number: string
          id: string
          provider: string
          provider_metadata: Json
          provider_recipient_code: string | null
          provider_recipient_id: string | null
          revealed_at: string | null
          status: string
          suspended_at: string | null
          updated_at: string
          user_id: string
          verification_error: string | null
          verified_at: string | null
        }
        Insert: {
          account_holder_name: string
          account_number_hash: string
          account_number_last4: string
          bank_code: string
          bank_name: string
          created_at?: string
          currency?: string
          encrypted_account_number: string
          id?: string
          provider?: string
          provider_metadata?: Json
          provider_recipient_code?: string | null
          provider_recipient_id?: string | null
          revealed_at?: string | null
          status?: string
          suspended_at?: string | null
          updated_at?: string
          user_id: string
          verification_error?: string | null
          verified_at?: string | null
        }
        Update: {
          account_holder_name?: string
          account_number_hash?: string
          account_number_last4?: string
          bank_code?: string
          bank_name?: string
          created_at?: string
          currency?: string
          encrypted_account_number?: string
          id?: string
          provider?: string
          provider_metadata?: Json
          provider_recipient_code?: string | null
          provider_recipient_id?: string | null
          revealed_at?: string | null
          status?: string
          suspended_at?: string | null
          updated_at?: string
          user_id?: string
          verification_error?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      user_reputation: {
        Row: {
          created_at: string
          dishonest_attestations: number
          failed_challenges: number
          honest_attestations: number
          id: string
          reputation_score: number
          successful_challenges: number
          total_attestations: number
          updated_at: string
          user_address: string
        }
        Insert: {
          created_at?: string
          dishonest_attestations?: number
          failed_challenges?: number
          honest_attestations?: number
          id?: string
          reputation_score?: number
          successful_challenges?: number
          total_attestations?: number
          updated_at?: string
          user_address: string
        }
        Update: {
          created_at?: string
          dishonest_attestations?: number
          failed_challenges?: number
          honest_attestations?: number
          id?: string
          reputation_score?: number
          successful_challenges?: number
          total_attestations?: number
          updated_at?: string
          user_address?: string
        }
        Relationships: []
      }
      vendor_lock_purchases: {
        Row: {
          chain_id: number
          created_at: string
          currency: string | null
          id: string
          lock_address: string
          price_paid_wei: string | null
          purchase_timestamp: string
          purchaser_id: string
          tx_hash: string
          vendor_lock_id: string
          wallet_address: string
        }
        Insert: {
          chain_id: number
          created_at?: string
          currency?: string | null
          id?: string
          lock_address: string
          price_paid_wei?: string | null
          purchase_timestamp?: string
          purchaser_id: string
          tx_hash: string
          vendor_lock_id: string
          wallet_address: string
        }
        Update: {
          chain_id?: number
          created_at?: string
          currency?: string | null
          id?: string
          lock_address?: string
          price_paid_wei?: string | null
          purchase_timestamp?: string
          purchaser_id?: string
          tx_hash?: string
          vendor_lock_id?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_lock_purchases_vendor_lock_id_fkey"
            columns: ["vendor_lock_id"]
            isOneToOne: false
            referencedRelation: "vendor_lock_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_lock_settings: {
        Row: {
          benefits: Json | null
          chain_id: number
          created_at: string
          created_by: string | null
          currency: string
          currency_address: string
          description: string | null
          expiration_duration_seconds: number | null
          id: string
          image_url: string | null
          is_active: boolean
          is_transferable: boolean
          key_price_display: number
          key_price_wei: string
          lock_address: string
          lock_name: string
          lock_symbol: string | null
          max_keys_per_address: number | null
          updated_at: string
        }
        Insert: {
          benefits?: Json | null
          chain_id: number
          created_at?: string
          created_by?: string | null
          currency: string
          currency_address: string
          description?: string | null
          expiration_duration_seconds?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_transferable?: boolean
          key_price_display: number
          key_price_wei: string
          lock_address: string
          lock_name: string
          lock_symbol?: string | null
          max_keys_per_address?: number | null
          updated_at?: string
        }
        Update: {
          benefits?: Json | null
          chain_id?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          currency_address?: string
          description?: string | null
          expiration_duration_seconds?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_transferable?: boolean
          key_price_display?: number
          key_price_wei?: string
          lock_address?: string
          lock_name?: string
          lock_symbol?: string | null
          max_keys_per_address?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      vendor_payout_accounts: {
        Row: {
          account_holder_name: string | null
          account_number: string | null
          business_name: string
          contact_email: string | null
          created_at: string | null
          currency: string
          id: string
          is_verified: boolean | null
          mobile_network: string | null
          percentage_charge: number | null
          phone_number: string | null
          provider: string
          provider_account_code: string | null
          provider_account_id: string | null
          provider_metadata: Json | null
          settlement_bank_code: string | null
          settlement_bank_name: string | null
          settlement_schedule: string | null
          status: string
          submitted_at: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string | null
          vendor_id: string
          verification_error: string | null
          verification_status: string | null
          verified_at: string | null
        }
        Insert: {
          account_holder_name?: string | null
          account_number?: string | null
          business_name: string
          contact_email?: string | null
          created_at?: string | null
          currency?: string
          id?: string
          is_verified?: boolean | null
          mobile_network?: string | null
          percentage_charge?: number | null
          phone_number?: string | null
          provider?: string
          provider_account_code?: string | null
          provider_account_id?: string | null
          provider_metadata?: Json | null
          settlement_bank_code?: string | null
          settlement_bank_name?: string | null
          settlement_schedule?: string | null
          status?: string
          submitted_at?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          vendor_id: string
          verification_error?: string | null
          verification_status?: string | null
          verified_at?: string | null
        }
        Update: {
          account_holder_name?: string | null
          account_number?: string | null
          business_name?: string
          contact_email?: string | null
          created_at?: string | null
          currency?: string
          id?: string
          is_verified?: boolean | null
          mobile_network?: string | null
          percentage_charge?: number | null
          phone_number?: string | null
          provider?: string
          provider_account_code?: string | null
          provider_account_id?: string | null
          provider_metadata?: Json | null
          settlement_bank_code?: string | null
          settlement_bank_name?: string | null
          settlement_schedule?: string | null
          status?: string
          submitted_at?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          vendor_id?: string
          verification_error?: string | null
          verification_status?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      tickets_public: {
        Row: {
          created_at: string | null
          event_id: string | null
          expires_at: string | null
          grant_tx_hash: string | null
          granted_at: string | null
          id: string | null
          owner_wallet: string | null
          payment_transaction_id: string | null
          status: string | null
          token_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id?: string | null
          expires_at?: string | null
          grant_tx_hash?: string | null
          granted_at?: string | null
          id?: string | null
          owner_wallet?: string | null
          payment_transaction_id?: string | null
          status?: string | null
          token_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string | null
          expires_at?: string | null
          grant_tx_hash?: string | null
          granted_at?: string | null
          id?: string | null
          owner_wallet?: string | null
          payment_transaction_id?: string | null
          status?: string | null
          token_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "paystack_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      acquire_dg_redemption_intent_lock: {
        Args: {
          p_intent_id: string
          p_lock_id: string
          p_stale_before: string
          p_tx_hash: string
          p_user_id: string
        }
        Returns: {
          amount_dg_raw: string
          attempts: number
          chain_id: number
          completed_at: string | null
          created_at: string
          dg_token_address: string
          estimated_up_out_raw: string
          expires_at: string
          fee_breakdown: Json
          fee_transfer_completed_at: string | null
          fee_transfer_last_error: string | null
          fee_transfer_raw_tx: string | null
          fee_transfer_status: string
          fee_transfer_tx_hash: string | null
          gross_ngn_kobo: number
          gross_usdc_micro: number | null
          id: string
          last_error: string | null
          limits_snapshot: Json
          lock_id: string | null
          locked_at: string | null
          net_dg_raw: string
          net_payout_kobo: number
          net_payout_usdc_micro: number | null
          payout_account_id: string | null
          payout_method: string
          payout_raw_tx: string | null
          payout_snapshot: Json
          payout_token_address: string | null
          payout_tx_hash: string | null
          payout_wallet_address: string | null
          paystack_reference: string
          paystack_status: string | null
          paystack_transfer_code: string | null
          paystack_transfer_id: string | null
          pricing_snapshot: Json
          redemption_wallet_address: string
          service_fee_kobo: number
          service_fee_usdc_micro: number | null
          status: string
          total_fee_kobo: number
          total_fee_usdc_micro: number | null
          tx_hash: string | null
          up_token_address: string
          updated_at: string
          user_id: string
          vat_basis: string
          vat_basis_kobo: number
          vat_kobo: number
          vat_rate_bps: number
          vendor_address: string
          vendor_fee_dg_raw: string
          vendor_snapshot: Json
          wallet_address: string
        }
        SetofOptions: {
          from: "*"
          to: "dg_redemption_intents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      acquire_dg_redemption_retry_lock: {
        Args: {
          p_admin_user_id: string
          p_intent_id: string
          p_lock_id: string
          p_stale_before: string
        }
        Returns: {
          amount_dg_raw: string
          attempts: number
          chain_id: number
          completed_at: string | null
          created_at: string
          dg_token_address: string
          estimated_up_out_raw: string
          expires_at: string
          fee_breakdown: Json
          fee_transfer_completed_at: string | null
          fee_transfer_last_error: string | null
          fee_transfer_raw_tx: string | null
          fee_transfer_status: string
          fee_transfer_tx_hash: string | null
          gross_ngn_kobo: number
          gross_usdc_micro: number | null
          id: string
          last_error: string | null
          limits_snapshot: Json
          lock_id: string | null
          locked_at: string | null
          net_dg_raw: string
          net_payout_kobo: number
          net_payout_usdc_micro: number | null
          payout_account_id: string | null
          payout_method: string
          payout_raw_tx: string | null
          payout_snapshot: Json
          payout_token_address: string | null
          payout_tx_hash: string | null
          payout_wallet_address: string | null
          paystack_reference: string
          paystack_status: string | null
          paystack_transfer_code: string | null
          paystack_transfer_id: string | null
          pricing_snapshot: Json
          redemption_wallet_address: string
          service_fee_kobo: number
          service_fee_usdc_micro: number | null
          status: string
          total_fee_kobo: number
          total_fee_usdc_micro: number | null
          tx_hash: string | null
          up_token_address: string
          updated_at: string
          user_id: string
          vat_basis: string
          vat_basis_kobo: number
          vat_kobo: number
          vat_rate_bps: number
          vendor_address: string
          vendor_fee_dg_raw: string
          vendor_snapshot: Json
          wallet_address: string
        }
        SetofOptions: {
          from: "*"
          to: "dg_redemption_intents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_and_increment_csp_rate_limit: {
        Args: { p_ip: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      check_gasless_limit: {
        Args: { p_activity: string; p_daily_limit: number; p_user_id: string }
        Returns: {
          allowed: boolean
          remaining: number
        }[]
      }
      check_gasless_rate_limit: {
        Args: { p_schema_uid: string; p_user_id: string }
        Returns: Record<string, unknown>
      }
      create_dg_redemption_intent: {
        Args: {
          p_amount_dg_raw: string
          p_chain_id: number
          p_dg_token_address: string
          p_estimated_up_out_raw: string
          p_expires_at: string
          p_fee_breakdown: Json
          p_gross_ngn_kobo: number
          p_gross_usdc_micro?: number
          p_limits_snapshot: Json
          p_net_dg_raw: string
          p_net_payout_kobo: number
          p_net_payout_usdc_micro?: number
          p_payout_account_id: string
          p_payout_method?: string
          p_payout_snapshot: Json
          p_payout_token_address?: string
          p_payout_wallet_address?: string
          p_payout_wallet_balance_usdc_micro?: number
          p_paystack_reference: string
          p_platform_daily_limit_kobo: number
          p_platform_daily_limit_usdc_micro?: number
          p_pricing_snapshot: Json
          p_redemption_wallet_address: string
          p_service_fee_kobo: number
          p_service_fee_usdc_micro?: number
          p_total_fee_kobo: number
          p_total_fee_usdc_micro?: number
          p_up_token_address: string
          p_user_daily_limit_kobo: number
          p_user_daily_limit_usdc_micro?: number
          p_user_id: string
          p_vat_basis: string
          p_vat_basis_kobo: number
          p_vat_kobo: number
          p_vat_rate_bps: number
          p_vendor_address: string
          p_vendor_fee_dg_raw: string
          p_vendor_snapshot: Json
          p_wallet_address: string
        }
        Returns: {
          amount_dg_raw: string
          attempts: number
          chain_id: number
          completed_at: string | null
          created_at: string
          dg_token_address: string
          estimated_up_out_raw: string
          expires_at: string
          fee_breakdown: Json
          fee_transfer_completed_at: string | null
          fee_transfer_last_error: string | null
          fee_transfer_raw_tx: string | null
          fee_transfer_status: string
          fee_transfer_tx_hash: string | null
          gross_ngn_kobo: number
          gross_usdc_micro: number | null
          id: string
          last_error: string | null
          limits_snapshot: Json
          lock_id: string | null
          locked_at: string | null
          net_dg_raw: string
          net_payout_kobo: number
          net_payout_usdc_micro: number | null
          payout_account_id: string | null
          payout_method: string
          payout_raw_tx: string | null
          payout_snapshot: Json
          payout_token_address: string | null
          payout_tx_hash: string | null
          payout_wallet_address: string | null
          paystack_reference: string
          paystack_status: string | null
          paystack_transfer_code: string | null
          paystack_transfer_id: string | null
          pricing_snapshot: Json
          redemption_wallet_address: string
          service_fee_kobo: number
          service_fee_usdc_micro: number | null
          status: string
          total_fee_kobo: number
          total_fee_usdc_micro: number | null
          tx_hash: string | null
          up_token_address: string
          updated_at: string
          user_id: string
          vat_basis: string
          vat_basis_kobo: number
          vat_kobo: number
          vat_rate_bps: number
          vendor_address: string
          vendor_fee_dg_raw: string
          vendor_snapshot: Json
          wallet_address: string
        }
        SetofOptions: {
          from: "*"
          to: "dg_redemption_intents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_reward_pool_mirror: {
        Args: { p_managers: Json; p_pool: Json; p_positions: Json }
        Returns: {
          attendance_controller_address: string | null
          chain_id: number
          challenge_window_secs: number
          claim_end: string
          claim_start: string
          claimed_amount_wei: string
          controller_address: string
          created_at: string
          creator_address: string
          creator_id: string
          event_lock_address: string
          frozen: boolean
          frozen_accrued_secs: number
          id: string
          payout_token_address: string | null
          payout_token_symbol: string | null
          pool_id: number
          position_count: number
          rules_hash: string
          rules_uri: string | null
          status: string
          token_decimals: number | null
          total_funded_wei: string
          tx_hash: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "reward_pools"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_game_results: { Args: never; Returns: Json }
      get_my_purchase_form_prefill: {
        Args: { p_owner_wallet: string }
        Returns: Json
      }
      get_my_ticket_email: { Args: { p_owner_wallet: string }; Returns: string }
      get_user_daily_attestation_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_user_schema_daily_attestation_count: {
        Args: { p_schema_uid: string; p_user_id: string }
        Returns: number
      }
      get_waitlist_count: { Args: { p_event_id: string }; Returns: number }
      ingest_reward_pool_results: { Args: { p_rows: Json }; Returns: number }
      replace_user_payout_account: {
        Args: {
          p_account_holder_name: string
          p_account_number_hash: string
          p_account_number_last4: string
          p_bank_code: string
          p_bank_name: string
          p_encrypted_account_number: string
          p_provider_metadata: Json
          p_provider_recipient_code: string
          p_provider_recipient_id: string
          p_user_id: string
        }
        Returns: {
          account_holder_name: string
          account_number_hash: string
          account_number_last4: string
          bank_code: string
          bank_name: string
          created_at: string
          currency: string
          encrypted_account_number: string
          id: string
          provider: string
          provider_metadata: Json
          provider_recipient_code: string | null
          provider_recipient_id: string | null
          revealed_at: string | null
          status: string
          suspended_at: string | null
          updated_at: string
          user_id: string
          verification_error: string | null
          verified_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "user_payout_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_extended_placements: {
        Args: { p_entries: Json; p_event_id: string }
        Returns: number
      }
      update_reputation_score: {
        Args: {
          attestation_type?: string
          score_change: number
          user_addr: string
        }
        Returns: undefined
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

