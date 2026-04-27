import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { enforcePost } from "../_shared/http.ts";
import { handleError } from "../_shared/error-handler.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { getPrivyUserProfile, verifyPrivyToken } from "../_shared/privy.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  const methodGuard = enforcePost(req);
  if (methodGuard) return methodGuard;

  let privyUserId: string | undefined;

  try {
    privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const profile = await getPrivyUserProfile(privyUserId);
    const walletAddresses = Array.from(new Set(profile.walletAddresses.map((addr) => addr.toLowerCase())));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase
      .from("app_user_profiles")
      .upsert(
        {
          privy_user_id: privyUserId,
          email: profile.email,
          primary_wallet_address: walletAddresses[0] || null,
          wallet_addresses: walletAddresses,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "privy_user_id" },
      );

    if (error) throw error;

    return new Response(
      JSON.stringify({ ok: true, has_email: Boolean(profile.email), wallet_count: walletAddresses.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: any) {
    return handleError(error, privyUserId, { "Content-Type": "application/json" });
  }
});
