/* deno-lint-ignore-file no-explicit-any */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import { enforcePost } from '../_shared/http.ts';
import { handleError } from '../_shared/error-handler.ts';
import { verifyPrivyToken, validateUserWallet } from '../_shared/privy.ts';
import { sendEmail, getTicketEmail, normalizeEmail } from '../_shared/email-utils.ts';
import { formatEventDate } from '../_shared/date-utils.ts';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../_shared/constants.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) });
  }

  const methodGuard = enforcePost(req);
  if (methodGuard) return methodGuard;

  let privyUserId: string | undefined;

  try {
    privyUserId = await verifyPrivyToken(req.headers.get('X-Privy-Authorization'));

    const body = await req.json().catch(() => ({}));
    const { event_id, wallet_address, user_email, txn_hash, chain_id } = body;

    if (!event_id || !wallet_address) {
      return new Response(
        JSON.stringify({ ok: false, error: 'event_id and wallet_address are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    // Ensure caller owns the wallet they claim
    const normalizedWallet = await validateUserWallet(privyUserId!, wallet_address, 'wallet_not_linked_to_user');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Ensure ticket exists and is active for this wallet + event
    const { data: ticket } = await supabase
      .from('tickets')
      .select('id, grant_tx_hash, status, user_email')
      .eq('event_id', event_id)
      .eq('owner_wallet', normalizedWallet)
      .eq('status', 'active')
      .maybeSingle();

    if (!ticket) {
      return new Response(
        JSON.stringify({ ok: false, error: 'ticket_not_found_for_user' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 },
      );
    }

    const normalizedTicketEmail = normalizeEmail((ticket as any)?.user_email);
    const normalizedUserEmail = normalizeEmail(user_email);

    if (user_email && !normalizedUserEmail) {
      return new Response(
        JSON.stringify({ ok: false, error: 'invalid_email_format' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const finalEmail = normalizedTicketEmail || normalizedUserEmail;

    if (!finalEmail) {
      return new Response(
        JSON.stringify({ ok: false, error: 'user_email_required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    if (normalizedTicketEmail && normalizedUserEmail && normalizedTicketEmail !== normalizedUserEmail) {
      return new Response(
        JSON.stringify({ ok: false, error: 'email_mismatch_with_ticket' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    // Load event details for email content
    const { data: event } = await supabase
      .from('events')
      .select('title, starts_at, chain_id')
      .eq('id', event_id)
      .maybeSingle();

    if (!event) {
      return new Response(
        JSON.stringify({ ok: false, error: 'event_not_found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 },
      );
    }

    const chainId = chain_id ?? event.chain_id;
    const txHash = txn_hash || ticket.grant_tx_hash || undefined;

    // Map common explorers; fall back to undefined to avoid bad links
    const explorerDomain = (() => {
      const map: Record<number, string> = {
        1: 'etherscan.io',
        137: 'polygonscan.com',
        8453: 'basescan.org',
        11155111: 'sepolia.etherscan.io',
        84532: 'sepolia.basescan.org',
        80002: 'amoy.polygonscan.com',
      };
      return chainId ? map[chainId] : undefined;
    })();

    const explorerUrl = txHash && explorerDomain
      ? `https://${explorerDomain}/tx/${txHash}`
      : undefined;

    const emailContent = getTicketEmail(
      event.title,
      event.starts_at ? formatEventDate(event.starts_at) : 'TBA',
      txHash,
      chainId,
      explorerUrl,
    );

    const result = await sendEmail({
      to: finalEmail,
      ...emailContent,
      tags: ['ticket-issued', 'direct-purchase'],
    });

    return new Response(
      JSON.stringify(result.ok ? { ok: true, messageId: result.messageId } : { ok: false, error: result.error }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (e: any) {
    return handleError(e, privyUserId, { 'Content-Type': 'application/json' });
  }
});
