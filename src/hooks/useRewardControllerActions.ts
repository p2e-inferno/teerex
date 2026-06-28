import { useCallback, useState } from 'react';
import { ethers } from 'ethers';
import { useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { createToastAction, TOAST_DURATIONS } from '@/lib/toastActions';
import {
  addRewardManager,
  assignWinners,
  claimReward,
  closeRewardPool,
  preflightCloseRewardPool,
  preflightClaimReward,
  preflightRaiseRewardDispute,
  raiseRewardDispute,
  reclaimRewardPool,
  RewardActionGasError,
  removeRewardManager,
  renounceRewardManager,
} from '@/utils/rewardControllerUtils';
import type {
  RewardDisputeCategory,
  RewardPool,
  WinnerAliasUpdate,
  WinnerAssignmentInput,
} from '@/types/rewardPool';

type PoolRef = Pick<RewardPool, 'id' | 'controller_address' | 'pool_id' | 'chain_id'>;

interface SyncWarningCopy {
  title: string;
  description: string;
}

interface DisputeInput {
  placement?: number | null;
  category: RewardDisputeCategory;
  reasonText?: string;
  evidenceUrls?: string[];
  holdDurationSecs: number;
  disputerAddress: string;
}

/**
 * Creator / manager / winner / disputer actions for a reward pool. Each on-chain action is followed
 * by a sync-reward-pool (or specific mirror) call so the DB reflects chain, then queries refetch.
 */
export function useRewardControllerActions(wallet: any) {
  const { getAccessToken } = usePrivy();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isBusy, setIsBusy] = useState(false);

  const showSyncWarning = useCallback((copy?: SyncWarningCopy) => {
    toast({
      title: copy?.title ?? 'Action complete',
      description: copy?.description ?? 'Your transaction went through. If this page still looks unchanged, refresh in a moment.',
    });
  }, [toast]);

  const showGasHelpToast = useCallback((error: RewardActionGasError, title: string) => {
    const passPath = `/ticket-passes?chain_id=${error.chainId}&has_native_gas=true`;
    toast({
      title,
      description: `Your wallet needs a small amount of ${error.nativeToken} on ${error.chainName} for the transaction fee. You can buy some with a ticket pass using card or bank transfer.`,
      variant: 'destructive',
      action: createToastAction({
        label: 'Browse passes',
        altText: 'Browse ticket passes',
        onClick: () => navigate(passPath),
      }),
      duration: TOAST_DURATIONS.cta,
    });
  }, [navigate, toast]);

  const refresh = useCallback(async (pool: PoolRef): Promise<boolean> => {
    const token = await getAccessToken?.();
    let synced = true;
    try {
      await callEdgeFunction('sync-reward-pool', { id: pool.id }, { privyToken: token });
    } catch (err) {
      synced = false;
      console.warn('[useRewardControllerActions] sync failed', err);
    }
    queryClient.invalidateQueries({ queryKey: ['reward-pools'] });
    queryClient.invalidateQueries({ queryKey: ['reward-pool-onchain'] });
    return synced;
  }, [getAccessToken, queryClient]);

  const notifyArbitratorExtension = useCallback(async (pool: PoolRef): Promise<boolean> => {
    const token = await getAccessToken?.();
    try {
      await callEdgeFunction('request-claim-end-extension', {
        reward_pool_id: pool.id,
        requester_address: wallet?.address ?? null,
      }, { privyToken: token });
    } catch (err) {
      toast({
        title: 'Could not notify the arbitrator',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
      return false;
    }
    toast({
      title: 'Arbitrator notified',
      description: 'We have asked the arbitrator to extend the claim window. Try assigning again once it is extended.',
    });
    return true;
  }, [getAccessToken, toast, wallet]);

  const setWinnerAliases = useCallback(async (pool: PoolRef, aliasUpdates: WinnerAliasUpdate[]): Promise<boolean> => {
    const token = await getAccessToken?.();
    try {
      await callEdgeFunction('set-winner-aliases', {
        reward_pool_id: pool.id,
        caller_address: wallet?.address ?? null,
        aliases: aliasUpdates,
      }, { privyToken: token });
    } catch (err) {
      console.warn('[useRewardControllerActions] alias update failed', err);
      return false;
    }
    queryClient.invalidateQueries({ queryKey: ['reward-pools'] });
    return true;
  }, [getAccessToken, queryClient, wallet]);

  const assign = useCallback(async (
    pool: PoolRef,
    batch: WinnerAssignmentInput[],
    aliasUpdates: WinnerAliasUpdate[] = [],
  ): Promise<boolean> => {
    if (batch.length === 0 && aliasUpdates.length === 0) return false;
    setIsBusy(true);

    let synced = true;
    if (batch.length > 0) {
      const result = await assignWinners(pool.controller_address, pool.pool_id, batch, wallet, pool.chain_id);
      if (!result.success) {
        setIsBusy(false);
        // A late assignment past the claim window is recoverable: route the organizer to the arbitrator.
        if (result.errorName === 'AssignmentWindowClosed') {
          toast({
            title: 'Claim window has ended',
            description: 'New winners can no longer be assigned. Notify the arbitrator to extend the claim window, then assign again.',
            variant: 'destructive',
            action: createToastAction({
              label: 'Notify arbitrator',
              altText: 'Notify arbitrator to extend the claim window',
              onClick: () => { void notifyArbitratorExtension(pool); },
            }),
            duration: TOAST_DURATIONS.cta,
          });
          return false;
        }
        toast({ title: 'Assignment failed', description: result.error, variant: 'destructive' });
        return false;
      }
      // Mirror the on-chain assignment so the position rows exist before naming them.
      synced = await refresh(pool);
    }

    if (aliasUpdates.length > 0) {
      const aliasSaved = await setWinnerAliases(pool, aliasUpdates);
      if (!aliasSaved) synced = false;
    }
    setIsBusy(false);

    toast(batch.length > 0
      ? { title: 'Winners assigned', description: 'Declared winners are now visible on-chain.' }
      : { title: 'Winner names updated' });
    if (!synced) showSyncWarning();
    return true;
  }, [notifyArbitratorExtension, refresh, setWinnerAliases, showSyncWarning, toast, wallet]);

  const claim = useCallback(async (pool: PoolRef, placement: number): Promise<boolean> => {
    setIsBusy(true);
    try {
      await preflightClaimReward(pool.controller_address, pool.pool_id, placement, wallet, pool.chain_id);
    } catch (error) {
      setIsBusy(false);
      if (error instanceof RewardActionGasError) {
        showGasHelpToast(error, `Add ${error.nativeToken} to claim`);
        return false;
      }
      toast({
        title: 'Claim unavailable',
        description: error instanceof Error ? error.message : 'This prize cannot be claimed yet.',
        variant: 'destructive',
      });
      return false;
    }
    const result = await claimReward(pool.controller_address, pool.pool_id, placement, wallet, pool.chain_id);
    setIsBusy(false);
    if (!result.success) {
      toast({ title: 'Claim failed', description: result.error, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Prize claimed', description: 'Your share has been sent to your wallet.' });
    const synced = await refresh(pool);
    if (!synced) {
      showSyncWarning({
        title: 'Prize claimed',
        description: 'Your prize was sent to your wallet. If this page still looks unchanged, refresh in a moment.',
      });
    }
    return true;
  }, [refresh, showGasHelpToast, showSyncWarning, toast, wallet]);

  const raiseDispute = useCallback(async (pool: PoolRef, input: DisputeInput): Promise<boolean> => {
    setIsBusy(true);
    const placement = input.placement ?? 0;
    const reasonHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify({
        category: input.category,
        reasonText: input.reasonText ?? null,
        placement: input.placement ?? null,
      })),
    );

    // Preflight before the wallet prompt; the on-chain signal still lands before server details.
    try {
      await preflightRaiseRewardDispute(
        pool.controller_address,
        pool.pool_id,
        placement,
        reasonHash,
        input.holdDurationSecs,
        wallet,
        pool.chain_id,
      );
    } catch (error) {
      setIsBusy(false);
      if (error instanceof RewardActionGasError) {
        showGasHelpToast(error, `Add ${error.nativeToken} to raise dispute`);
        return false;
      }
      toast({
        title: 'Dispute unavailable',
        description: error instanceof Error ? error.message : 'This dispute cannot be raised yet.',
        variant: 'destructive',
      });
      return false;
    }
    const onchain = await raiseRewardDispute(
      pool.controller_address,
      pool.pool_id,
      placement,
      reasonHash,
      input.holdDurationSecs,
      wallet,
      pool.chain_id,
    );
    if (!onchain.success) {
      setIsBusy(false);
      toast({ title: 'Dispute failed', description: onchain.error, variant: 'destructive' });
      return false;
    }

    // Record the rich detail + notify the admin. The on-chain signal already landed, so a failure
    // here is surfaced but does not undo the dispute.
    const token = await getAccessToken?.();
    let recordSaved = true;
    try {
      await callEdgeFunction('raise-reward-dispute', {
        reward_pool_id: pool.id,
        placement: input.placement ?? null,
        disputer_address: input.disputerAddress,
        category: input.category,
        reason_text: input.reasonText ?? null,
        evidence_urls: input.evidenceUrls ?? [],
        reason_hash: reasonHash,
        onchain_tx_hash: onchain.transactionHash ?? null,
      }, { privyToken: token });
    } catch (err) {
      recordSaved = false;
      console.warn('[useRewardControllerActions] dispute record failed', err);
    }
    setIsBusy(false);
    if (recordSaved) {
      toast({ title: 'Dispute raised', description: 'An arbitrator will review it shortly.' });
    } else {
      toast({
        title: 'Dispute signaled on-chain',
        description: 'The on-chain hold was submitted, but the dispute details did not save.',
        variant: 'destructive',
      });
    }
    const synced = await refresh(pool);
    if (!synced) showSyncWarning();
    queryClient.invalidateQueries({ queryKey: ['reward-disputes', pool.id] });
    return true;
  }, [getAccessToken, queryClient, refresh, showGasHelpToast, showSyncWarning, toast, wallet]);

  const mirrorManager = useCallback(async (pool: PoolRef, manager: string, action: 'add' | 'remove', txHash?: string) => {
    const token = await getAccessToken?.();
    try {
      await callEdgeFunction('manage-reward-pool-managers', {
        reward_pool_id: pool.id,
        manager_address: manager,
        action,
        tx_hash: txHash ?? null,
      }, { privyToken: token });
    } catch (err) {
      console.warn('[useRewardControllerActions] manager mirror failed', err);
    }
    queryClient.invalidateQueries({ queryKey: ['reward-pools'] });
  }, [getAccessToken, queryClient]);

  const addManager = useCallback(async (pool: PoolRef, manager: string): Promise<boolean> => {
    setIsBusy(true);
    const result = await addRewardManager(pool.controller_address, pool.pool_id, manager, wallet, pool.chain_id);
    setIsBusy(false);
    if (!result.success) {
      toast({ title: 'Add manager failed', description: result.error, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Manager added' });
    await mirrorManager(pool, manager, 'add', result.transactionHash);
    return true;
  }, [mirrorManager, toast, wallet]);

  const removeManager = useCallback(async (pool: PoolRef, manager: string): Promise<boolean> => {
    setIsBusy(true);
    const result = await removeRewardManager(pool.controller_address, pool.pool_id, manager, wallet, pool.chain_id);
    setIsBusy(false);
    if (!result.success) {
      toast({ title: 'Remove manager failed', description: result.error, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Manager removed' });
    await mirrorManager(pool, manager, 'remove', result.transactionHash);
    return true;
  }, [mirrorManager, toast, wallet]);

  const renounceManager = useCallback(async (pool: PoolRef, manager: string): Promise<boolean> => {
    setIsBusy(true);
    const result = await renounceRewardManager(pool.controller_address, pool.pool_id, wallet, pool.chain_id);
    setIsBusy(false);
    if (!result.success) {
      toast({ title: 'Renounce failed', description: result.error, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Manager role renounced' });
    await mirrorManager(pool, manager, 'remove', result.transactionHash);
    return true;
  }, [mirrorManager, toast, wallet]);

  const close = useCallback(async (pool: PoolRef): Promise<boolean> => {
    setIsBusy(true);
    try {
      await preflightCloseRewardPool(pool.controller_address, pool.pool_id, wallet, pool.chain_id);
    } catch (error) {
      setIsBusy(false);
      toast({
        title: 'Prize pool cannot be cancelled',
        description: error instanceof Error ? error.message : 'This prize pool cannot be cancelled yet.',
        variant: 'destructive',
      });
      return false;
    }
    const result = await closeRewardPool(pool.controller_address, pool.pool_id, wallet, pool.chain_id);
    setIsBusy(false);
    if (!result.success) {
      toast({ title: 'Prize pool cancellation failed', description: result.error, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Prize pool cancelled', description: 'The unclaimed prize escrow has been returned to your wallet.' });
    const synced = await refresh(pool);
    if (!synced) showSyncWarning();
    return true;
  }, [refresh, showSyncWarning, toast, wallet]);

  const reclaim = useCallback(async (pool: PoolRef): Promise<boolean> => {
    setIsBusy(true);
    const result = await reclaimRewardPool(pool.controller_address, pool.pool_id, wallet, pool.chain_id);
    setIsBusy(false);
    if (!result.success) {
      toast({ title: 'Reclaim failed', description: result.error, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Funds reclaimed', description: 'Unclaimed prize funds have been returned to your wallet.' });
    const synced = await refresh(pool);
    if (!synced) showSyncWarning();
    return true;
  }, [refresh, showSyncWarning, toast, wallet]);

  return { isBusy, assign, claim, raiseDispute, addManager, removeManager, renounceManager, close, reclaim, notifyArbitratorExtension };
}
