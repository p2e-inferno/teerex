import { useCallback, useEffect, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { collectibleFormSchema, type CollectibleFormValues } from '@/types/collectible.schema';
import type { Collectible } from '@/types/collectible';
import { isRichTextEmpty } from '@/lib/richText';
import { deployLock, getTicketExpirationSeconds } from '@/utils/lockUtils';
import { ensureLockMetadata, ensureLockTransferability, setLockMaxKeysPerAddress } from '@/utils/publicLockActions';
import { getBaseTokenURI, TEEREX_NFT_SYMBOL } from '@/utils/lockMetadata';
import { createCollectible } from '@/lib/collectibles/collectibleApi';
import { getPrivyWalletByAddress } from '@/lib/wallet/privyWalletIdentity';
import { useActiveSigningWallet } from '@/hooks/useActiveSigningWallet';

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
  const activeWallet = useActiveSigningWallet();
  const [isPublishing, setIsPublishing] = useState(false);
  const [pendingPersistence, setPendingPersistence] = useState<PendingPersistence | null>(null);
  // React state does not synchronously block a rapid second submit. Keep a ref as
  // the transaction-boundary mutex so one user action can never deploy two locks.
  const publishingRef = useRef(false);

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

  const persist = useCallback(async (pending: PendingPersistence): Promise<Collectible> => {
    const token = await getAccessToken();
    if (!token) throw new Error('Your session expired. Please sign in again.');
    const baseUri = getBaseTokenURI(pending.lockAddress);
    return createCollectible({
      creator_address: pending.creatorAddress.toLowerCase(),
      name: pending.form.name.trim(),
      description: isRichTextEmpty(pending.form.description || '') ? null : pending.form.description!.trim(),
      image_url: pending.form.imageUrl,
      chain_id: pending.form.chainId,
      currency: pending.form.currency,
      price: pending.form.price,
      max_supply: pending.form.maxSupply,
      max_keys_per_address: pending.form.maxKeysPerAddress,
      lock_address: pending.lockAddress.toLowerCase(),
      transaction_hash: pending.transactionHash,
      is_claimable: pending.form.isClaimable,
      fulfillment_note: pending.form.isClaimable && !isRichTextEmpty(pending.form.fulfillmentNote || '')
        ? pending.form.fulfillmentNote!.trim()
        : null,
      transferable: true,
      nft_metadata_set: true,
      nft_base_uri: baseUri,
    }, token);
  }, [getAccessToken]);

  const configureAndPersist = useCallback(async (pending: PendingPersistence): Promise<Collectible> => {
    const wallet = getPrivyWalletByAddress(wallets, pending.creatorAddress);
    if (!wallet) {
      throw new Error('Reconnect the wallet that created this collectible to finish publishing it.');
    }

    // These are the collectible-specific post-deploy invariants. Each helper is
    // idempotent, so refresh/retry resumes the same lock without repeating an
    // already-confirmed transaction.
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
  }, [persist, rememberPending, wallets]);

  const publish = useCallback(async (values: CollectibleFormValues): Promise<Collectible> => {
    if (publishingRef.current) {
      throw new Error('This collectible is already being published.');
    }
    if (pendingPersistence) {
      throw new Error('A collectible lock is already waiting to finish publishing. Retry that publish instead of deploying another lock.');
    }
    if (!user?.id) throw new Error('Sign in before publishing a collectible.');

    const form = collectibleFormSchema.parse(values);
    const wallet = activeWallet;
    if (!wallet?.address) throw new Error('Connect a wallet before publishing.');

    publishingRef.current = true;
    setIsPublishing(true);
    try {
      // Critical ordering: deploy only here. The generic deploy helper can also
      // perform best-effort metadata/transferability transactions; skip those so
      // it returns immediately after the deployment receipt. We must checkpoint
      // the deployed address before *any* subsequent wallet transaction, otherwise
      // a refresh during post-deploy configuration could orphan a live lock and a
      // retry would deploy a duplicate.
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
      }, wallet, form.chainId, true);
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
      publishingRef.current = false;
      setIsPublishing(false);
    }
  }, [activeWallet, configureAndPersist, pendingPersistence, rememberPending, user?.id]);

  const retryPersistence = useCallback(async () => {
    if (publishingRef.current) throw new Error('This collectible publish is already in progress.');
    if (!pendingPersistence) throw new Error('There is no deployed collectible waiting to be finished.');
    publishingRef.current = true;
    setIsPublishing(true);
    try {
      return await configureAndPersist(pendingPersistence);
    } finally {
      publishingRef.current = false;
      setIsPublishing(false);
    }
  }, [configureAndPersist, pendingPersistence]);

  return { publish, retryPersistence, pendingPersistence, isPublishing };
}
