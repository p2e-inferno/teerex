/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken, getUserWalletAddresses } from "../_shared/privy.ts";
import { renounceServiceManager } from "../_shared/service-manager.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));
    const bundleId = body.bundle_id || body.bundleId;

    if (!bundleId) return json({ ok: false, error: "bundle_id is required" }, 400);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: bundle, error: bundleError } = await supabaseAdmin
      .from("gaming_bundles")
      .select("id, vendor_id, bundle_address, chain_id, service_manager_added")
      .eq("id", bundleId)
      .maybeSingle();

    if (bundleError || !bundle) return json({ ok: false, error: "bundle_not_found" }, 404);
    if (bundle.vendor_id !== privyUserId) return json({ ok: false, error: "vendor_access_denied" }, 403);

    const userWallets = await getUserWalletAddresses(privyUserId);
    if (!userWallets.length) return json({ ok: false, error: "vendor_no_wallets" }, 403);

    const { transactionHash } = await renounceServiceManager({
      supabase: supabaseAdmin,
      lockAddress: bundle.bundle_address,
      chainId: bundle.chain_id,
      userWallets,
      requireUserManager: true,
    });

    const { error: updateError } = await supabaseAdmin
      .from("gaming_bundles")
      .update({ service_manager_added: false })
      .eq("id", bundleId);

    if (updateError) {
      console.error("[remove-bundle-service-manager] failed to update DB", updateError);
    }

    return json({ ok: true, transactionHash }, 200);
  } catch (error: any) {
    console.error("[remove-bundle-service-manager] error", error);
    return json({ ok: false, error: error?.message || "Internal error" }, 500);
  }
});
