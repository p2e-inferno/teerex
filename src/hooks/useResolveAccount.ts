import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ResolvedAccount {
  account_number: string;
  account_name: string;
  bank_id: number;
}

const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Resolve bank account details using Paystack API
 * In development mode, uses Paystack test bank code "001" which doesn't have daily limits
 * @see https://paystack.com/docs/payments/test-payments/
 */
async function resolveAccount(accountNumber: string, bankCode: string): Promise<ResolvedAccount> {
  const functionName = `resolve-bank-account?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`;

  const { data, error } = await supabase.functions.invoke(functionName, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'Failed to resolve account');

  return {
    account_number: data.account_number,
    account_name: data.account_name,
    bank_id: data.bank_id,
  };
}

/**
 * React Query hook for resolving bank account details
 * Only runs when both accountNumber and bankCode are valid
 */
export function useResolveAccount(accountNumber: string, bankCode: string) {
  const isValid = accountNumber.length === 10 && /^\d{10}$/.test(accountNumber) && bankCode.length > 0;

  return useQuery({
    queryKey: ['resolve-account', accountNumber, bankCode],
    queryFn: () => resolveAccount(accountNumber, bankCode),
    enabled: isValid,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1, // Only retry once on failure
  });
}
