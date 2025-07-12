export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
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
      event_drafts: {
        Row: {
          capacity: number
          category: string
          created_at: string
          currency: string
          date: string | null
          description: string
          id: string
          image_url: string | null
          location: string
          ngn_price: number | null
          payment_methods: string[] | null
          paystack_public_key: string | null
          price: number
          time: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          capacity?: number
          category?: string
          created_at?: string
          currency?: string
          date?: string | null
          description?: string
          id?: string
          image_url?: string | null
          location?: string
          ngn_price?: number | null
          payment_methods?: string[] | null
          paystack_public_key?: string | null
          price?: number
          time?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          capacity?: number
          category?: string
          created_at?: string
          currency?: string
          date?: string | null
          description?: string
          id?: string
          image_url?: string | null
          location?: string
          ngn_price?: number | null
          payment_methods?: string[] | null
          paystack_public_key?: string | null
          price?: number
          time?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          attendance_schema_uid: string | null
          attestation_enabled: boolean
          capacity: number
          category: string
          chain_id: number
          created_at: string
          creator_id: string
          currency: string
          date: string | null
          description: string
          id: string
          image_url: string | null
          location: string
          lock_address: string
          max_keys_per_address: number
          ngn_price: number | null
          payment_methods: string[] | null
          paystack_public_key: string | null
          price: number
          requires_approval: boolean
          review_schema_uid: string | null
          time: string
          title: string
          transaction_hash: string
          transferable: boolean
          updated_at: string
        }
        Insert: {
          attendance_schema_uid?: string | null
          attestation_enabled?: boolean
          capacity: number
          category: string
          chain_id?: number
          created_at?: string
          creator_id: string
          currency?: string
          date?: string | null
          description: string
          id?: string
          image_url?: string | null
          location: string
          lock_address: string
          max_keys_per_address?: number
          ngn_price?: number | null
          payment_methods?: string[] | null
          paystack_public_key?: string | null
          price?: number
          requires_approval?: boolean
          review_schema_uid?: string | null
          time: string
          title: string
          transaction_hash: string
          transferable?: boolean
          updated_at?: string
        }
        Update: {
          attendance_schema_uid?: string | null
          attestation_enabled?: boolean
          capacity?: number
          category?: string
          chain_id?: number
          created_at?: string
          creator_id?: string
          currency?: string
          date?: string | null
          description?: string
          id?: string
          image_url?: string | null
          location?: string
          lock_address?: string
          max_keys_per_address?: number
          ngn_price?: number | null
          payment_methods?: string[] | null
          paystack_public_key?: string | null
          price?: number
          requires_approval?: boolean
          review_schema_uid?: string | null
          time?: string
          title?: string
          transaction_hash?: string
          transferable?: boolean
          updated_at?: string
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
          id: string
          is_active: boolean
          is_mainnet: boolean
          native_currency_symbol: string
          rpc_url: string | null
          updated_at: string
          usdc_token_address: string | null
        }
        Insert: {
          block_explorer_url?: string | null
          chain_id: number
          chain_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_mainnet?: boolean
          native_currency_symbol?: string
          rpc_url?: string | null
          updated_at?: string
          usdc_token_address?: string | null
        }
        Update: {
          block_explorer_url?: string | null
          chain_id?: number
          chain_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_mainnet?: boolean
          native_currency_symbol?: string
          rpc_url?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      update_reputation_score: {
        Args: {
          user_addr: string
          score_change: number
          attestation_type?: string
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
  public: {
    Enums: {},
  },
} as const
