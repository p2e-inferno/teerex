
import { EventFormData } from '@/pages/CreateEvent';

export interface LockConfiguration {
  name: string;
  symbol: string;
  duration: number;
  price: string;
  maxNumberOfKeys: number;
  currency: string;
}

export const createLockConfiguration = (eventData: EventFormData): LockConfiguration => {
  console.log('Creating lock configuration for event:', eventData.title);
  
  return {
    name: eventData.title,
    symbol: `TICKET_${eventData.title.replace(/\s+/g, '_').toUpperCase()}`,
    duration: eventData.date ? Math.floor((eventData.date.getTime() - Date.now()) / 1000) : 86400, // Duration until event or 1 day
    price: eventData.currency === 'FREE' ? '0' : eventData.price.toString(),
    maxNumberOfKeys: eventData.capacity,
    currency: eventData.currency === 'FREE' ? 'ETH' : eventData.currency
  };
};

export const deployLock = async (lockConfig: LockConfiguration): Promise<string> => {
  console.log('Deploying lock with configuration:', lockConfig);
  
  // Simulate lock deployment
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Return a mock transaction hash
  return `0x${Math.random().toString(16).substr(2, 40)}`;
};
