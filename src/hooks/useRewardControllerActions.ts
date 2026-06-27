import { useCallback, useState } from 'react';
import { ethers } from 'ethers';
import { useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useToast } from '@/hooks/use-toast';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import {
  addRewardManager,
  assignWinners,
  claimReward,
  closeRewardPool,
  preflightCloseRewardPool,
  raiseRewardDispute,
  reclaimRewardPool,
  removeRewardManager,
  renounceRewardManager,
} from '@/utils/rewardControllerUtils';
import type {
  RewardDisputeCategory,
  RewardPool,
  WinnerAssignmentInput,
} from '@/types/rewardPool';

type PoolRef = Pick<RewardPool, 'id' | 'controller_address' | 'pool_id' | 'chain_id'>;

interface DisputeInput {
  placement?: number | null;
  category: RewardDisputeCategory;
  reasonText?: string;
  evidenceUrls?: string[];
  disputerAddress: string;
}

/**
 * Creator / manager / winner / disputer actions for a reward pool. Each on-chain action is followed
 * by a sync-reward-pool (or specific mirror) call so the DB reflects chain, then queries refetch.
 */
export function useRewardControllerActions(wallet: any) {
  const { getAccessToken } = usePrivy();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isBusy, setIsBusy] = useState(false);

  const showSyncWarning = useCallback(() => {
    toast({
      title: 'Transaction confirmed',
      description: 'The on-chain update succeeded, but the database mirror did not refresh. Refresh the page if the event still looks stale.',
    });
  }, [toast]);

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

  const assign = useCallback(async (pool: PoolRef, batch: WinnerAssignmentInput[]): Promise<boolean> => {
    setIsBusy(true);
    const result = await assignWinners(pool.controller_address, pool.pool_id, batch, wallet, pool.chain_id);
    setIsBusy(false);
    if (!result.success) {
      toast({ title: 'Assignment failed', description: result.error, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Winners assigned', description: 'Declared winners are now visible on-chain.' });
    const synced = await refresh(pool);
    if (!synced) showSyncWarning();
    return true;
  }, [refresh, showSyncWarning, toast, wallet]);

  const claim = useCallback(async (pool: PoolRef, placement: number): Promise<boolean> => {
    setIsBusy(true);
    const result = await claimReward(pool.controller_address, pool.pool_id, placement, wallet, pool.chain_id);
    setIsBusy(false);
    if (!result.success) {
      toast({ title: 'Claim failed', description: result.error, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Prize claimed', description: 'Your share has been sent to your wallet.' });
    const synced = await refresh(pool);
    if (!synced) showSyncWarning();
    return true;
  }, [refresh, showSyncWarning, toast, wallet]);

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

    // On-chain signal first: it applies the per-placement hold and is censorship-resistant.
    const onchain = await raiseRewardDispute(pool.controller_address, pool.pool_id, placement, reasonHash, wallet, pool.chain_id);
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
  }, [getAccessToken, queryClient, refresh, showSyncWarning, toast, wallet]);

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

  return { isBusy, assign, claim, raiseDispute, addManager, removeManager, renounceManager, close, reclaim };
}
