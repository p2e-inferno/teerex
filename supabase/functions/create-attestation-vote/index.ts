import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { verifyPrivyToken, validateUserWallet, getUserWalletAddresses } from "../_shared/privy.ts";
import { handleError } from "../_shared/error-handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  let privyUserId: string | undefined;

  try {
    // 1. Authenticate
    const authHeader = req.headers.get("X-Privy-Authorization");
    privyUserId = await verifyPrivyToken(authHeader);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Parse request
    const body = await req.json();
    const { attestation_id, vote_type, voter_address } = body;

    // 3. Validate
    if (!attestation_id || !vote_type) {
      throw new Error("attestation_id and vote_type are required");
    }
    if (!['support', 'challenge', 'verify'].includes(vote_type)) {
      throw new Error("Invalid vote_type");
    }

    // 4. Get voter wallet
    const voterWallet = voter_address
      ? await validateUserWallet(privyUserId, voter_address, "Wallet not authorized")
      : (await getUserWalletAddresses(privyUserId))[0];

    if (!voterWallet) {
      throw new Error("No wallet available");
    }

    // 5. Prevent self-vote
    const { data: attestation, error: fetchError } = await supabase
      .from('attestations')
      .select('recipient')
      .eq('id', attestation_id)
      .single();

    if (fetchError) throw new Error("Invalid attestation_id");
    if (attestation.recipient.toLowerCase() === voterWallet) {
      throw new Error("Cannot vote on your own attestation");
    }

    // 6. Insert vote (idempotent)
    const { data: voteData, error: insertError } = await supabase
      .from('attestation_votes')
      .insert({
        attestation_id,
        voter_address: voterWallet,
        vote_type,
        weight: 1,
      })
      .select('id')
      .single();

    if (insertError) {
      // Handle duplicate gracefully
      if (insertError.code === '23505') {
        return new Response(
          JSON.stringify({ ok: true, message: 'Vote already recorded', duplicate: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (insertError.code === '23503') throw new Error("Invalid attestation_id");
      if (insertError.code === '23514') throw new Error("Invalid vote_type");
      throw insertError;
    }

    // 7. Return success
    return new Response(
      JSON.stringify({ ok: true, vote_id: voteData.id, message: 'Vote recorded successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return handleError(error, privyUserId, { 'Content-Type': 'application/json' });
  }
});
