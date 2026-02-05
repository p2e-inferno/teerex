/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { normalizeEmail } from "../_shared/email-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};

    const eventId: string | undefined = body.event_id || body.eventId;
    const reference: string | undefined = body.reference;
    const email: string | undefined = body.email;
    const walletAddressRaw: string | undefined = body.wallet_address || body.walletAddress;
    const requestedAmountKobo: number | undefined = typeof body.amount === 'number' ? body.amount : undefined;

    if (!eventId || !reference || !email || !walletAddressRaw) {
      return new Response(JSON.stringify({ error: 'Missing required fields: event_id, reference, email, wallet_address' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    // Validate event exists and get creator info
    const { data: ev, error: evErr } = await supabase
      .from('events')
      .select('id, paystack_public_key, creator_id, ngn_price, ngn_price_kobo, payment_methods, registration_cutoff, starts_at')
      .eq('id', eventId)
      .maybeSingle();
    if (evErr || !ev) {
      return new Response(JSON.stringify({ error: 'Event not found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 });
    }

    // Check registration cutoff
    const cutoffDate = ev.registration_cutoff ? new Date(ev.registration_cutoff) : (ev.starts_at ? new Date(ev.starts_at) : null);
    if (cutoffDate && new Date() > cutoffDate) {
      return new Response(JSON.stringify({ error: 'registration_closed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const hasFiat = Array.isArray((ev as any).payment_methods) && (ev as any).payment_methods.includes('fiat');
    if (!hasFiat || Number((ev as any).ngn_price || 0) <= 0) {
      return new Response(JSON.stringify({ error: 'fiat_not_enabled' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const walletAddress = walletAddressRaw.toLowerCase();

    // Fetch vendor's verified payout account for subaccount routing
    let subaccountCode: string | null = null;
    let payoutAccountId: string | null = null;
    if (ev.creator_id) {
      const { data: vendorPayoutAccount } = await supabase
        .from('vendor_payout_accounts')
        .select('id, provider_account_code')
        .eq('vendor_id', ev.creator_id)
        .eq('provider', 'paystack')
        .eq('status', 'verified')
        .maybeSingle();

      if (vendorPayoutAccount) {
        payoutAccountId = vendorPayoutAccount.id;
        if (vendorPayoutAccount.provider_account_code) {
          subaccountCode = vendorPayoutAccount.provider_account_code;
        }
      }
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const amountKobo = typeof (ev as any).ngn_price_kobo === 'number'
      ? (ev as any).ngn_price_kobo
      : Math.round(Number((ev as any).ngn_price ?? 0) * 100);

    if (typeof requestedAmountKobo === 'number' && requestedAmountKobo !== amountKobo) {
      return new Response(JSON.stringify({ error: 'amount_mismatch' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const insertPayload: any = {
      event_id: eventId,
      user_email: normalizedEmail,
      reference,
      currency: 'NGN',
      status: 'pending',
      payout_account_id: payoutAccountId, // Link to vendor's payout account
      gateway_response: {
        reference,
        status: 'initialized',
        subaccount_code: subaccountCode, // Store for reference
        metadata: {
          custom_fields: [
            { display_name: 'Wallet Address', variable_name: 'user_wallet_address', value: walletAddress },
            { display_name: 'Event ID', variable_name: 'event_id', value: eventId },
            { display_name: 'User Email', variable_name: 'user_email', value: normalizedEmail },
          ],
        },
      },
    };
    insertPayload.amount = amountKobo;

    const { error } = await supabase
      .from('paystack_transactions')
      .upsert(insertPayload, { onConflict: 'reference' });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    // Return subaccount_code for frontend to pass to Paystack
    return new Response(JSON.stringify({
      ok: true,
      amount_kobo: amountKobo,
      subaccount_code: subaccountCode, // Frontend uses this in Paystack config
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  }
});
