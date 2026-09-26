import { useCallback, useState } from 'react';
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

export function useCollectiblePublisher() {
  const { user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [isPublishing, setIsPublishing] = useState(false);
  const [pendingPersistence, setPendingPersistence] = useState<PendingPersistence | null>(null);

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
    if (!wallet?.address) throw new Error('Reconnect the creator wallet to finish publishing this collectible.');

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
    setPendingPersistence(null);
    return collectible;
  }, [persist, preferredWallet]);

  const publish = useCallback(async (values: CollectibleFormValues): Promise<Collectible> => {
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
      if (!deployment.success || !deployment.lockAddress || !deployment.transactionHash) {
        throw new Error(deployment.error || 'The collectible lock could not be deployed.');
      }

      const pending: PendingPersistence = {
        form,
        lockAddress: deployment.lockAddress,
        transactionHash: deployment.transactionHash,
        creatorAddress: wallet.address,
      };
      // Store the deployed lock immediately. Any failure after this point is a
      // resumable configuration/persistence failure and must never deploy again.
      setPendingPersistence(pending);
      return await configureAndPersist(pending);
    } finally {
      setIsPublishing(false);
    }
  }, [configureAndPersist, preferredWallet]);

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
