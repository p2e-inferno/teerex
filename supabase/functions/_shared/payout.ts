/* deno-lint-ignore-file no-explicit-any */

/**
 * Server-side gate: a creator/vendor must have a verified payout account before they can list
 * anything for fiat sale. This prevents the situation where funds are sold (or escrow is locked
 * on-chain) but the seller has no way to receive their Naira — i.e. prevent, don't fix.
 *
 * Throws "payout_account_required" when no usable account exists. Returns the account row otherwise.
 */
export async function requireVerifiedPayoutAccount(supabase: any, vendorId: string): Promise<{
  id: string;
  provider_account_code: string;
  percentage_charge: number | null;
  status: string;
}> {
  const { data } = await supabase
    .from("vendor_payout_accounts")
    .select("id, provider_account_code, percentage_charge, status")
    .eq("vendor_id", vendorId)
    .eq("provider", "paystack")
    .eq("status", "verified")
    .maybeSingle();

  if (!data || !data.provider_account_code) {
    throw new Error("payout_account_required");
  }
  return data;
}
