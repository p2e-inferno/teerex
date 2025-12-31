/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { requireVendor } from "../_shared/vendor.ts";

const DEFAULT_EXPIRATION_SECONDS = 60 * 60 * 24 * 30;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      });
    }

    const vendor = await requireVendor(req);
    const body = await req.json().catch(() => ({}));

    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const gameTitle = body.game_title ? String(body.game_title).trim() : null;
    const consoleType = body.console ? String(body.console).trim() : null;
    const location = String(body.location || "").trim();
    const bundleType = String(body.bundle_type || "").trim().toUpperCase();
    const quantityUnits = Number(body.quantity_units);
    const unitLabel = String(body.unit_label || "").trim();
    const priceFiat = body.price_fiat ?? 0;
    const fiatSymbol = String(body.fiat_symbol || "NGN").trim().toUpperCase();
    const priceDg = body.price_dg ?? null;
    const chainId = Number(body.chain_id);
    const bundleAddress = String(body.bundle_address || "").trim().toLowerCase();
    const imageUrl = body.image_url ? String(body.image_url).trim() : null;
    const keyExpirationDurationSeconds = Number(body.key_expiration_duration_seconds || DEFAULT_EXPIRATION_SECONDS);
    const metadataSet = body.metadata_set !== undefined ? Boolean(body.metadata_set) : false;
    const isActive = body.is_active !== undefined ? Boolean(body.is_active) : true;

    if (!title || !description || !bundleType || !unitLabel || !location) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields (title, description, bundle_type, unit_label, location)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!Number.isFinite(quantityUnits) || quantityUnits <= 0) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid quantity_units" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!Number.isFinite(chainId)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid chain_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!bundleAddress || !bundleAddress.startsWith("0x") || bundleAddress.length !== 42) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid bundle_address" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("gaming_bundles")
      .insert({
        vendor_id: vendor.vendorId,
        vendor_address: vendor.vendorAddress,
        title,
        description,
        game_title: gameTitle,
        console: consoleType,
        location,
        bundle_type: bundleType,
        quantity_units: quantityUnits,
        unit_label: unitLabel,
        price_fiat: priceFiat,
        fiat_symbol: fiatSymbol,
        price_dg: priceDg,
        chain_id: chainId,
        bundle_address: bundleAddress,
        key_expiration_duration_seconds: keyExpirationDurationSeconds,
        image_url: imageUrl,
        metadata_set: metadataSet,
        is_active: isActive,
      })
      .select("*")
      .single();

    if (error) {
      const isDuplicate = error.code === "23505";
      return new Response(JSON.stringify({
        ok: false,
        error: isDuplicate ? "bundle_address_already_exists" : error.message,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    return new Response(JSON.stringify({ ok: true, bundle: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    const message = error?.message || "Internal error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: message === "vendor_access_denied" ? 403 : 400,
    });
  }
});
