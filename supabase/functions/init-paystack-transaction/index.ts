/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";

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
    const walletAddress: string | undefined = body.wallet_address || body.walletAddress;
    const amountKobo: number | undefined = typeof body.amount === 'number' ? body.amount : undefined;

    if (!eventId || !reference || !email || !walletAddress) {
      return new Response(JSON.stringify({ error: 'Missing required fields: event_id, reference, email, wallet_address' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    // Validate event exists
    const { data: ev, error: evErr } = await supabase
      .from('events')
      .select('id, paystack_public_key')
      .eq('id', eventId)
      .maybeSingle();
    if (evErr || !ev) {
      return new Response(JSON.stringify({ error: 'Event not found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 });
    }

    const insertPayload: any = {
      event_id: eventId,
      user_email: email,
      reference,
      currency: 'NGN',
      status: 'pending',
      gateway_response: {
        reference,
        status: 'initialized',
        metadata: {
          custom_fields: [
            { display_name: 'Wallet Address', variable_name: 'user_wallet_address', value: walletAddress },
            { display_name: 'Event ID', variable_name: 'event_id', value: eventId },
            { display_name: 'User Email', variable_name: 'user_email', value: email },
          ],
        },
      },
    };
    if (typeof amountKobo === 'number') insertPayload.amount = amountKobo;

    const { error } = await supabase
      .from('paystack_transactions')
      .upsert(insertPayload, { onConflict: 'reference' });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  }
});

