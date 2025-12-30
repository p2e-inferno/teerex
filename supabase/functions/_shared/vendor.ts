/* deno-lint-ignore-file no-explicit-any */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./constants.ts";
import { verifyPrivyToken, getUserWalletAddresses } from "./privy.ts";
import { validateChain } from "./network-helpers.ts";
import { isAnyUserWalletHasValidKeyParallel } from "./unlock.ts";

const DEFAULT_VENDOR_CHAIN_ID = 8453;

export type VendorAuthResult = {
  vendorId: string;
  vendorAddress: string;
  vendorWallets: string[];
  vendorLockAddress: string;
  vendorLockChainId: number;
};

export async function requireVendor(req: Request): Promise<VendorAuthResult> {
  const vendorId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
  const vendorWallets = await getUserWalletAddresses(vendorId);

  const vendorLockAddress = Deno.env.get("VENDOR_LOCK_ADDRESS");
  const vendorLockChainId = Number(Deno.env.get("VENDOR_LOCK_CHAIN_ID") || DEFAULT_VENDOR_CHAIN_ID);

  if (!vendorLockAddress) {
    throw new Error("vendor_lock_not_configured");
  }

  if (!vendorWallets.length) {
    throw new Error("vendor_no_wallets");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const networkConfig = await validateChain(supabase, vendorLockChainId);
  if (!networkConfig?.rpc_url) {
    throw new Error("vendor_lock_chain_not_configured");
  }

  const { anyHasKey, holder } = await isAnyUserWalletHasValidKeyParallel(
    vendorLockAddress,
    vendorWallets,
    networkConfig.rpc_url
  );

  if (!anyHasKey) {
    throw new Error("vendor_access_denied");
  }

  return {
    vendorId,
    vendorWallets,
    vendorAddress: holder || vendorWallets[0],
    vendorLockAddress,
    vendorLockChainId,
  };
}
