export type Database = {
  public: {
    Tables: {
      network_configs: {
        Row: {
          id: string
          chain_id: number
          chain_name: string
          usdc_token_address: string | null
          native_currency_symbol: string
          rpc_url: string | null
          block_explorer_url: string | null
          is_mainnet: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          chain_id: number
          chain_name: string
          usdc_token_address?: string | null
          native_currency_symbol?: string
          rpc_url?: string | null
          block_explorer_url?: string | null
          is_mainnet?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          chain_id?: number
          chain_name?: string
          usdc_token_address?: string | null
          native_currency_symbol?: string
          rpc_url?: string | null
          block_explorer_url?: string | null
          is_mainnet?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      paystack_transactions: {
        Row: {
          id: string
          event_id: string
          amount: number
          gateway_response: any | null
          verified_at: string | null
          created_at: string
          updated_at: string
          user_email: string
          reference: string
          status: string
          currency: string
        }
        Insert: {
          id?: string
          event_id: string
          amount: number
          gateway_response?: any | null
          verified_at?: string | null
          created_at?: string
          updated_at?: string
          user_email: string
          reference: string
          status?: string
          currency?: string
        }
        Update: {
          id?: string
          event_id?: string
          amount?: number
          gateway_response?: any | null
          verified_at?: string | null
          created_at?: string
          updated_at?: string
          user_email?: string
          reference?: string
          status?: string
          currency?: string
        }
      }
      events: {
        Row: {
          id: string
          creator_id: string
          title: string
          description: string
          date: string | null
          time: string
          location: string
          capacity: number
          price: number
          currency: string
          ngn_price: number | null
          payment_methods: string[] | null
          paystack_public_key: string | null
          category: string
          image_url: string | null
          lock_address: string
          transaction_hash: string
          chain_id: number
          created_at: string
          updated_at: string
          attestation_enabled: boolean
          attendance_schema_uid: string | null
          review_schema_uid: string | null
          max_keys_per_address: number
          transferable: boolean
          requires_approval: boolean
        }
        Insert: {
          id?: string
          creator_id: string
          title: string
          description: string
          date?: string | null
          time: string
          location: string
          capacity: number
          price?: number
          currency?: string
          ngn_price?: number | null
          payment_methods?: string[] | null
          paystack_public_key?: string | null
          category: string
          image_url?: string | null
          lock_address: string
          transaction_hash: string
          chain_id?: number
          created_at?: string
          updated_at?: string
          attestation_enabled?: boolean
          attendance_schema_uid?: string | null
          review_schema_uid?: string | null
          max_keys_per_address?: number
          transferable?: boolean
          requires_approval?: boolean
        }
        Update: {
          id?: string
          creator_id?: string
          title?: string
          description?: string
          date?: string | null
          time?: string
          location?: string
          capacity?: number
          price?: number
          currency?: string
          ngn_price?: number | null
          payment_methods?: string[] | null
          paystack_public_key?: string | null
          category?: string
          image_url?: string | null
          lock_address?: string
          transaction_hash?: string
          chain_id?: number
          created_at?: string
          updated_at?: string
          attestation_enabled?: boolean
          attendance_schema_uid?: string | null
          review_schema_uid?: string | null
          max_keys_per_address?: number
          transferable?: boolean
          requires_approval?: boolean
        }
      }
      event_allow_list: {
        Row: {
          id: string
          event_id: string
          wallet_address: string
          added_by: string | null
          created_at: string
          user_email: string | null
        }
        Insert: {
          id?: string
          event_id: string
          wallet_address: string
          added_by?: string | null
          created_at?: string
          user_email?: string | null
        }
        Update: {
          id?: string
          event_id?: string
          wallet_address?: string
          added_by?: string | null
          created_at?: string
          user_email?: string | null
        }
      }
      event_allow_list_requests: {
        Row: {
          id: string
          event_id: string
          user_email: string
          wallet_address: string
          status: string
          created_at: string
          processed_at: string | null
          processed_by: string | null
        }
        Insert: {
          id?: string
          event_id: string
          user_email: string
          wallet_address: string
          status?: string
          created_at?: string
          processed_at?: string | null
          processed_by?: string | null
        }
        Update: {
          id?: string
          event_id?: string
          user_email?: string
          wallet_address?: string
          status?: string
          created_at?: string
          processed_at?: string | null
          processed_by?: string | null
        }
      }
    }
  }
}
