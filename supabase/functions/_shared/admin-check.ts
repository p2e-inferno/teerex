/* deno-lint-ignore-file no-explicit-any */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { verifyPrivyToken, getUserWalletAddresses } from "./privy.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./constants.ts";
import { validateChain } from "./network-helpers.ts";
import { isAnyUserWalletHasValidKeyParallel } from "./unlock.ts";

/**
 * Ensures the caller is an admin (has valid key to ADMIN_LOCK_ADDRESS).
 * Throws an error if unauthorized or configuration is missing.
 */
export async function ensureAdmin(headers: Headers): Promise<string> {
  const privyUserId = await verifyPrivyToken(headers.get("X-Privy-Authorization"));

  const ADMIN_LOCK_ADDRESS = Deno.env.get("ADMIN_LOCK_ADDRESS");
  if (!ADMIN_LOCK_ADDRESS) {
    throw new Error("admin_lock_not_configured");
  }

  const userWallets = await getUserWalletAddresses(privyUserId);
  if (!userWallets || userWallets.length === 0) {
    throw new Error("no_wallets_found");
  }

  const primaryChainIdStr = Deno.env.get("VITE_PRIMARY_CHAIN_ID");
  const primaryChainId = primaryChainIdStr ? Number(primaryChainIdStr) : 84532;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const networkConfig = await validateChain(supabase, primaryChainId);
  if (!networkConfig?.rpc_url) {
    throw new Error("network_rpc_not_configured");
  }
  const rpcUrl = networkConfig.rpc_url;

  // Check if any user wallet has a valid key to the admin lock (parallel check)
  const { anyHasKey } = await isAnyUserWalletHasValidKeyParallel(
    ADMIN_LOCK_ADDRESS,
    userWallets,
    rpcUrl
  );

  if (anyHasKey) {
    return privyUserId;
  }

  const walletInfo = userWallets[0] ? ` Your wallet: ${userWallets[0]}` : '';
  throw new Error(`unauthorized${walletInfo}`);
}
