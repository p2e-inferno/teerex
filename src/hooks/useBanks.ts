import { useQuery } from '@tanstack/react-query';
import { callEdgeFunction } from '@/lib/edgeFunctions';

export interface Bank {
  code: string;
  name: string;
  slug: string;
  type: string;
  defaultAccountNumber?: string;
}

const isDevelopment = import.meta.env.VITE_NODE_ENV === 'development';

/**
 * Paystack test bank for development mode
 * This combo works for both account resolution and transfer recipient/subaccount creation in test mode.
 * @see https://paystack.com/docs/payments/test-payments/
 */
export const PAYSTACK_TEST_BANK: Bank = {
  code: '057',
  name: 'Test Bank (Development)',
  slug: 'test-bank',
  type: 'test',
  defaultAccountNumber: '0000000000',
};

/**
 * Fetch Nigerian banks from Paystack via list-nigerian-banks edge function
 * In development mode, returns only the test bank to keep Paystack test validation deterministic.
 */
async function fetchBanks(): Promise<Bank[]> {
  // In development, return only the test bank
  if (isDevelopment) {
    return [PAYSTACK_TEST_BANK];
  }

  // Production: fetch real bank list from Paystack
  const data = await callEdgeFunction<any>('list-nigerian-banks', {}, { withAnonKey: true, method: 'GET' });
  return data.banks || [];
}

/**
 * React Query hook for fetching Nigerian banks
 * Cached for 10 minutes to reduce API calls
 * In development mode, returns only the Paystack test bank.
 */
export function useBanks() {
  return useQuery({
    queryKey: ['banks', 'nigeria', isDevelopment ? 'dev' : 'prod', isDevelopment ? PAYSTACK_TEST_BANK.code : null, isDevelopment ? PAYSTACK_TEST_BANK.defaultAccountNumber : null],
    queryFn: fetchBanks,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}
