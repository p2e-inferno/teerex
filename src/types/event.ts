
export interface EventDraft {
  id: string;
  user_id: string;
  title: string;
  description: string;
  date: Date | null;
  time: string;
  location: string;
  capacity: number;
  price: number;
  currency: 'ETH' | 'USDC' | 'FREE';
  ngn_price: number;
  payment_methods: string[];
  paystack_public_key: string | null;
  category: string;
  image_url: string | null;
  chain_id?: number;
  created_at: Date;
  updated_at: Date;
}

export interface PublishedEvent extends EventDraft {
  lockAddress: string;
  transactionHash: string;
  isPublished: true;
}
