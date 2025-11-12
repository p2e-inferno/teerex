import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { Contract, Wallet, JsonRpcProvider } from 'https://esm.sh/ethers@6.14.4';
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import PublicLockABI from '../_shared/abi/PublicLockV15.json' assert { type: 'json' };
import { verifyPrivyToken, validateUserWallet } from '../_shared/privy.ts';
import { checkRateLimit, logActivity } from '../_shared/rate-limit.ts';
import { logGasTransaction } from '../_shared/gas-tracking.ts';
import { handleError } from '../_shared/error-handler.ts';
import { RATE_LIMITS, EMAIL_REGEX, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SERVICE_PK } from '../_shared/constants.ts';
import { validateChain } from '../_shared/network-helpers.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) });
  }

  let privyUserId: string;
  try {
    // 1. Verify Privy JWT
    privyUserId = await verifyPrivyToken(req.headers.get('X-Privy-Authorization'));

    // 2. Parse request
    const body = await req.json();
    const { event_id, lock_address, chain_id, recipient, user_email } = body;

    // 3. Validate recipient wallet
    const normalizedRecipient = await validateUserWallet(
      privyUserId,
      recipient,
      'recipient_wallet_not_authorized'
    );

    // 4. Validate email if provided
    if (user_email && !EMAIL_REGEX.test(user_email)) {
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
      .select('currency, lock_address, chain_id')
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

    // 9. Call purchase() with value=0 (FREE ticket)
    const tx = await lock.purchase(
      [0], // _values: price = 0
      [normalizedRecipient], // _recipients: who receives the ticket
      [normalizedRecipient], // _referrers: referrer (self)
      [normalizedRecipient], // _keyManagers: key manager (self)
      [[]] // _data: empty bytes
    );

    const receipt = await tx.wait();

    // 10. Log activity, gas cost, and ticket record in parallel
    await Promise.all([
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
        user_email: user_email || null,
      }),
    ]);

    // 11. Return success
    return new Response(
      JSON.stringify({
        ok: true,
        purchase_tx_hash: tx.hash || receipt.transactionHash,
        limits: { remaining_today: rateLimit.remaining - 1 },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (e: any) {
    return handleError(e, privyUserId);
  }
});
