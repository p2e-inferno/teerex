import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useGaslessFallback<TArgs, TFallbackResult>(
  edgeFunctionName: string,
  fallbackFn: (args: TArgs) => Promise<TFallbackResult>,
  enabled: boolean = true
) {
  const { getAccessToken } = usePrivy();

  return async (args: TArgs, fallbackArgs?: TFallbackResult): Promise<TFallbackResult | { ok: boolean; [key: string]: any }> => {
    if (!enabled) {
      return await fallbackFn(fallbackArgs || args as any);
    }
    try {
      const token = await getAccessToken?.();
      const { data, error } = await supabase.functions.invoke(edgeFunctionName, {
        body: args as any,
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      // Network/connection error from Supabase
      if (error) {
        console.warn(`Gasless ${edgeFunctionName} network error, falling back to client-side:`, error);
        toast.info('Connection issue detected, using your wallet instead...');
        return await fallbackFn(fallbackArgs || args as any);
      }

      // Edge function returned an error (but no fallback - e.g., rate limit, validation error)
      if (data && !data.ok) {
        // Check if this is a hard error that shouldn't fallback
        const noFallbackErrors = [
          'limit_exceeded',
          'only_free_tickets_supported',
          'event_not_found',
          'max_keys_reached',
          'ticket_already_claimed',
        ];
        if (noFallbackErrors.includes(data.error)) {
          console.warn(`Gasless ${edgeFunctionName} failed with no-fallback error:`, data.error);
          return data; // Return error to caller without fallback
        }

        // Other errors - try fallback
        console.warn(`Gasless ${edgeFunctionName} failed, falling back to client-side:`, data.error);
        toast.info('Gasless transaction unavailable, using your wallet instead...');
        return await fallbackFn(fallbackArgs || args as any);
      }

      return data;
    } catch (err: any) {
      console.warn(`Gasless ${edgeFunctionName} unexpected error, falling back to client-side:`, err);
      toast.info('Unable to process gasless transaction, using your wallet instead...');
      return await fallbackFn(fallbackArgs || args as any);
    }
  };
}
