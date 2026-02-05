
export interface EventDraft {
  id: string;
  user_id: string;
  title: string;
  description: string;
  date: Date | null;
  end_date?: Date | null;
  starts_at?: string | null;
  registration_cutoff?: string | null;
  time: string;
  location: string;
  capacity: number;
  price: number;
  currency: string;
  ngn_price: number;
  ngn_price_kobo?: number;
  payment_methods: string[];
  paystack_public_key: string | null;
  category: string;
  image_url: string | null;
  image_crop_x?: number;
  image_crop_y?: number;
  ticket_duration?: string;
  custom_duration_days?: number;
  chain_id?: number;
  transferable?: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PublishedDraftEvent extends EventDraft {
  lockAddress: string;
  transactionHash: string;
  isPublished: true;
}

// Live published event shape (matches Supabase events table)
export interface PublishedEvent {
  id: string;
  creator_id: string;
  creator_address?: string | null;
  title: string;
  description: string;
  date: Date | null;
  end_date: Date | null;
  starts_at: string | null;
  registration_cutoff: string | null;
  time: string;
  location: string;
  event_type: 'physical' | 'virtual';
  capacity: number;
  price: number;
  currency: string;
  ngn_price: number;
  ngn_price_kobo?: number;
  payment_methods: string[];
  paystack_public_key: string | null;
  category: string;
  image_url: string | null;
  image_crop_x?: number;
  image_crop_y?: number;
  lock_address: string;
  transaction_hash: string;
  chain_id: number;
  created_at: Date;
  updated_at: Date;
  attestation_enabled: boolean;
  attendance_schema_uid: string | null;
  review_schema_uid: string | null;
  max_keys_per_address: number;
  transferable: boolean;
  requires_approval: boolean;
  service_manager_added: boolean;
  is_public: boolean;
  allow_waitlist: boolean;
  has_allow_list: boolean;
  nft_metadata_set: boolean;
  nft_base_uri: string | null;
}
