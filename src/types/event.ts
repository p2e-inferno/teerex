
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
  category: string;
  image_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PublishedEvent extends EventDraft {
  lockAddress: string;
  transactionHash: string;
  isPublished: true;
}
