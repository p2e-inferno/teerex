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
}

export function useCollectiblePublisher() {
  const { user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [isPublishing, setIsPublishing] = useState(false);
  const [pendingPersistence, setPendingPersistence] = useState<PendingPersistence | null>(null);

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

  const publish = useCallback(async (values: CollectibleFormValues): Promise<Collectible> => {
    const form = collectibleFormSchema.parse(values);
    const preferredAddress = user?.wallet?.address?.toLowerCase();
    const wallet = wallets.find((candidate) => candidate.address.toLowerCase() === preferredAddress) ?? wallets[0];
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

      const limit = await setLockMaxKeysPerAddress(
        deployment.lockAddress,
        form.maxKeysPerAddress,
        wallet,
        form.chainId,
      );
      if (!limit.success) {
        throw new Error(`The lock was created, but its per-person purchase limit could not be configured: ${limit.error}`);
      }

      const pending = {
        form,
        lockAddress: deployment.lockAddress,
        transactionHash: deployment.transactionHash,
        creatorAddress: wallet.address,
      };
      setPendingPersistence(pending);
      const collectible = await persist(pending);
      setPendingPersistence(null);
      return collectible;
    } finally {
      setIsPublishing(false);
    }
  }, [persist, user?.wallet?.address, wallets]);

  const retryPersistence = useCallback(async () => {
    if (!pendingPersistence) throw new Error('There is no deployed collectible waiting to be saved.');
    setIsPublishing(true);
    try {
      const collectible = await persist(pendingPersistence);
      setPendingPersistence(null);
      return collectible;
    } finally {
      setIsPublishing(false);
    }
  }, [pendingPersistence, persist]);

  return { publish, retryPersistence, pendingPersistence, isPublishing };
}
