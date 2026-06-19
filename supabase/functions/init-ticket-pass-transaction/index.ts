/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { normalizeEmail } from "../_shared/email-utils.ts";
import { verifyPrivyToken, validateUserWallet } from "../_shared/privy.ts";
import { orderRefFromReference } from "../_shared/ticket-pass-issuance.ts";

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
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));

    const passId: string | undefined = body.pass_id || body.passId;
    const reference: string | undefined = body.reference;
    const email: string | undefined = body.email;
    const walletAddress: string | undefined = body.wallet_address || body.walletAddress;
    const requestedAmountKobo: number | undefined = typeof body.amount === "number" ? body.amount : undefined;

    if (!passId || !reference || !email || !walletAddress) {
      return json({ ok: false, error: "Missing required fields: pass_id, reference, email, wallet_address" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return json({ ok: false, error: "Invalid email" }, 400);

    const buyerAddress = await validateUserWallet(privyUserId, walletAddress, "wallet_not_authorized_for_user");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: pass, error: passError } = await supabase
      .from("ticket_passes")
      .select("id, creator_id, chain_id, lock_address, price_fiat, price_fiat_kobo, fiat_symbol, status, issuance_enabled")
      .eq("id", passId)
      .maybeSingle();

    if (passError || !pass) return json({ ok: false, error: "Pass not found" }, 404);
    if (pass.status !== "ACTIVE") return json({ ok: false, error: "pass_not_active" }, 400);
    if (!pass.issuance_enabled) return json({ ok: false, error: "issuance_disabled" }, 400);

    const expectedAmountKobo = typeof pass.price_fiat_kobo === "number"
      ? pass.price_fiat_kobo
      : Math.round(Number(pass.price_fiat ?? 0) * 100);
    if (!Number.isFinite(expectedAmountKobo) || expectedAmountKobo <= 0) {
      return json({ ok: false, error: "pass_price_invalid" }, 400);
    }
    if (typeof requestedAmountKobo === "number" && requestedAmountKobo !== expectedAmountKobo) {
      return json({ ok: false, error: "amount_mismatch" }, 400);
    }

    // Route payment to the creator's verified payout subaccount when present (vendor split).
    let subaccountCode: string | null = null;
    if (pass.creator_id) {
      const { data: payoutAccount } = await supabase
        .from("vendor_payout_accounts")
        .select("provider_account_code")
        .eq("vendor_id", pass.creator_id)
        .eq("provider", "paystack")
        .eq("status", "verified")
        .maybeSingle();
      if (payoutAccount?.provider_account_code) subaccountCode = payoutAccount.provider_account_code;
    }

    const { error: upsertError } = await supabase
      .from("ticket_pass_orders")
      .upsert({
        pass_id: pass.id,
        creator_id: pass.creator_id,
        buyer_id: privyUserId,
        buyer_address: buyerAddress,
        buyer_email: normalizedEmail,
        payment_provider: "paystack",
        payment_reference: reference,
        order_ref: orderRefFromReference(reference),
        amount_fiat: expectedAmountKobo / 100,
        fiat_symbol: pass.fiat_symbol || "NGN",
        chain_id: pass.chain_id,
        lock_address: pass.lock_address,
        status: "PENDING",
      }, { onConflict: "payment_reference" });

    if (upsertError) return json({ ok: false, error: upsertError.message }, 400);

    return json({ ok: true, amount_kobo: expectedAmountKobo, subaccount_code: subaccountCode }, 200);
  } catch (err: any) {
    console.error("[init-ticket-pass-transaction]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
