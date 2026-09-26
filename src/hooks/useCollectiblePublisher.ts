import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { collectibleFormSchema, type CollectibleFormValues } from '@/types/collectible.schema';
import type { Collectible } from '@/types/collectible';
import { deployLock, getTicketExpirationSeconds } from '@/utils/lockUtils';
import { ensureLockMetadata, ensureLockTransferability, setLockMaxKeysPerAddress } from '@/utils/publicLockActions';
import { getBaseTokenURI, TEEREX_NFT_SYMBOL } from '@/utils/lockMetadata';
import { createCollectible } from '@/lib/collectibles/collectibleApi';

interface PendingPersistence {
  form: CollectibleFormValues;
  lockAddress: string;
  transactionHash: string;
  creatorAddress: string;
}

const RECOVERY_PREFIX = 'teerex:collectible-publish:';

function recoveryKey(userId: string) {
  return `${RECOVERY_PREFIX}${userId}`;
}

function readRecovery(userId: string): PendingPersistence | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(recoveryKey(userId));
  if (!raw) return null;
  try {
    const candidate = JSON.parse(raw) as Partial<PendingPersistence>;
    const form = collectibleFormSchema.parse(candidate.form);
    if (!ethers.isAddress(candidate.lockAddress || '') || !ethers.isAddress(candidate.creatorAddress || '') || !candidate.transactionHash) {
      throw new Error('Invalid collectible publish recovery record.');
    }
    return {
      form,
      lockAddress: String(candidate.lockAddress),
      transactionHash: String(candidate.transactionHash),
      creatorAddress: String(candidate.creatorAddress),
    };
  } catch {
    window.localStorage.removeItem(recoveryKey(userId));
    return null;
  }
}

function writeRecovery(userId: string, pending: PendingPersistence | null) {
  if (typeof window === 'undefined') return;
  const key = recoveryKey(userId);
  if (pending) window.localStorage.setItem(key, JSON.stringify(pending));
  else window.localStorage.removeItem(key);
}

export function useCollectiblePublisher() {
  const { user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [isPublishing, setIsPublishing] = useState(false);
  const [pendingPersistence, setPendingPersistence] = useState<PendingPersistence | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setPendingPersistence(null);
      return;
    }
    setPendingPersistence(readRecovery(user.id));
  }, [user?.id]);

  const rememberPending = useCallback((pending: PendingPersistence | null) => {
    setPendingPersistence(pending);
    if (user?.id) writeRecovery(user.id, pending);
  }, [user?.id]);

  const preferredWallet = useCallback((address?: string) => {
    const target = address?.toLowerCase() || user?.wallet?.address?.toLowerCase();
    return wallets.find((candidate) => candidate.address.toLowerCase() === target) ?? wallets[0];
  }, [user?.wallet?.address, wallets]);

  const persist = useCallback(async (pending: PendingPersistence): Promise<Collectible> => {
    const token = await getAccessToken();
    if (!token) throw new Error('Your session expired. Please sign in again.');
    const baseUri = getBaseTokenURI(pending.lockAddress);
    return createCollectible({
      creator_address: pending.creatorAddress.toLowerCase(),
      name: pending.form.name.trim(),
      description: pending.form.description?.trim() || null,
      image_url: pending.form.imageUrl,
      chain_id: pending.form.chainId,
      currency: pending.form.currency,
      price: pending.form.price,
      max_supply: pending.form.maxSupply,
      max_keys_per_address: pending.form.maxKeysPerAddress,
      lock_address: pending.lockAddress.toLowerCase(),
      transaction_hash: pending.transactionHash,
      is_claimable: pending.form.isClaimable,
      fulfillment_note: pending.form.fulfillmentNote?.trim() || null,
      transferable: true,
      nft_metadata_set: true,
      nft_base_uri: baseUri,
    }, token);
  }, [getAccessToken]);

  const configureAndPersist = useCallback(async (pending: PendingPersistence): Promise<Collectible> => {
    const wallet = preferredWallet(pending.creatorAddress);
    if (!wallet?.address || wallet.address.toLowerCase() !== pending.creatorAddress.toLowerCase()) {
      throw new Error('Reconnect the wallet that created this collectible to finish publishing it.');
    }

    // deployLock already attempts these settings, but treats them as non-critical
    // for the generic event flow. Re-ensure every collectible-critical setting
    // here. Each helper is idempotent, so a retry never redeploys the lock or
    // repeats a transaction whose desired on-chain state already exists.
    const limit = await setLockMaxKeysPerAddress(
      pending.lockAddress,
      pending.form.maxKeysPerAddress,
      wallet,
      pending.form.chainId,
    );
    if (!limit.success) throw new Error(`The lock was created, but its per-person limit is not configured: ${limit.error}`);

    const transferability = await ensureLockTransferability(
      pending.lockAddress,
      true,
      wallet,
      pending.form.chainId,
    );
    if (!transferability.success) throw new Error(`The lock was created, but transferability is not configured: ${transferability.error}`);

    const baseUri = getBaseTokenURI(pending.lockAddress);
    const metadata = await ensureLockMetadata(
      pending.lockAddress,
      pending.form.name.trim(),
      TEEREX_NFT_SYMBOL,
      baseUri,
      wallet,
      pending.form.chainId,
    );
    if (!metadata.success) throw new Error(`The lock was created, but NFT metadata is not configured: ${metadata.error}`);

    const collectible = await persist(pending);
    rememberPending(null);
    return collectible;
  }, [persist, preferredWallet, rememberPending]);

  const publish = useCallback(async (values: CollectibleFormValues): Promise<Collectible> => {
    if (pendingPersistence) {
      throw new Error('A collectible lock is already waiting to finish publishing. Retry that publish instead of deploying another lock.');
    }
    if (!user?.id) throw new Error('Sign in before publishing a collectible.');

    const form = collectibleFormSchema.parse(values);
    const wallet = preferredWallet();
    if (!wallet?.address) throw new Error('Connect a wallet before publishing.');

    setIsPublishing(true);
    try {
      const deployment = await deployLock({
        name: form.name.trim(),
        symbol: TEEREX_NFT_SYMBOL,
        keyPrice: String(form.price),
        maxNumberOfKeys: form.maxSupply,
        expirationDuration: getTicketExpirationSeconds('unlimited'),
        currency: form.currency,
        price: form.price,
        maxKeysPerAddress: form.maxKeysPerAddress,
        transferable: true,
      }, wallet, form.chainId);
      if (!deployment.success || !deployment.lockAddress || !deployment.transactionHash || !ethers.isAddress(deployment.lockAddress)) {
        throw new Error(deployment.error || 'The collectible lock could not be deployed.');
      }

      const pending: PendingPersistence = {
        form,
        lockAddress: deployment.lockAddress,
        transactionHash: deployment.transactionHash,
        creatorAddress: wallet.address,
      };
      // Persist recovery immediately after the deployment receipt. Any failure or
      // refresh after this point resumes this exact lock rather than deploying a new one.
      rememberPending(pending);
      return await configureAndPersist(pending);
    } finally {
      setIsPublishing(false);
    }
  }, [configureAndPersist, pendingPersistence, preferredWallet, rememberPending, user?.id]);

  const retryPersistence = useCallback(async () => {
    if (!pendingPersistence) throw new Error('There is no deployed collectible waiting to be finished.');
    setIsPublishing(true);
    try {
      return await configureAndPersist(pendingPersistence);
    } finally {
      setIsPublishing(false);
    }
  }, [configureAndPersist, pendingPersistence]);

  return { publish, retryPersistence, pendingPersistence, isPublishing };
}
