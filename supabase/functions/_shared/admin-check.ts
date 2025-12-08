/* deno-lint-ignore-file no-explicit-any */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { JsonRpcProvider, Contract } from "https://esm.sh/ethers@6.14.4";
import { verifyPrivyToken, getUserWalletAddresses } from "./privy.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./constants.ts";

const LOCK_MANAGER_ABI = [
  {
    inputs: [{ internalType: "address", name: "_account", type: "address" }],
    name: "isLockManager",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Ensures the caller is an admin (lock manager on ADMIN_LOCK_ADDRESS).
 * Throws an error if unauthorized or configuration is missing.
 */
export async function ensureAdmin(headers: Headers): Promise<string> {
  const privyUserId = await verifyPrivyToken(headers.get("X-Privy-Authorization"));

  const ADMIN_LOCK_ADDRESS = Deno.env.get("ADMIN_LOCK_ADDRESS");
  if (!ADMIN_LOCK_ADDRESS) {
    throw new Error("admin_lock_not_configured");
  }

  const primaryChainIdStr = Deno.env.get("VITE_PRIMARY_CHAIN_ID");
  const primaryChainId = primaryChainIdStr ? Number(primaryChainIdStr) : 84532;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: net } = await supabase
    .from("network_configs")
    .select("rpc_url")
    .eq("chain_id", primaryChainId)
    .maybeSingle();

  let rpcUrl = net?.rpc_url;
  if (!rpcUrl) {
    rpcUrl = primaryChainId === 8453 ? "https://mainnet.base.org"
      : primaryChainId === 84532 ? "https://sepolia.base.org"
      : Deno.env.get("PRIMARY_RPC_URL") || undefined;
  }
  if (!rpcUrl) {
    throw new Error("network_rpc_not_configured");
  }

  const wallets = await getUserWalletAddresses(privyUserId);
  if (!wallets || wallets.length === 0) {
    throw new Error("no_wallets_found");
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const lock = new Contract(ADMIN_LOCK_ADDRESS, LOCK_MANAGER_ABI, provider);

  for (const addr of wallets) {
    try {
      const isManager = await lock.isLockManager(addr);
      if (isManager) {
        return privyUserId;
      }
    } catch (_) {
      // ignore and continue
    }
  }

  throw new Error("unauthorized");
}
