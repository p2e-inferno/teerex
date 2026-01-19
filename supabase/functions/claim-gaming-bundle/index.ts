/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { EAS, SchemaEncoder } from "https://esm.sh/@ethereum-attestation-service/eas-sdk@2.7.0";
import { Contract, JsonRpcProvider, Wallet, ethers } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken, validateUserWallet } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import PublicLockV15 from "../_shared/abi/PublicLockV15.json" assert { type: "json" };
import { GAMING_BUNDLE_SCHEMA_DEFINITION, sha256Hex, normalizeClaimCode } from "../_shared/gaming-bundles.ts";
import { appendDivviTagToCalldataAsync, submitDivviReferralBestEffort } from "../_shared/divvi.ts";

const EAS_ADDRESS_BY_CHAIN: Record<number, string> = {
  8453: "0x4200000000000000000000000000000000000021",
  84532: "0x4200000000000000000000000000000000000021",
};


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      });
    }

    const userId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));
    const orderId = body.order_id || body.orderId;
    const claimCode = body.claim_code || body.claimCode;
    const recipientAddress = String(body.recipient_address || body.recipientAddress || "").trim().toLowerCase();

    if (!orderId && !claimCode) {
      return new Response(JSON.stringify({ ok: false, error: "order_id or claim_code is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!ethers.isAddress(recipientAddress)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid recipient_address" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let orderQuery = supabase
      .from("gaming_bundle_orders")
      .select("*, gaming_bundles(*)")
      .limit(1);

    if (orderId) {
      orderQuery = orderQuery.eq("id", orderId);
    } else {
      const normalized = normalizeClaimCode(String(claimCode));
      const hash = await sha256Hex(normalized);
      orderQuery = orderQuery.eq("claim_code_hash", hash);
    }

    const { data: order, error: orderError } = await orderQuery.maybeSingle();
    if (orderError || !order) {
      return new Response(JSON.stringify({ ok: false, error: "Order not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    // Security: if this order uses a claim code (offline/EAS flow), do NOT allow claiming
    // by `order_id` alone, otherwise a DB leak of order IDs would be sufficient to steal claims.
    if (orderId && !claimCode && (order as any).claim_code_hash) {
      return new Response(JSON.stringify({ ok: false, error: "claim_code is required for this order" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (orderId && claimCode && (order as any).claim_code_hash) {
      const normalized = normalizeClaimCode(String(claimCode));
      const hash = await sha256Hex(normalized);
      if (hash !== (order as any).claim_code_hash) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid claim_code" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }
    }

    if (order.status !== "PAID") {
      return new Response(JSON.stringify({ ok: false, error: "Order not paid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const { data: redemption } = await supabase
      .from("gaming_bundle_redemptions")
      .select("id")
      .eq("order_id", order.id)
      .maybeSingle();
    if (redemption) {
      return new Response(JSON.stringify({ ok: false, error: "Order already redeemed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 409,
      });
    }

    if (!order.eas_uid) {
      return new Response(JSON.stringify({ ok: false, error: "Missing attestation for order" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (order.nft_recipient_address && order.fulfillment_method === "NFT") {
      return new Response(JSON.stringify({ ok: true, already_fulfilled: true, nft_recipient_address: order.nft_recipient_address }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    await validateUserWallet(userId, recipientAddress, "recipient_wallet_not_authorized");

    const bundle = (order as any).gaming_bundles;
    if (!bundle) {
      return new Response(JSON.stringify({ ok: false, error: "Bundle not found for order" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const networkConfig = await validateChain(supabase, Number(bundle.chain_id));
    if (!networkConfig?.rpc_url) {
      return new Response(JSON.stringify({ ok: false, error: "Chain not supported or RPC not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const easAddress = EAS_ADDRESS_BY_CHAIN[Number(bundle.chain_id)] || EAS_ADDRESS_BY_CHAIN[8453];
    const provider = new JsonRpcProvider(networkConfig.rpc_url);
    const eas = new EAS(easAddress);
    eas.connect(provider as any);

    const attestation: any = await eas.getAttestation(order.eas_uid);
    if (!attestation) {
      return new Response(JSON.stringify({ ok: false, error: "Attestation not found on chain" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const decoder = new SchemaEncoder(GAMING_BUNDLE_SCHEMA_DEFINITION);
    const decoded = decoder.decodeData(attestation.data || "0x");
    const decodedMap = decoded.reduce((acc: Record<string, any>, item: any) => {
      acc[item.name] = item.value?.value ?? item.value;
      return acc;
    }, {});

    if (String(decodedMap.orderId || "") !== order.id) {
      return new Response(JSON.stringify({ ok: false, error: "Attestation order mismatch" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (String(decodedMap.bundleAddress || "").toLowerCase() !== String(bundle.bundle_address || "").toLowerCase()) {
      return new Response(JSON.stringify({ ok: false, error: "Attestation bundle mismatch" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const claimedBuyerAddress = String(decodedMap.buyerAddress || "").toLowerCase();
    const orderBuyerAddress = String(order.buyer_address || "").toLowerCase();
    if (orderBuyerAddress && orderBuyerAddress !== recipientAddress) {
      return new Response(JSON.stringify({ ok: false, error: "Claim wallet does not match recorded buyer" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }
    if (claimedBuyerAddress && claimedBuyerAddress !== ethers.ZeroAddress && claimedBuyerAddress !== recipientAddress) {
      return new Response(JSON.stringify({ ok: false, error: "Claim wallet does not match attested buyer" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const servicePk = Deno.env.get("UNLOCK_SERVICE_PRIVATE_KEY") || Deno.env.get("SERVICE_WALLET_PRIVATE_KEY") || Deno.env.get("SERVICE_PK");
    if (!servicePk) {
      return new Response(JSON.stringify({ ok: false, error: "Missing service wallet private key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const signer = new Wallet(servicePk, provider);
    const lock = new Contract(bundle.bundle_address, PublicLockV15 as any, signer);
    const hasKey: boolean = await lock.getHasValidKey(recipientAddress).catch(() => false);

    let grantTxHash: string | undefined;
    let tokenId: string | null = null;
    if (!hasKey) {
      const expirationSeconds = Number(bundle.key_expiration_duration_seconds || 60 * 60 * 24 * 30);
      const expirationTimestamp = Math.floor(Date.now() / 1000) + expirationSeconds;
      const recipients = [recipientAddress];
      const expirations = [BigInt(expirationTimestamp)];
      const keyManagers = [recipientAddress];
      const serviceUser = (await signer.getAddress()) as `0x${string}`;
      const calldata = lock.interface.encodeFunctionData("grantKeys", [recipients, expirations, keyManagers]);
      const taggedData = await appendDivviTagToCalldataAsync({ data: calldata, user: serviceUser });
      const txSend = await signer.sendTransaction({ to: bundle.bundle_address, data: taggedData });
      const receipt = await txSend.wait();
      grantTxHash = receipt.hash;

      // Extract token ID from receipt
      const { extractTokenIdFromReceipt } = await import("../_shared/nft-helpers.ts");
      tokenId = await extractTokenIdFromReceipt(receipt, bundle.bundle_address, recipientAddress);
      if (tokenId) {
        console.log(`[CLAIM BUNDLE] Extracted token ID: ${tokenId}`);
      }

      if (Number.isFinite(bundle.chain_id) && grantTxHash) {
        await submitDivviReferralBestEffort({ txHash: grantTxHash, chainId: Number(bundle.chain_id) });
      }
    }

    const { error: updateError } = await supabase
      .from("gaming_bundle_orders")
      .update({
        fulfillment_method: "EAS_TO_NFT",
        nft_recipient_address: recipientAddress,
        txn_hash: grantTxHash || order.txn_hash,
        buyer_address: recipientAddress,
        token_id: tokenId,
      })
      .eq("id", order.id);

    if (updateError) {
      console.warn("[claim-gaming-bundle] Failed to update order:", updateError.message);
    }

    return new Response(JSON.stringify({ ok: true, tx_hash: grantTxHash || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    const message = error?.message || "Internal error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: message === "recipient_wallet_not_authorized" ? 403 : 400,
    });
  }
});
