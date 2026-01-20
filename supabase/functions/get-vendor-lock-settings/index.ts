import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";

/**
 * Get Vendor Lock Settings
 *
 * Public endpoint that returns the active vendor lock configuration.
 * Used by the "Become a Vendor" page to display pricing and benefits.
 *
 * @returns Active vendor lock settings or null if not configured
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return new Response(
        JSON.stringify({ ok: false, error: "Method not allowed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 405,
        }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch active vendor lock settings
    const { data: settings, error } = await supabase
      .from("vendor_lock_settings")
      .select(`
        id,
        lock_address,
        chain_id,
        lock_name,
        lock_symbol,
        key_price_wei,
        key_price_display,
        currency,
        currency_address,
        expiration_duration_seconds,
        max_keys_per_address,
        is_transferable,
        description,
        image_url,
        benefits
      `)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("[get-vendor-lock-settings] Database error:", error);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to fetch vendor lock settings" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        settings: settings || null,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[get-vendor-lock-settings] Error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || "Internal server error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
