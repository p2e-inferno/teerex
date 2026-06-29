/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import {
  createPaystackTransferRecipient,
  isValidNigerianAccountNumber,
  verifyAccountNumber,
} from "../_shared/paystack.ts";
import {
  encryptAccountNumber,
  hashAccountNumber,
  publicPayoutAccount,
} from "../_shared/dg-redemption.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const userId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));
    const accountNumber = String(body.account_number || "").trim();
    const bankCode = String(body.bank_code || "").trim();
    const bankName = String(body.bank_name || "").trim();

    if (!isValidNigerianAccountNumber(accountNumber)) {
      return json({ ok: false, error: "Account number must be exactly 10 digits" }, 400);
    }
    if (!bankCode) {
      return json({ ok: false, error: "Select a bank" }, 400);
    }

    const resolved = await verifyAccountNumber(accountNumber, bankCode);
    const accountName = resolved.data.account_name;
    const recipient = await createPaystackTransferRecipient({
      type: "nuban",
      name: accountName,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: "NGN",
      metadata: {
        feature: "dg_redemption",
        user_id: userId,
      },
    });

    const [encrypted, accountHash] = await Promise.all([
      encryptAccountNumber(accountNumber),
      hashAccountNumber(accountNumber, bankCode),
    ]);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.rpc("replace_user_payout_account", {
      p_user_id: userId,
      p_provider_recipient_code: recipient.data.recipient_code,
      p_provider_recipient_id: String(recipient.data.id),
      p_account_holder_name: accountName,
      p_bank_code: bankCode,
      p_bank_name: bankName || bankCode,
      p_account_number_last4: accountNumber.slice(-4),
      p_account_number_hash: accountHash,
      p_encrypted_account_number: encrypted,
      p_provider_metadata: {
        paystack_recipient: recipient.data,
        paystack_account_resolution: resolved.data,
      },
    });

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      payout_account: publicPayoutAccount(data),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const lower = message.toLowerCase();
    const status = lower.includes("authorization") || lower.includes("token")
      ? 401
      : lower.includes("account") || lower.includes("bank") || lower.includes("configured")
      ? 400
      : 500;
    return json({ ok: false, error: message }, status);
  }
});
