
export interface EventDraft {
  id: string;
  user_id: string;
  title: string;
  description: string;
  date: Date | null;
  end_date?: Date | null;
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
  image_crop_x?: number;
  image_crop_y?: number;
  ticket_duration?: string;
  custom_duration_days?: number;
  chain_id?: number;
  transferable?: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PublishedEvent extends EventDraft {
  lockAddress: string;
  transactionHash: string;
  isPublished: true;
}
