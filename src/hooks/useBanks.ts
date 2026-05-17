import { useQuery } from '@tanstack/react-query';
import { callEdgeFunction } from '@/lib/edgeFunctions';

export interface Bank {
  code: string;
  name: string;
  slug: string;
  type: string;
}

const isDevelopment = import.meta.env.VITE_NODE_ENV === 'development';

/**
 * Paystack test bank for development mode
 * In test mode, Paystack requires bank code "001" after hitting the daily limit
 * @see https://paystack.com/docs/payments/test-payments/
 */
const TEST_BANK: Bank = {
  code: '001',
  name: 'Test Bank (Development)',
  slug: 'test-bank',
  type: 'test',
};

/**
 * Fetch Nigerian banks from Paystack via list-nigerian-banks edge function
 * In development mode, returns only the test bank to use Paystack's test bank code
 */
async function fetchBanks(): Promise<Bank[]> {
  // In development, return only the test bank
  // This uses Paystack's test bank code "001" which doesn't count against the daily limit
  if (isDevelopment) {
    return [TEST_BANK];
  }

  // Production: fetch real bank list from Paystack
  const data = await callEdgeFunction<any>('list-nigerian-banks', {}, { withAnonKey: true });
  return data.banks || [];
}

/**
 * React Query hook for fetching Nigerian banks
 * Cached for 10 minutes to reduce API calls
 * In development mode, returns only the Paystack test bank (code: 001)
 */
export function useBanks() {
  return useQuery({
    queryKey: ['banks', 'nigeria', isDevelopment ? 'dev' : 'prod'],
    queryFn: fetchBanks,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}
