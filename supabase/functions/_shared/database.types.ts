export type Database = {
  public: {
    Tables: {
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
    }
  }
}