import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { Contract, Wallet, JsonRpcProvider, ethers } from 'https://esm.sh/ethers@6.14.4';
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import UnlockABI from '../_shared/abi/Unlock.json' assert { type: 'json' };
import PublicLockABI from '../_shared/abi/PublicLockV15.json' assert { type: 'json' };
import { verifyPrivyToken, validateUserWallet } from '../_shared/privy.ts';
import { checkRateLimit, logActivity } from '../_shared/rate-limit.ts';
import { logGasTransaction } from '../_shared/gas-tracking.ts';
import { handleError } from '../_shared/error-handler.ts';
import { RATE_LIMITS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SERVICE_PK } from '../_shared/constants.ts';
import { validateChain } from '../_shared/network-helpers.ts';
import { retryWithBackoff, isRetryableTransactionError } from '../_shared/retry-helper.ts';
import { appendDivviTagToCalldataAsync, submitDivviReferralBestEffort } from '../_shared/divvi.ts';

// Retry configuration for addLockManager transaction
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,        // Total attempts (1 initial + 2 retries)
  INITIAL_DELAY: 1000,    // 1 second
  BACKOFF_MULTIPLIER: 2,  // Each retry doubles the delay (1s, 2s)
  MAX_DELAY: 5000,        // Cap at 5 seconds
};

/**
 * Creates a deterministic SHA-256 hash from event data for idempotency.
 * Must match the hash generation logic in src/utils/eventIdempotency.ts
 */
async function createEventHash(data: {
  creator_id: string;
  title: string;
  date: string | null;
  time: string;
  location: string;
  capacity: number;
  price: number;
  currency: string;
  paymentMethod: string;
}): Promise<string> {
  // Normalize data to ensure consistency
  const normalized = {
    creator_id: data.creator_id.trim().toLowerCase(),
    title: data.title.trim().toLowerCase(),
    date: data.date || '',
    time: data.time.trim(),
    location: data.location.trim().toLowerCase(),
    capacity: data.capacity,
    price: data.price,
    currency: data.currency.toUpperCase(),
    paymentMethod: data.paymentMethod.toLowerCase(),
  };

  // Create canonical string representation (sorted keys for consistency)
  const canonical = JSON.stringify(normalized, Object.keys(normalized).sort());

  // Generate SHA-256 hash using Web Crypto API
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) });
  }

  let privyUserId: string | undefined;
  try {
    // 1. Verify Privy JWT
    privyUserId = await verifyPrivyToken(req.headers.get('X-Privy-Authorization'));

    // 2. Parse request body
    const body = await req.json();
    const {
      name,
      expirationDuration,
      currency,
      price,
      maxNumberOfKeys,
      chain_id,
      maxKeysPerAddress = 1,
      transferable = false,
      requiresApproval = false,
      creator_address,
      // Additional fields needed for hash generation
      eventDate,
      eventTime,
      eventLocation,
      paymentMethod,
    } = body;

    // 3. Validate creator wallet
    const normalizedCreator = await validateUserWallet(
      privyUserId,
      creator_address,
      'creator_wallet_not_authorized'
    );

    // 4. Create Supabase client and validate chain
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const networkConfig = await validateChain(supabase, chain_id);
    if (!networkConfig) {
      return new Response(
        JSON.stringify({ ok: false, error: 'chain_not_supported' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Validate that network has required configuration for lock deployment
    if (!networkConfig.rpc_url || !networkConfig.unlock_factory_address) {
      return new Response(
        JSON.stringify({ ok: false, error: 'network_not_fully_configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 4.5. Hash-based idempotency check
    // Generate idempotency hash from event properties (matches frontend logic)
    const isCrypto = paymentMethod === 'crypto';
    const isFiat = paymentMethod === 'fiat';

    const idempotencyHash = await createEventHash({
      creator_id: privyUserId,
      title: name,
      date: eventDate || null,
      time: eventTime || '',
      location: eventLocation || '',
      capacity: maxNumberOfKeys,
      price: isCrypto ? price : (isFiat ? price : 0),
      currency: isCrypto ? currency : (isFiat ? 'NGN' : 'FREE'),
      paymentMethod: paymentMethod || 'crypto',
    });

    // Check if event with this hash already exists in the events table
    const { data: existingEvent, error: checkError } = await supabase
      .from('events')
      .select('lock_address, transaction_hash, title')
      .eq('creator_id', privyUserId)
      .eq('idempotency_hash', idempotencyHash)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error checking for existing event:', checkError);
      throw checkError;
    }

    if (existingEvent) {
      console.log('Duplicate event detected via hash:', idempotencyHash, 'Lock:', existingEvent.lock_address);

      // Return the existing event's lock address and transaction hash
      return new Response(
        JSON.stringify({
          ok: true,
          lock_address: existingEvent.lock_address,
          tx_hash: existingEvent.transaction_hash,
          from_cache: true,
          message: 'Event already deployed',
          event_title: existingEvent.title,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 5. Check rate limit
    const rateLimit = await checkRateLimit(
      supabase,
      privyUserId,
      'lock_deploy',
      RATE_LIMITS.DEPLOY
    );

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'limit_exceeded',
          limits: { remaining_today: 0 },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 6. Setup provider and contracts using network config from database
    const provider = new JsonRpcProvider(networkConfig.rpc_url);
    const signer = new Wallet(SERVICE_PK, provider);
    const serviceWalletAddress= await signer.getAddress();
    if (!serviceWalletAddress) {
      throw new Error('Service wallet address not found');
    }
    const unlock = new Contract(networkConfig.unlock_factory_address, UnlockABI, signer);

    // 7. Compute token address and price
    let tokenAddress = ethers.ZeroAddress;
    let keyPrice = 0n;

    if (currency === 'USDC' && networkConfig.usdc_token_address) {
      tokenAddress = networkConfig.usdc_token_address;
      keyPrice = ethers.parseUnits(String(price), 6); // USDC has 6 decimals
    } else if (currency === 'ETH') {
      tokenAddress = ethers.ZeroAddress;
      keyPrice = ethers.parseEther(String(price));
    } else if (currency === 'FREE') {
      tokenAddress = ethers.ZeroAddress;
      keyPrice = 0n;
    }

    // 9. Encode initialize calldata (following lockUtils.ts pattern)
    const lockInterface = new ethers.Interface(PublicLockABI);
    const initializeCalldata = lockInterface.encodeFunctionData('initialize', [
      serviceWalletAddress, // _lockCreator (creator owns the lock)
      expirationDuration,
      tokenAddress,
      keyPrice,
      maxNumberOfKeys,
      name,
    ]);

    // 10. Deploy lock via createUpgradeableLockAtVersion (append Divvi tag)
    const deployCalldata = unlock.interface.encodeFunctionData('createUpgradeableLockAtVersion', [initializeCalldata, 14]);
    const deployTagged = await appendDivviTagToCalldataAsync({ data: deployCalldata, user: serviceWalletAddress as `0x${string}` });
    const tx = await signer.sendTransaction({ to: networkConfig.unlock_factory_address, data: deployTagged });
    const receipt = await tx.wait();
    if (tx?.hash) await submitDivviReferralBestEffort({ txHash: tx.hash, chainId: chain_id });

    // 11. Parse lock address from event logs
    const unlockInterface = new ethers.Interface(UnlockABI);
    const event = receipt.logs
      .map((log: any) => {
        try {
          return unlockInterface.parseLog({
            topics: log.topics,
            data: log.data
          });
        } catch {
          return null;
        }
      })
      .find((e: any) => e?.name === 'NewLock');

    if (!event) {
      throw new Error('Lock deployment failed: NewLock event not found');
    }

    const lockAddress = event.args.newLockAddress;

    // 12. Add service wallet as lock manager with retry logic
    const lock = new Contract(lockAddress, PublicLockABI, signer);

    // Retry the addLockManager transaction with exponential backoff
    const addManagerReceipt = await retryWithBackoff(
      async () => {
        // Get fresh nonce for each retry attempt to avoid nonce conflicts
        const currentNonce = await signer.getNonce();
        console.log(`Attempting addLockManager with nonce: ${currentNonce} for lock ${lockAddress}`);
        const calldata = lock.interface.encodeFunctionData('addLockManager', [normalizedCreator]);
        const tagged = await appendDivviTagToCalldataAsync({ data: calldata, user: serviceWalletAddress as `0x${string}` });
        const addManagerTx = await signer.sendTransaction({ to: lockAddress, data: tagged, nonce: currentNonce });
        const receipt = await addManagerTx.wait();
        if (addManagerTx?.hash) await submitDivviReferralBestEffort({ txHash: addManagerTx.hash, chainId: chain_id });
        return receipt;
      },
      {
        maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS,
        initialDelay: RETRY_CONFIG.INITIAL_DELAY,
        backoffMultiplier: RETRY_CONFIG.BACKOFF_MULTIPLIER,
        maxDelay: RETRY_CONFIG.MAX_DELAY,
        shouldRetry: isRetryableTransactionError,
      },
      `addLockManager for ${normalizedCreator}`
    );

    console.log(`Successfully added lock manager. Tx: ${addManagerReceipt.hash || addManagerReceipt.transactionHash}`);

    // 12.5. Set transfer fee if non-transferable (soul-bound)
    // 10000 basis points = 100% fee = prevents all transfers
    if (!transferable) {
      try {
        const transferFeeReceipt = await retryWithBackoff(
          async () => {
            const currentNonce = await signer.getNonce();
            console.log(`Attempting updateTransferFee with nonce: ${currentNonce} for lock ${lockAddress}`);
            const calldata = lock.interface.encodeFunctionData('updateTransferFee', [10000]);
            const tagged = await appendDivviTagToCalldataAsync({ data: calldata, user: serviceWalletAddress as `0x${string}` });
            const transferFeeTx = await signer.sendTransaction({ to: lockAddress, data: tagged, nonce: currentNonce });
            const receipt = await transferFeeTx.wait();
            if (transferFeeTx?.hash) await submitDivviReferralBestEffort({ txHash: transferFeeTx.hash, chainId: chain_id });
            return receipt;
          },
          {
            maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS,
            initialDelay: RETRY_CONFIG.INITIAL_DELAY,
            backoffMultiplier: RETRY_CONFIG.BACKOFF_MULTIPLIER,
            maxDelay: RETRY_CONFIG.MAX_DELAY,
            shouldRetry: isRetryableTransactionError,
          },
          `updateTransferFee for lock ${lockAddress}`,
        );

        console.log(
          `Transfer fee set to 100% (soul-bound) for lock: ${lockAddress}. Tx: ${
            (transferFeeReceipt as any).hash ?? (transferFeeReceipt as any).transactionHash
          }`,
        );
      } catch (error) {
        console.warn('Failed to set transfer fee (non-critical):', error);
        // Don't fail entire deployment - transfer fee can be set later by lock manager
      }
    }

    // 12.6. Set NFT metadata for marketplace visibility (non-critical)
    try {
      const baseTokenURI = `${SUPABASE_URL}/functions/v1/nft-metadata/${lockAddress}/`;
      const metadataReceipt = await retryWithBackoff(
        async () => {
          const currentNonce = await signer.getNonce();
          console.log(`Attempting setLockMetadata with nonce: ${currentNonce} for lock ${lockAddress}`);
          const calldata = lock.interface.encodeFunctionData('setLockMetadata', [name, 'TEEREX', baseTokenURI]);
          const tagged = await appendDivviTagToCalldataAsync({ data: calldata, user: serviceWalletAddress as `0x${string}` });
          const metadataTx = await signer.sendTransaction({ to: lockAddress, data: tagged, nonce: currentNonce });
          const receipt = await metadataTx.wait();
          if (metadataTx?.hash) await submitDivviReferralBestEffort({ txHash: metadataTx.hash, chainId: chain_id });
          return receipt;
        },
        {
          maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS,
          initialDelay: RETRY_CONFIG.INITIAL_DELAY,
          backoffMultiplier: RETRY_CONFIG.BACKOFF_MULTIPLIER,
          maxDelay: RETRY_CONFIG.MAX_DELAY,
          shouldRetry: isRetryableTransactionError,
        },
        `setLockMetadata for lock ${lockAddress}`,
      );

      console.log(
        `NFT metadata set successfully for lock: ${lockAddress}. Tx: ${
          (metadataReceipt as any).hash ?? (metadataReceipt as any).transactionHash
        }`,
      );
    } catch (error) {
      console.warn('Failed to set NFT metadata (non-critical):', error);
      // Don't fail entire deployment - metadata can be set later by lock manager
    }

    // 12.7. Set lock owner to creator (non-critical)
    try {
      const setOwnerReceipt = await retryWithBackoff(
        async () => {
          const currentNonce = await signer.getNonce();
          console.log(`Attempting setOwner with nonce: ${currentNonce} for lock ${lockAddress}`);
          const calldata = lock.interface.encodeFunctionData('setOwner', [normalizedCreator]);
          const tagged = await appendDivviTagToCalldataAsync({ data: calldata, user: serviceWalletAddress as `0x${string}` });
          const setOwnerTx = await signer.sendTransaction({ to: lockAddress, data: tagged, nonce: currentNonce });
          const receipt = await setOwnerTx.wait();
          if (setOwnerTx?.hash) await submitDivviReferralBestEffort({ txHash: setOwnerTx.hash, chainId: chain_id });
          return receipt;
        },
        {
          maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS,
          initialDelay: RETRY_CONFIG.INITIAL_DELAY,
          backoffMultiplier: RETRY_CONFIG.BACKOFF_MULTIPLIER,
          maxDelay: RETRY_CONFIG.MAX_DELAY,
          shouldRetry: isRetryableTransactionError,
        },
        `setOwner for lock ${lockAddress}`,
      );

      console.log(
        `Lock owner set to creator ${normalizedCreator} for lock: ${lockAddress}. Tx: ${
          (setOwnerReceipt as any).hash ?? (setOwnerReceipt as any).transactionHash
        }`,
      );
    } catch (error) {
      console.warn('Failed to set lock owner (non-critical):', error);
      // Don't fail entire deployment - owner can be updated later
    }

    // 13. Log activity and gas cost in parallel
    await Promise.all([
      logActivity(supabase, privyUserId, 'lock_deploy', chain_id, null, {
        name,
        capacity: maxNumberOfKeys,
        lock_address: lockAddress,
        tx_hash: tx.hash || receipt.transactionHash,
      }),
      logGasTransaction(supabase, receipt, tx, chain_id, serviceWalletAddress),
    ]);

    // 14. Return success
    return new Response(
      JSON.stringify({
        ok: true,
        lock_address: lockAddress,
        tx_hash: tx.hash || receipt.transactionHash,
        limits: { remaining_today: rateLimit.remaining - 1 },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (e: any) {
    return handleError(e, privyUserId);
  }
});
