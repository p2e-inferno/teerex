import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { Contract, Wallet, JsonRpcProvider } from 'https://esm.sh/ethers@6.14.4';
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import PublicLockABI from '../_shared/abi/PublicLockV15.json' assert { type: 'json' };
import { verifyPrivyToken, validateUserWallet } from '../_shared/privy.ts';
import { checkRateLimit, logActivity } from '../_shared/rate-limit.ts';
import { logGasTransaction } from '../_shared/gas-tracking.ts';
import { handleError } from '../_shared/error-handler.ts';
import { RATE_LIMITS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SERVICE_PK } from '../_shared/constants.ts';
import { validateChain } from '../_shared/network-helpers.ts';
import { sendEmail, getTicketEmail, normalizeEmail } from '../_shared/email-utils.ts';
import { formatEventDate } from '../_shared/date-utils.ts';
import { appendDivviTagToCalldataAsync, submitDivviReferralBestEffort } from '../_shared/divvi.ts';

/**
 * Checks if recipient already owns keys and validates against max limits
 * Returns: { canPurchase: boolean, currentKeys: number, maxKeys: number, hasValidKey: boolean, reason?: string }
 */
async function validateKeyOwnership(
  lock: Contract,
  recipient: string
): Promise<{
  canPurchase: boolean;
  currentKeys: number;
  maxKeys: number;
  hasValidKey: boolean;
  reason?: string;
}> {
  // Query on-chain state
  const balanceOf = await lock.balanceOf(recipient);

  // Get lock-wide maxKeysPerAddress (no params - returns default for the lock)
  let maxKeysForAddress;
  try {
    maxKeysForAddress = await lock.maxKeysPerAddress();
  } catch (error: any) {
    // Default to 1 for v14 locks or if function doesn't exist
    maxKeysForAddress = 1n;
  }

  const hasValidKey = await lock.getHasValidKey(recipient);

  const currentKeys = Number(balanceOf);
  const maxKeys = Number(maxKeysForAddress);

  // If max is 0, it means unlimited (or uses lock-wide default)
  const effectiveMax = maxKeys === 0 ? Infinity : maxKeys;

  return {
    canPurchase: currentKeys < effectiveMax,
    currentKeys,
    maxKeys: effectiveMax,
    hasValidKey,
    reason: currentKeys >= effectiveMax ? 'max_keys_reached' : undefined,
  };
}

/**
 * Creates or retrieves ticket record for existing on-chain key
 * Handles recovery from partial failures where ticket was minted but DB insert failed
 */
async function getOrCreateTicketRecord(
  supabase: any,
  event_id: string,
  recipient: string,
  user_email: string | null
): Promise<{ ticket: any; isNew: boolean }> {
  // Check for existing ticket
  const { data: existing } = await supabase
    .from('tickets')
    .select('*')
    .eq('event_id', event_id)
    .eq('owner_wallet', recipient)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (existing) {
    return { ticket: existing, isNew: false };
  }

  // Create recovery record (on-chain key exists but no DB record)
  const { data: newTicket, error } = await supabase
    .from('tickets')
    .insert({
      event_id,
      owner_wallet: recipient,
      grant_tx_hash: null, // Unknown - was from previous attempt
      status: 'active',
      user_email: user_email || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create recovery ticket record:', error);
    throw error;
  }

  return { ticket: newTicket, isNew: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) });
  }

  let privyUserId: string | undefined;
  try {
    // 1. Verify Privy JWT
    privyUserId = await verifyPrivyToken(req.headers.get('X-Privy-Authorization'));

    // 2. Parse request
    const body = await req.json();
    const { event_id, lock_address, chain_id, recipient, user_email } = body;

    const normalizedUserEmail = normalizeEmail(user_email);

    // 3. Validate recipient wallet
    const normalizedRecipient = await validateUserWallet(
      privyUserId,
      recipient,
      'recipient_wallet_not_authorized'
    );

    // 4. Validate email if provided
    if (user_email && !normalizedUserEmail) {
      return new Response(
        JSON.stringify({ ok: false, error: 'invalid_email_format' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 5. Validate chain
    const networkConfig = await validateChain(supabase, chain_id);
    if (!networkConfig) {
      return new Response(
        JSON.stringify({ ok: false, error: 'chain_not_supported' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (!networkConfig.rpc_url) {
      return new Response(
        JSON.stringify({ ok: false, error: 'network_not_fully_configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 6. Verify event exists and is FREE
    const { data: event } = await supabase
      .from('events')
      .select('currency, lock_address, chain_id, title, date')
      .eq('id', event_id)
      .single();

    if (!event) {
      return new Response(
        JSON.stringify({ ok: false, error: 'event_not_found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (event.currency !== 'FREE') {
      return new Response(
        JSON.stringify({ ok: false, error: 'only_free_tickets_supported' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (event.lock_address.toLowerCase() !== lock_address.toLowerCase()) {
      return new Response(
        JSON.stringify({ ok: false, error: 'lock_address_mismatch' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (event.chain_id !== chain_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'chain_id_mismatch' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 7. Check rate limit
    const rateLimit = await checkRateLimit(
      supabase,
      privyUserId,
      'ticket_purchase',
      RATE_LIMITS.PURCHASE
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

    // 8. Setup provider and lock contract
    const provider = new JsonRpcProvider(networkConfig.rpc_url);
    const signer = new Wallet(SERVICE_PK, provider);
    const lock = new Contract(lock_address, PublicLockABI, signer);

    // 8.5. Validate key ownership and limits BEFORE attempting purchase
    const ownership = await validateKeyOwnership(lock, normalizedRecipient);

    if (ownership.hasValidKey) {
      // User already has a key - check if DB record exists
      const { ticket, isNew } = await getOrCreateTicketRecord(
        supabase,
        event_id,
        normalizedRecipient,
        normalizedUserEmail
      );

      // Check if they've reached their limit
      if (!ownership.canPurchase) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'max_keys_reached',
            current_keys: ownership.currentKeys,
            max_keys: ownership.maxKeys === Infinity ? 'unlimited' : ownership.maxKeys,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Has valid key but can get more (if maxKeys allows)
      // For FREE events with default maxKeys=1, this means they already claimed
      if (ownership.currentKeys >= 1 && ownership.maxKeys === 1) {
        return new Response(
          JSON.stringify({
            ok: true,
            already_claimed: true,
            purchase_tx_hash: ticket.grant_tx_hash,
            message: 'ticket_already_claimed',
            recovered: isNew, // true if we just created the missing DB record
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    // 9. Call purchase() with value=0 (FREE ticket) - with error handling
    let tx, receipt;
    try {
      const serviceUser = (await signer.getAddress()) as `0x${string}`;
      const calldata = lock.interface.encodeFunctionData('purchase', [
        [0], // _values: price = 0
        [normalizedRecipient], // _recipients
        [normalizedRecipient], // _referrers
        [normalizedRecipient], // _keyManagers
        ['0x'], // _data
      ]);
      const taggedData = await appendDivviTagToCalldataAsync({ data: calldata, user: serviceUser });
      tx = await signer.sendTransaction({ to: lock_address, data: taggedData });
      receipt = await tx.wait();
      if (tx?.hash) {
        await submitDivviReferralBestEffort({ txHash: tx.hash, chainId: chain_id });
      }
    } catch (purchaseError: any) {
      // Check if error is due to already owning a key or hitting limits
      const errorMessage = purchaseError.message || '';
      if (
        errorMessage.includes('LOCK_SOLD_OUT') ||
        errorMessage.includes('TOO_MANY_KEYS') ||
        errorMessage.includes('MAX_KEYS') ||
        purchaseError.code === 'CALL_EXCEPTION'
      ) {
        // Re-validate and create recovery record
        console.log('Purchase failed - checking for existing key:', errorMessage);

        try {
          const { ticket, isNew } = await getOrCreateTicketRecord(
            supabase,
            event_id,
            normalizedRecipient,
            normalizedUserEmail
          );

          return new Response(
            JSON.stringify({
              ok: true,
              already_claimed: true,
              purchase_tx_hash: ticket.grant_tx_hash,
              message: 'ticket_already_claimed',
              recovered: isNew,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        } catch (recoveryError) {
          console.error('Recovery failed:', recoveryError);
          // If recovery fails, rethrow original error
          throw purchaseError;
        }
      }

      // Other purchase errors - rethrow
      throw purchaseError;
    }

    // 10. Log activity, gas cost, and ticket record with safe error handling
    const dbOperations = await Promise.allSettled([
      logActivity(supabase, privyUserId, 'ticket_purchase', chain_id, event_id, {
        lock_address,
        recipient: normalizedRecipient,
      }),
      logGasTransaction(supabase, receipt, tx, chain_id, await signer.getAddress(), event_id),
      supabase.from('tickets').insert({
        event_id,
        owner_wallet: normalizedRecipient,
        grant_tx_hash: receipt.transactionHash,
        status: 'active',
        user_email: normalizedUserEmail || null,
      }),
    ]);

    // Check for failures in DB operations
    const failures = dbOperations.filter((op) => op.status === 'rejected');
    if (failures.length > 0) {
      console.error('Some DB operations failed after successful on-chain purchase:', failures);
      // Log failures but don't fail the request - ticket is already minted on-chain
    }

    // Send ticket confirmation email (non-blocking)
    if (normalizedUserEmail && event.title) {
      const eventTitle = event.title;
      const eventDate = event.date ? formatEventDate(event.date) : 'TBA';
      const explorerUrl = receipt.transactionHash && chain_id
        ? `https://${chain_id === 8453 ? 'basescan.org' : 'sepolia.basescan.org'}/tx/${receipt.transactionHash}`
        : undefined;

      const emailContent = getTicketEmail(eventTitle, eventDate, receipt.transactionHash, chain_id, explorerUrl);

      // Fire and forget - don't block response
      sendEmail({
        to: normalizedUserEmail,
        ...emailContent,
        tags: ['ticket-issued', 'gasless'],
      }).catch(err => {
        console.error('[GASLESS-PURCHASE] Failed to send ticket email:', err);
      });
    }

    // 11. Return success
    return new Response(
      JSON.stringify({
        ok: true,
        purchase_tx_hash: tx.hash || receipt.transactionHash,
        limits: { remaining_today: rateLimit.remaining - 1 },
        db_sync_status: failures.length > 0 ? 'partial' : 'complete',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (e: any) {
    return handleError(e, privyUserId);
  }
});
