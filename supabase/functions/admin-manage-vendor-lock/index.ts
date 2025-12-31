import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ethers } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";
import PublicLockABI from "../_shared/abi/PublicLockV15.json" with { type: "json" };

/**
 * Admin Manage Vendor Lock
 *
 * CRUD operations for vendor lock settings (admin only).
 * GET: Fetch current vendor lock with price sync
 * POST: Create new vendor lock
 * PUT: Update vendor lock
 * DELETE: Deactivate vendor lock
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    const adminUserId = await ensureAdmin(req.headers);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (req.method === "GET") {
      return await handleGet(supabase);
    } else if (req.method === "POST") {
      return await handleCreate(supabase, req, adminUserId);
    } else if (req.method === "PUT") {
      return await handleUpdate(supabase, req);
    } else if (req.method === "DELETE") {
      return await handleDeactivate(supabase, req);
    }

    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  } catch (error: any) {
    const status = error.message === "unauthorized" ? 403 : 500;
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});

async function handleGet(supabase: any) {
  const { data: settings, error } = await supabase
    .from("vendor_lock_settings")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to fetch vendor lock settings");
  }

  // If settings exist, fetch on-chain price for comparison
  let onChainPrice = null;
  if (settings) {
    try {
      const { data: networkConfig } = await supabase
        .from("network_configs")
        .select("rpc_url")
        .eq("chain_id", settings.chain_id)
        .eq("is_active", true)
        .single();

      if (networkConfig?.rpc_url) {
        const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
        const lock = new ethers.Contract(settings.lock_address, PublicLockABI, provider);
        const price = await lock.keyPrice();
        onChainPrice = price.toString();
      }
    } catch (err) {
      console.error("[admin-manage-vendor-lock] Failed to fetch on-chain price:", err);
    }
  }

  // Fetch total purchase count
  let totalPurchases = 0;
  if (settings) {
    const { count } = await supabase
      .from("vendor_lock_purchases")
      .select("*", { count: "exact", head: true })
      .eq("vendor_lock_id", settings.id);
    totalPurchases = count || 0;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      settings: settings || null,
      onChainPrice,
      totalPurchases,
      priceMismatch: onChainPrice && settings?.key_price_wei !== onChainPrice,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
}

async function handleCreate(supabase: any, req: Request, adminUserId: string) {
  const body = await req.json();
  const { lock_address, chain_id, description, image_url, benefits } = body;

  if (!lock_address || !chain_id) {
    throw new Error("Missing required fields: lock_address, chain_id");
  }

  // Fetch lock details from contract
  const { data: networkConfig } = await supabase
    .from("network_configs")
    .select("rpc_url")
    .eq("chain_id", chain_id)
    .eq("is_active", true)
    .single();

  if (!networkConfig?.rpc_url) {
    throw new Error("Chain not configured");
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
  const lock = new ethers.Contract(lock_address, PublicLockABI, provider);

  const [name, symbol, keyPrice, expirationDuration, tokenAddress] = await Promise.all([
    lock.name(),
    lock.symbol(),
    lock.keyPrice(),
    lock.expirationDuration(),
    lock.tokenAddress(),
  ]);

  const keyPriceWei = keyPrice.toString();
  const keyPriceDisplay = Number(ethers.formatEther(keyPrice));

  // Determine currency from token address
  const isNative = tokenAddress === "0x0000000000000000000000000000000000000000";
  let currency = "ETH"; // Native currency default

  if (!isNative) {
    // Query network config for token addresses
    const { data: networkConfig } = await supabase
      .from("network_configs")
      .select("usdc_token_address, dg_token_address, g_token_address, up_token_address")
      .eq("chain_id", chain_id)
      .eq("is_active", true)
      .single();

    const tokenLower = tokenAddress.toLowerCase();
    if (networkConfig) {
      if (tokenLower === networkConfig.usdc_token_address?.toLowerCase()) {
        currency = "USDC";
      } else if (tokenLower === networkConfig.dg_token_address?.toLowerCase()) {
        currency = "DG";
      } else if (tokenLower === networkConfig.g_token_address?.toLowerCase()) {
        currency = "G";
      } else if (tokenLower === networkConfig.up_token_address?.toLowerCase()) {
        currency = "UP";
      } else {
        currency = "UNKNOWN";
      }
    }
  }

  // Deactivate any existing active vendor lock
  await supabase
    .from("vendor_lock_settings")
    .update({ is_active: false })
    .eq("is_active", true);

  // Insert new vendor lock
  const { data, error } = await supabase
    .from("vendor_lock_settings")
    .insert({
      lock_address: lock_address.toLowerCase(),
      chain_id,
      lock_name: name,
      lock_symbol: symbol,
      key_price_wei: keyPriceWei,
      key_price_display: keyPriceDisplay,
      currency,
      currency_address: tokenAddress.toLowerCase(),
      expiration_duration_seconds: Number(expirationDuration),
      description: description || "",
      image_url: image_url || null,
      benefits: benefits || [],
      is_active: true,
      created_by: adminUserId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create vendor lock: ${error.message}`);
  }

  return new Response(JSON.stringify({ ok: true, vendor_lock: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

async function handleUpdate(supabase: any, req: Request) {
  const body = await req.json();
  const { id, description, image_url, benefits } = body;

  if (!id) {
    throw new Error("Missing required field: id");
  }

  const updateData: any = {};
  if (description !== undefined) updateData.description = description;
  if (image_url !== undefined) updateData.image_url = image_url;
  if (benefits !== undefined) updateData.benefits = benefits;

  const { data, error} = await supabase
    .from("vendor_lock_settings")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update vendor lock: ${error.message}`);
  }

  return new Response(JSON.stringify({ ok: true, vendor_lock: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

async function handleDeactivate(supabase: any, req: Request) {
  const body = await req.json();
  const { id } = body;

  if (!id) {
    throw new Error("Missing required field: id");
  }

  const { error } = await supabase
    .from("vendor_lock_settings")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to deactivate vendor lock: ${error.message}`);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}
