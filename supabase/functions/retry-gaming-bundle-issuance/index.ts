/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Contract, JsonRpcProvider, Wallet } from "https://esm.sh/ethers@6.14.4";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import PublicLockV15 from "../_shared/abi/PublicLockV15.json" assert { type: "json" };
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { requireVendor } from "../_shared/vendor.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { verifyPaystackTransaction } from "../_shared/paystack.ts";
import { getExpectedFiatCurrency, getExpectedPaystackAmountKobo, verifyPaystackAmountAndCurrency } from "../_shared/paystack.ts";
import { appendDivviTagToCalldataAsync, submitDivviReferralBestEffort } from "../_shared/divvi.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizePaystackVerifyPayload(payload: any) {
  const data = payload?.data ?? {};
  return {
    id: data?.id,
    status: data?.status,
    reference: data?.reference,
    amount: data?.amount,
    currency: data?.currency,
    paid_at: data?.paid_at,
    channel: data?.channel,
    gateway_response: data?.gateway_response,
    customer: data?.customer?.email ? { email: data.customer.email } : undefined,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const vendor = await requireVendor(req);
    const body = await req.json().catch(() => ({}));
    const orderId = body.order_id || body.orderId;
    if (!orderId) return json({ ok: false, error: "order_id is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let lockId: string | null = null;

    const { data: order, error: orderErr } = await supabase
      .from("gaming_bundle_orders")
      .select(
        "id,vendor_id,vendor_address,status,fulfillment_method,payment_provider,payment_reference,amount_fiat,fiat_symbol,chain_id,bundle_address,nft_recipient_address,txn_hash,token_id,gateway_response,issuance_lock_id,issuance_locked_at,issuance_attempts,issuance_last_error,gaming_bundles(id,bundle_address,chain_id,price_fiat,price_fiat_kobo,fiat_symbol,key_expiration_duration_seconds)"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr) return json({ ok: false, error: orderErr.message }, 400);
    if (!order) return json({ ok: false, error: "order_not_found" }, 404);
    if (order.vendor_id !== vendor.vendorId) return json({ ok: false, error: "vendor_access_denied" }, 403);

    if (String(order.payment_provider) !== "paystack") {
      return json({ ok: false, error: "unsupported_payment_provider" }, 400);
    }

    if (String(order.fulfillment_method).toUpperCase() !== "NFT") {
      return json({ ok: false, error: "unsupported_fulfillment_method" }, 400);
    }

    const reference = String(order.payment_reference || "").trim();
    if (!reference) return json({ ok: false, error: "missing_payment_reference" }, 400);

    // Idempotency: already issued
    if (String(order.status).toUpperCase() === "PAID" && order.txn_hash) {
      return json({ ok: true, already_issued: true, order }, 200);
    }

    // Acquire issuance lock (best-effort; avoid double issuance)
    lockId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const attempts = (order.issuance_attempts ?? 0) + 1;

    const { data: lockedOrder, error: lockErr } = await supabase
      .from("gaming_bundle_orders")
      .update({
        issuance_lock_id: lockId,
        issuance_locked_at: nowIso,
        issuance_attempts: attempts,
        issuance_last_error: null,
      } as any)
      .eq("id", order.id)
      .or(`issuance_lock_id.is.null,issuance_locked_at.lt.${staleBefore}`)
      .select("id,issuance_lock_id")
      .maybeSingle();

    if (lockErr) return json({ ok: false, error: lockErr.message }, 400);
    if (!lockedOrder || lockedOrder.issuance_lock_id !== lockId) {
      return json({ ok: true, processing: true, message: "issuance_already_in_progress" }, 200);
    }

    try {
      // Verify Paystack reference before issuing
      let verifyPayload: any;
      try {
        verifyPayload = await verifyPaystackTransaction(reference);
      } catch (e: any) {
        await supabase
          .from("gaming_bundle_orders")
          .update({
            issuance_last_error: e?.message || "paystack_verify_failed",
            issuance_lock_id: null,
            issuance_locked_at: null,
          } as any)
          .eq("id", order.id)
          .eq("issuance_lock_id", lockId);
        return json({ ok: false, error: e?.message || "paystack_verify_failed" }, 400);
      }

      const verifyData = verifyPayload?.data;
      const verifyStatus = String(verifyData?.status || "").toLowerCase();
      const expectedCurrency = getExpectedFiatCurrency({
        orderCurrency: order.fiat_symbol,
        bundleCurrency: order.gaming_bundles?.fiat_symbol,
        defaultCurrency: "NGN",
      });
      const expectedAmount = getExpectedPaystackAmountKobo({
        priceFiatKobo: (order.gaming_bundles as any)?.price_fiat_kobo,
        priceFiat: order.gaming_bundles?.price_fiat,
        amountFiat: order.amount_fiat,
      });

      const verificationIssues: string[] = [];
      if (verifyStatus !== "success") verificationIssues.push("status_not_success");
      verificationIssues.push(...verifyPaystackAmountAndCurrency({
        paystackAmountMinor: verifyData?.amount,
        paystackCurrency: verifyData?.currency,
        expectedAmountMinor: expectedAmount,
        expectedCurrency,
      }));

      if (verificationIssues.length) {
        await supabase
          .from("gaming_bundle_orders")
          .update({
            status: "FAILED",
            gateway_response: {
              ...(order.gateway_response || {}),
              paystack_verify: sanitizePaystackVerifyPayload(verifyPayload),
              verification_issues: verificationIssues,
            },
            verified_at: nowIso,
            issuance_last_error: `verification_failed:${verificationIssues.join(",")}`,
            issuance_lock_id: null,
            issuance_locked_at: null,
          } as any)
          .eq("id", order.id)
          .eq("issuance_lock_id", lockId);

        return json({ ok: false, error: "verification_failed", issues: verificationIssues }, 400);
      }

      const chainId = Number(order.gaming_bundles?.chain_id || order.chain_id);
      const lockAddress = String(order.gaming_bundles?.bundle_address || order.bundle_address || "");
      const recipient = String(order.nft_recipient_address || order.buyer_address || "").toLowerCase();

      if (!lockAddress || !recipient) {
        await supabase
          .from("gaming_bundle_orders")
          .update({
            issuance_last_error: "missing_lock_or_recipient",
            issuance_lock_id: null,
            issuance_locked_at: null,
          } as any)
          .eq("id", order.id)
          .eq("issuance_lock_id", lockId);
        return json({ ok: false, error: "missing_lock_or_recipient" }, 400);
      }

      const networkConfig = await validateChain(supabase, chainId);
      if (!networkConfig?.rpc_url) {
        await supabase
          .from("gaming_bundle_orders")
          .update({
            issuance_last_error: "rpc_not_configured",
            issuance_lock_id: null,
            issuance_locked_at: null,
          } as any)
          .eq("id", order.id)
          .eq("issuance_lock_id", lockId);
        return json({ ok: false, error: "rpc_not_configured" }, 400);
      }

      const serviceWalletPrivateKey: string | undefined =
        (Deno.env.get("UNLOCK_SERVICE_PRIVATE_KEY") ?? Deno.env.get("SERVICE_WALLET_PRIVATE_KEY") ?? Deno.env.get("SERVICE_PK")) as
          | string
          | undefined;

      if (!serviceWalletPrivateKey) {
        await supabase
          .from("gaming_bundle_orders")
          .update({
            issuance_last_error: "missing_service_wallet_private_key",
            issuance_lock_id: null,
            issuance_locked_at: null,
          } as any)
          .eq("id", order.id)
          .eq("issuance_lock_id", lockId);
        return json({ ok: false, error: "missing_service_wallet_private_key" }, 400);
      }

      const provider = new JsonRpcProvider(networkConfig.rpc_url);
      const signer = new Wallet(serviceWalletPrivateKey, provider);
      const lock = new Contract(lockAddress, PublicLockV15 as any, signer);

      let grantedTxHash: string | undefined;
      let tokenId: string | null = null;

      const hasKey: boolean = await lock.getHasValidKey(recipient).catch(() => false);
      if (!hasKey) {
        const expirationSeconds = Number(order.gaming_bundles?.key_expiration_duration_seconds || 60 * 60 * 24 * 30);
        const expirationTimestamp: number = Number(Math.floor(Date.now() / 1000) + expirationSeconds);

        const recipients = [recipient];
        const expirations = [BigInt(expirationTimestamp)];
        const keyManagers = [recipient];

        const serviceUser = (await signer.getAddress()) as `0x${string}`;
        const calldata = lock.interface.encodeFunctionData("grantKeys", [recipients, expirations, keyManagers]);
        const taggedData = await appendDivviTagToCalldataAsync({ data: calldata, user: serviceUser });
        const txSend = await signer.sendTransaction({ to: lockAddress, data: taggedData });
        const receipt = await txSend.wait();
        grantedTxHash = receipt.hash as string | undefined;

        const { extractTokenIdFromReceipt } = await import("../_shared/nft-helpers.ts");
        tokenId = await extractTokenIdFromReceipt(receipt, lockAddress, recipient);

        if (Number.isFinite(chainId) && grantedTxHash) {
          await submitDivviReferralBestEffort({ txHash: grantedTxHash, chainId });
        }
      }

      await supabase
        .from("gaming_bundle_orders")
        .update({
          status: "PAID",
          fulfillment_method: "NFT",
          txn_hash: grantedTxHash || order.txn_hash,
          token_id: tokenId || order.token_id,
          nft_recipient_address: recipient,
          gateway_response: {
            ...(order.gateway_response || {}),
            paystack_verify: sanitizePaystackVerifyPayload(verifyPayload),
            key_granted: true,
            ...(grantedTxHash ? { key_grant_tx_hash: grantedTxHash } : {}),
          },
          verified_at: nowIso,
          issuance_lock_id: null,
          issuance_locked_at: null,
        } as any)
        .eq("id", order.id)
        .eq("issuance_lock_id", lockId);

      return json({ ok: true, txHash: grantedTxHash || order.txn_hash, token_id: tokenId || order.token_id }, 200);
    } catch (err: any) {
      if (lockId) {
        await supabase
          .from("gaming_bundle_orders")
          .update({
            issuance_last_error: err?.message || "issuance_failed",
            issuance_lock_id: null,
            issuance_locked_at: null,
          } as any)
          .eq("id", order.id)
          .eq("issuance_lock_id", lockId);
      }
      throw err;
    }
  } catch (error: any) {
    const message = error?.message || "Internal error";
    return json({ ok: false, error: message }, message === "vendor_access_denied" ? 403 : 400);
  }
});
