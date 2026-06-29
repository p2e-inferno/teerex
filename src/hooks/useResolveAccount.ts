import { useQuery } from '@tanstack/react-query';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { PAYSTACK_TEST_BANK } from '@/hooks/useBanks';

export interface ResolvedAccount {
  account_number: string;
  account_name: string;
  bank_id: number;
}

/**
 * Resolve bank account details using Paystack API
 * @see https://paystack.com/docs/payments/test-payments/
 */
async function resolveAccount(accountNumber: string, bankCode: string): Promise<ResolvedAccount> {
  if (
    import.meta.env.VITE_NODE_ENV === 'development' &&
    bankCode === PAYSTACK_TEST_BANK.code &&
    accountNumber === PAYSTACK_TEST_BANK.defaultAccountNumber
  ) {
    return {
      account_number: accountNumber,
      account_name: 'Test',
      bank_id: 0,
    };
  }

  const functionName = `resolve-bank-account?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`;

  const data = await callEdgeFunction<any>(functionName, {}, { withAnonKey: true, method: 'GET' });
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
