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
    // 1. Authenticate user
    const authHeader = req.headers.get("X-Privy-Authorization");
    privyUserId = await verifyPrivyToken(authHeader);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Parse request
    const body = await req.json();
    const {
      attestation_id,
      challenged_address,
      challenge_reason,
      evidence_description,
      evidence_url,
      challenger_wallet,
    } = body;

    // 3. Validate required fields
    if (!attestation_id || !challenged_address || !challenge_reason?.trim()) {
      throw new Error("attestation_id, challenged_address, and challenge_reason are required");
    }

    // 4. Normalize and validate challenged address
    const normalizedChallengedAddress = challenged_address.toLowerCase().trim();
    if (normalizedChallengedAddress.length !== 42 || !normalizedChallengedAddress.startsWith('0x')) {
      throw new Error("Invalid challenged_address format");
    }

    // 5. Get challenger's wallet
    const challengerAddress = challenger_wallet
      ? await validateUserWallet(privyUserId, challenger_wallet, "Wallet not authorized")
      : (await getUserWalletAddresses(privyUserId))[0];

    if (!challengerAddress) {
      throw new Error("No wallet available");
    }

    // 6. Prevent self-challenge
    const userWallets = await getUserWalletAddresses(privyUserId);
    if (userWallets.includes(normalizedChallengedAddress)) {
      throw new Error("Cannot challenge your own attestation");
    }

    // 7. Insert challenge
    const { data: challengeData, error: insertError } = await supabase
      .from('attestation_challenges')
      .insert({
        attestation_id,
        challenger_address: challengerAddress,
        challenged_address: normalizedChallengedAddress,
        challenge_reason: challenge_reason.trim(),
        evidence_description: evidence_description?.trim() || null,
        evidence_url: evidence_url?.trim() || null,
        stake_amount: 10,
      })
      .select('id')
      .single();

    if (insertError) {
      if (insertError.code === '23503') throw new Error("Invalid attestation_id");
      if (insertError.code === '23514') throw new Error("Invalid address format");
      throw insertError;
    }

    // 8. Update reputation (non-blocking)
    const { error: rpcError } = await supabase.rpc('update_reputation_score', {
      user_addr: challengerAddress,
      score_change: -2,
      attestation_type: 'challenge'
    });

    if (rpcError) {
      console.error('Reputation update failed (non-fatal):', rpcError);
    }

    // 9. Return success
    return new Response(
      JSON.stringify({
        ok: true,
        challenge_id: challengeData.id,
        message: 'Challenge submitted successfully'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return handleError(error, privyUserId, { 'Content-Type': 'application/json' });
  }
});
