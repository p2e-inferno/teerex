import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useToast } from '@/hooks/use-toast';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import {
  closeTicketPass,
  selfDispenseTicketPass,
  setTicketPassIssuance,
  withdrawTicketPassResidual,
} from '@/utils/ticketPassControllerUtils';
import type { TicketPass } from '@/types/ticketPass';

type PassRef = Pick<TicketPass, 'id' | 'lock_address' | 'controller_address' | 'chain_id'>;

/**
 * Creator/holder management actions for a Ticket Pass. Each on-chain action is followed by a
 * sync-ticket-pass-status call so the DB mirror is reconciled, then the relevant queries refetch.
 */
export function useTicketPassActions(wallet: any) {
  const { getAccessToken } = usePrivy();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async (passId: string) => {
    const token = await getAccessToken?.();
    try {
      await callEdgeFunction('sync-ticket-pass-status', { pass_id: passId }, { privyToken: token });
    } catch (err) {
      console.warn('[useTicketPassActions] status sync failed', err);
    }
    queryClient.invalidateQueries({ queryKey: ['ticket-passes'] });
    queryClient.invalidateQueries({ queryKey: ['ticket-pass'] });
    queryClient.invalidateQueries({ queryKey: ['ticket-pass-onchain'] });
  }, [getAccessToken, queryClient]);

  const close = useCallback(async (pass: PassRef): Promise<boolean> => {
    setIsBusy(true);
    const result = await closeTicketPass(pass.lock_address, pass.controller_address, wallet, pass.chain_id);
    setIsBusy(false);
    if (!result.success) {
      toast({ title: 'Close failed', description: result.error, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Pass closed', description: 'Unsold escrow has been returned to your wallet.' });
    await refresh(pass.id);
    return true;
  }, [refresh, toast, wallet]);

  const setIssuance = useCallback(async (pass: PassRef, enabled: boolean): Promise<boolean> => {
    setIsBusy(true);
    const result = await setTicketPassIssuance(pass.lock_address, pass.controller_address, enabled, wallet, pass.chain_id);
    setIsBusy(false);
    if (!result.success) {
      toast({ title: 'Update failed', description: result.error, variant: 'destructive' });
      return false;
    }
    toast({
      title: enabled ? 'Platform issuance enabled' : 'Platform issuance disabled',
      description: enabled ? 'Buyers can purchase this pass with fiat again.' : 'New fiat purchases are now blocked.',
    });
    await refresh(pass.id);
    return true;
  }, [refresh, toast, wallet]);

  const withdrawResidual = useCallback(async (pass: PassRef): Promise<boolean> => {
    setIsBusy(true);
    const result = await withdrawTicketPassResidual(pass.lock_address, pass.controller_address, wallet, pass.chain_id);
    setIsBusy(false);
    if (!result.success) {
      toast({ title: 'Withdraw failed', description: result.error, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Residual withdrawn' });
    await refresh(pass.id);
    return true;
  }, [refresh, toast, wallet]);

  /**
   * Buyer self-heal for an order that hasn't been delivered yet (PENDING/PAID/FAILED).
   * Prefers confirm-ticket-pass-paystack(reference): it re-verifies the Paystack payment AND runs
   * the atomic grant+dispense, so it recovers the worst case (paid, but the tab was closed before
   * the first confirm ran). Falls back to issuance-only retry when no reference is available.
   * Both paths are idempotent (DB issuance lock + on-chain processedOrder).
   */
  const retryIssuance = useCallback(async (orderId: string, reference?: string | null): Promise<boolean> => {
    setIsBusy(true);
    const token = await getAccessToken?.();
    try {
      if (reference) {
        await callEdgeFunction('confirm-ticket-pass-paystack', { reference }, { privyToken: token });
      } else {
        await callEdgeFunction('retry-ticket-pass-issuance', { order_id: orderId }, { privyToken: token });
      }
    } catch (err) {
      setIsBusy(false);
      toast({ title: 'Retry failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
      return false;
    }
    setIsBusy(false);
    toast({ title: 'Delivery retried', description: 'If successful, the pass value will arrive shortly.' });
    queryClient.invalidateQueries({ queryKey: ['my-ticket-pass-orders'] });
    queryClient.invalidateQueries({ queryKey: ['ticket-pass-onchain'] });
    return true;
  }, [getAccessToken, queryClient, toast]);

  /**
   * On-chain self-dispense of an already-minted, undispensed key. Reserved for the forward-compat
   * direct-purchase path (V1 fiat orders are dispensed atomically and never need this).
   */
  const claim = useCallback(async (pass: PassRef): Promise<boolean> => {
    setIsBusy(true);
    const result = await selfDispenseTicketPass(pass.lock_address, pass.controller_address, wallet, pass.chain_id);
    setIsBusy(false);
    if (!result.success) {
      toast({ title: 'Claim failed', description: result.error, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Pass claimed', description: 'The pass value has been sent to your wallet.' });
    queryClient.invalidateQueries({ queryKey: ['my-ticket-pass-orders'] });
    queryClient.invalidateQueries({ queryKey: ['ticket-pass-onchain'] });
    return true;
  }, [queryClient, toast, wallet]);

  return { isBusy, close, setIssuance, withdrawResidual, retryIssuance, claim };
}
