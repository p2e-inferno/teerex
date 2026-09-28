import type { CryptoCurrency } from '@/types/currency';

export interface Collectible {
  id: string;
  creator_id?: string;
  creator_address: string;
  creator_display_name?: string | null;
  name: string;
  description: string | null;
  image_url: string;
  chain_id: number;
  currency: CryptoCurrency;
  price: number;
  max_supply: number;
  max_keys_per_address: number;
  lock_address: string;
  transaction_hash: string;
  is_claimable: boolean;
  fulfillment_note: string | null;
  is_public: boolean;
  transferable: boolean;
  nft_metadata_set: boolean;
  nft_base_uri: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCollectibleInput {
  creator_address: string;
  name: string;
  description?: string | null;
  image_url: string;
  chain_id: number;
  currency: CryptoCurrency;
  price: number;
  max_supply: number;
  max_keys_per_address: number;
  lock_address: string;
  transaction_hash: string;
  is_claimable: boolean;
  fulfillment_note?: string | null;
  transferable: true;
  nft_metadata_set: boolean;
  nft_base_uri: string | null;
}

export interface UpdateCollectibleInput {
  name?: string;
  description?: string | null;
  image_url?: string;
  price?: number;
  max_supply?: number;
  max_keys_per_address?: number;
  is_claimable?: boolean;
  fulfillment_note?: string | null;
  nft_metadata_set?: boolean;
  nft_base_uri?: string | null;
}

export interface CollectibleListResult {
  collectibles: Collectible[];
  has_more: boolean;
  total_count: number;
}
