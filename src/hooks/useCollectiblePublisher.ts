import { useCallback, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { collectibleFormSchema, type CollectibleFormValues } from '@/types/collectible.schema';
import type { Collectible } from '@/types/collectible';
import { deployLock, getTicketExpirationSeconds } from '@/utils/lockUtils';
import { setLockMaxKeysPerAddress } from '@/utils/publicLockActions';
import { getBaseTokenURI } from '@/utils/lockMetadata';
import { createCollectible } from '@/lib/collectibles/collectibleApi';

interface PendingPersistence {
  form: CollectibleFormValues;
  lockAddress: string;
  transactionHash: string;
  creatorAddress: string;
  limitConfigured: boolean;
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
    if (!pending.limitConfigured) throw new Error('The per-person purchase limit still needs to be configured on-chain.');
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
    let ready = pending;
    if (!ready.limitConfigured) {
      const wallet = preferredWallet(ready.creatorAddress);
      if (!wallet?.address) throw new Error('Reconnect the creator wallet to finish publishing this collectible.');
      const limit = await setLockMaxKeysPerAddress(
        ready.lockAddress,
        ready.form.maxKeysPerAddress,
        wallet,
        ready.form.chainId,
      );
      if (!limit.success) {
        setPendingPersistence(ready);
        throw new Error(`The lock was created, but its per-person purchase limit still needs configuration: ${limit.error}`);
      }
      ready = { ...ready, limitConfigured: true };
      setPendingPersistence(ready);
    }

    const collectible = await persist(ready);
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
        symbol: 'TEEREX',
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
        limitConfigured: false,
      };
      // Store the deployed lock immediately. Any retry after this point resumes
      // configuration/persistence and must never deploy a replacement lock.
      setPendingPersistence(pending);
      return await configureAndPersist(pending);
    } finally {
      setIsPublishing(false);
    }
  }, [configureAndPersist, preferredWallet]);

  const retryPersistence = useCallback(async () => {
    if (!pendingPersistence) throw new Error('There is no deployed collectible waiting to be saved.');
    setIsPublishing(true);
    try {
      return await configureAndPersist(pendingPersistence);
    } finally {
      setIsPublishing(false);
    }
  }, [configureAndPersist, pendingPersistence]);

  return { publish, retryPersistence, pendingPersistence, isPublishing };
}
