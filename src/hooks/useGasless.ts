import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useGaslessFallback<TArgs, TFallbackResult>(
  edgeFunctionName: string,
  fallbackFn: (args: TArgs) => Promise<TFallbackResult>,
  enabled: boolean = true
) {
  const [isLoading, setIsLoading] = useState(false);
  const { getAccessToken } = usePrivy();

  return async (args: TArgs, fallbackArgs?: TFallbackResult): Promise<TFallbackResult | { ok: boolean; [key: string]: any }> => {
    if (!enabled) {
      return await fallbackFn(fallbackArgs || args as any);
    }

    setIsLoading(true);
    try {
      const token = await getAccessToken?.();
      const { data, error } = await supabase.functions.invoke(edgeFunctionName, {
        body: args,
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      if (error || !data?.ok) {
        console.warn(`Gasless ${edgeFunctionName} failed, falling back to client-side:`, error || data?.error);
        toast.info('Gasless transaction failed, using wallet instead...');
        return await fallbackFn(fallbackArgs || args as any);
      }

      return data;
    } catch (err: any) {
      console.warn(`Gasless ${edgeFunctionName} error, falling back to client-side:`, err);
      toast.info('Gasless transaction failed, using wallet instead...');
      return await fallbackFn(fallbackArgs || args as any);
    } finally {
      setIsLoading(false);
    }
  };
}
