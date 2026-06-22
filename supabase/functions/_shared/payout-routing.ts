/* deno-lint-ignore-file no-explicit-any */

/**
 * Resolve where a fiat (Paystack) payment for a listing should settle.
 *
 * This is the single source of truth for purchase-time routing. It deliberately does NOT fall back
 * to the platform account when a seller's subaccount is missing/suspended — silently rerouting a
 * seller's money to the platform is the bug we are preventing. Instead:
 *
 *   - destination 'platform' -> route to the platform account (subaccount null). Always allowed;
 *     this is an intentional choice (platform-run / admin / community listings).
 *   - destination 'seller'   -> require a verified payout subaccount for the seller. If none exists
 *     (never set up, or suspended), throw `seller_payout_unavailable` so the caller can show the
 *     listing as temporarily unavailable rather than completing a mis-routed sale.
 */

export type PayoutDestination = "seller" | "platform";

export interface ResolvedPayoutRouting {
  /** Paystack subaccount code, or null when the platform account receives the full amount. */
  subaccountCode: string | null;
  /** vendor_payout_accounts.id when a seller subaccount is used; null for platform routing. */
  payoutAccountId: string | null;
  /** The destination that was actually applied. */
  destination: PayoutDestination;
}

/** Normalize an arbitrary value into a valid PayoutDestination (defaults to 'seller'). */
export function normalizePayoutDestination(value: unknown): PayoutDestination {
  return value === "platform" ? "platform" : "seller";
}

export async function resolveFiatPayoutRouting(
  supabase: any,
  params: { sellerId: string | null | undefined; destination: unknown },
): Promise<ResolvedPayoutRouting> {
  const destination = normalizePayoutDestination(params.destination);

  if (destination === "platform") {
    return { subaccountCode: null, payoutAccountId: null, destination };
  }

  // destination === 'seller': a verified subaccount is mandatory — no platform fallback.
  if (!params.sellerId) {
    throw new Error("seller_payout_unavailable");
  }

  const { data } = await supabase
    .from("vendor_payout_accounts")
    .select("id, provider_account_code")
    .eq("vendor_id", params.sellerId)
    .eq("provider", "paystack")
    .eq("status", "verified")
    .maybeSingle();

  if (!data || !data.provider_account_code) {
    throw new Error("seller_payout_unavailable");
  }

  return {
    subaccountCode: data.provider_account_code,
    payoutAccountId: data.id,
    destination,
  };
}

/** User-facing message for a blocked sale, suitable for surfacing to a buyer. */
export const SELLER_PAYOUT_UNAVAILABLE_MESSAGE =
  "This listing is temporarily unavailable for purchase. Please try again later.";
