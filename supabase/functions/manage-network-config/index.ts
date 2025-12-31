/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { verifyPrivyToken, getUserWalletAddresses } from "../_shared/privy.ts";
import { isAnyUserWalletHasValidKeyParallel } from "../_shared/unlock.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { validateChain } from "../_shared/network-helpers.ts";

interface NetworkConfigInput {
  chain_id: number;
  chain_name: string;
  usdc_token_address?: string | null;
  unlock_factory_address?: string | null;
  native_currency_symbol: string;
  native_currency_name?: string | null;
  native_currency_decimals?: number | null;
  rpc_url?: string | null;
  block_explorer_url?: string | null;
  is_mainnet: boolean;
  is_active: boolean;
}

const ADMIN_LOCK_ADDRESS = Deno.env.get("ADMIN_LOCK_ADDRESS");

async function verifyAdminAccess(privyUserId: string): Promise<void> {
  if (!ADMIN_LOCK_ADDRESS) {
    throw new Error("Admin lock not configured");
  }

  const userWallets = await getUserWalletAddresses(privyUserId);

  if (!userWallets || userWallets.length === 0) {
    throw new Error("No wallets found for user");
  }

  // Get primary chain for admin check
  const primaryChainIdStr = Deno.env.get("VITE_PRIMARY_CHAIN_ID");
  const primaryChainId = primaryChainIdStr ? Number(primaryChainIdStr) : 84532;

  // Get RPC URL from network configs
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const networkConfig = await validateChain(supabase, primaryChainId);

  if (!networkConfig?.rpc_url) {
    throw new Error("Network RPC not configured");
  }
  const rpcUrl = networkConfig.rpc_url;

  // Check if any user wallet has a valid key to the admin lock (parallel)
  const { anyHasKey } = await isAnyUserWalletHasValidKeyParallel(
    ADMIN_LOCK_ADDRESS,
    userWallets,
    rpcUrl
  );

  if (anyHasKey) {
    return; // Authorized
  }

  const walletInfo = userWallets[0] ? ` Your wallet: ${userWallets[0]}` : '';
  throw new Error(`Unauthorized: Admin access required.${walletInfo}`);
}

function validateNetworkConfig(input: any): NetworkConfigInput {
  const required = ['chain_id', 'chain_name', 'native_currency_symbol', 'is_mainnet', 'is_active'];
  for (const field of required) {
    if (!(field in input)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (typeof input.chain_id !== 'number' || input.chain_id <= 0) {
    throw new Error('chain_id must be a positive number');
  }

  if (typeof input.chain_name !== 'string' || input.chain_name.trim().length === 0) {
    throw new Error('chain_name must be a non-empty string');
  }

  if (typeof input.native_currency_symbol !== 'string' || input.native_currency_symbol.trim().length === 0) {
    throw new Error('native_currency_symbol must be a non-empty string');
  }

  if (typeof input.is_mainnet !== 'boolean') {
    throw new Error('is_mainnet must be a boolean');
  }

  if (typeof input.is_active !== 'boolean') {
    throw new Error('is_active must be a boolean');
  }

  // Optional address validations
  const validateAddress = (addr: any, fieldName: string) => {
    if (addr !== null && addr !== undefined) {
      if (typeof addr !== 'string') {
        throw new Error(`${fieldName} must be a string or null`);
      }
      if (addr && (!addr.startsWith('0x') || addr.length !== 42)) {
        throw new Error(`${fieldName} must be a valid Ethereum address`);
      }
    }
  };

  validateAddress(input.usdc_token_address, 'usdc_token_address');
  validateAddress(input.unlock_factory_address, 'unlock_factory_address');

  return {
    chain_id: input.chain_id,
    chain_name: input.chain_name.trim(),
    usdc_token_address: input.usdc_token_address || null,
    unlock_factory_address: input.unlock_factory_address || null,
    native_currency_symbol: input.native_currency_symbol.trim(),
    native_currency_name: input.native_currency_name?.trim() || null,
    native_currency_decimals: input.native_currency_decimals || null,
    rpc_url: input.rpc_url?.trim() || null,
    block_explorer_url: input.block_explorer_url?.trim() || null,
    is_mainnet: input.is_mainnet,
    is_active: input.is_active,
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    // 1. Authenticate user
    const authHeader = req.headers.get("X-Privy-Authorization");
    const privyUserId = await verifyPrivyToken(authHeader);

    // 2. Verify admin access
    await verifyAdminAccess(privyUserId);

    // 3. Handle request based on HTTP method
    const method = req.method;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    switch (method) {
      case 'GET': {
        const networks = await supabase
          .from('network_configs')
          .select('*')
          .order('chain_id');

        if (networks.error) throw networks.error;

        return new Response(
          JSON.stringify({ success: true, networks: networks.data }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'POST': {
        const body = await req.json();
        const validatedData = validateNetworkConfig(body);

        const { data, error } = await supabase
          .from('network_configs')
          .insert(validatedData)
          .select()
          .single();

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, network: data }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'PUT': {
        const body = await req.json();
        const { id, ...updateData } = body;

        if (!id) {
          throw new Error('Network ID required for update');
        }

        const validatedData = validateNetworkConfig(updateData);

        const { data, error } = await supabase
          .from('network_configs')
          .update(validatedData)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, network: data }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'DELETE': {
        const body = await req.json();
        const { id } = body;

        if (!id) {
          throw new Error('Network ID required for deletion');
        }

        const { error } = await supabase
          .from('network_configs')
          .delete()
          .eq('id', id);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        throw new Error(`Method ${method} not allowed`);
    }

  } catch (error) {
    console.error('[manage-network-config] error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error instanceof Error && error.message.includes('Unauthorized') ? 403 : 400
      }
    );
  }
});
