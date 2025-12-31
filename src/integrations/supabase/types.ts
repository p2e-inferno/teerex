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
          event_type: string
          has_allow_list: boolean | null
          id: string
          image_crop_x: number | null
          image_crop_y: number | null
          image_url: string | null
          is_public: boolean | null
          location: string
          ngn_price: number | null
          payment_methods: string[] | null
          paystack_public_key: string | null
          price: number
          ticket_duration: string | null
          time: string
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
          event_type?: string
          has_allow_list?: boolean | null
          id?: string
          image_crop_x?: number | null
          image_crop_y?: number | null
          image_url?: string | null
          is_public?: boolean | null
          location?: string
          ngn_price?: number | null
          payment_methods?: string[] | null
          paystack_public_key?: string | null
          price?: number
          ticket_duration?: string | null
          time?: string
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
          event_type?: string
          has_allow_list?: boolean | null
          id?: string
          image_crop_x?: number | null
          image_crop_y?: number | null
          image_url?: string | null
          is_public?: boolean | null
          location?: string
          ngn_price?: number | null
          payment_methods?: string[] | null
          paystack_public_key?: string | null
          price?: number
          ticket_duration?: string | null
          time?: string
          title?: string
          transferable?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          event_type: string
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
          payment_methods: string[] | null
          paystack_public_key: string | null
          price: number
          requires_approval: boolean
          review_schema_uid: string | null
          service_manager_added: boolean
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
          event_type?: string
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
          payment_methods?: string[] | null
          paystack_public_key?: string | null
          price?: number
          requires_approval?: boolean
          review_schema_uid?: string | null
          service_manager_added?: boolean
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
          event_type?: string
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
          payment_methods?: string[] | null
          paystack_public_key?: string | null
          price?: number
          requires_approval?: boolean
          review_schema_uid?: string | null
          service_manager_added?: boolean
          ticket_duration?: string | null
          time?: string
          title?: string
          transaction_hash?: string
          transferable?: boolean
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
          id: string
          nft_recipient_address: string | null
          payment_provider: string
          payment_reference: string | null
          status: string
          token_id: string | null
          txn_hash: string | null
          updated_at: string
          vendor_address: string
          vendor_id: string
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
          id?: string
          nft_recipient_address?: string | null
          payment_provider?: string
          payment_reference?: string | null
          status?: string
          token_id?: string | null
          txn_hash?: string | null
          updated_at?: string
          vendor_address: string
          vendor_id: string
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
          id?: string
          nft_recipient_address?: string | null
          payment_provider?: string
          payment_reference?: string | null
          status?: string
          token_id?: string | null
          txn_hash?: string | null
          updated_at?: string
          vendor_address?: string
          vendor_id?: string
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
          price_dg: number | null
          price_fiat: number
          quantity_units: number
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
          price_dg?: number | null
          price_fiat?: number
          quantity_units: number
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
          price_dg?: number | null
          price_fiat?: number
          quantity_units?: number
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
          g_token_address: string | null
          id: string
          is_active: boolean
          is_mainnet: boolean
          native_currency_decimals: number | null
          native_currency_name: string | null
          native_currency_symbol: string
          rpc_url: string | null
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
          g_token_address?: string | null
          id?: string
          is_active?: boolean
          is_mainnet?: boolean
          native_currency_decimals?: number | null
          native_currency_name?: string | null
          native_currency_symbol?: string
          rpc_url?: string | null
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
          g_token_address?: string | null
          id?: string
          is_active?: boolean
          is_mainnet?: boolean
          native_currency_decimals?: number | null
          native_currency_name?: string | null
          native_currency_symbol?: string
          rpc_url?: string | null
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
          payout_account_id: string | null
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
          payout_account_id?: string | null
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
          payout_account_id?: string | null
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

