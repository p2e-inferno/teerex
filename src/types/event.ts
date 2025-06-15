
export interface EventDraft {
  id: string;
  title: string;
  description: string;
  date: Date | null;
  time: string;
  location: string;
  capacity: number;
  price: number;
  currency: 'ETH' | 'USDC' | 'FREE';
  category: string;
  imageUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublishedEvent extends EventDraft {
  lockAddress: string;
  transactionHash: string;
  isPublished: true;
}
