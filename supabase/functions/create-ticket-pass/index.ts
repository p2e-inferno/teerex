/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ethers } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken, validateUserWallet } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import TicketPassControllerAbi from "../_shared/abi/TeeRexTicketPassControllerV1.json" assert { type: "json" };

const ZERO = "0x0000000000000000000000000000000000000000";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isAddr = (v: unknown) => typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v);
const isWeiString = (v: unknown) => typeof v === "string" && /^\d+$/.test(v);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));

    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const imageUrl = body.image_url ? String(body.image_url).trim() : null;
    const chainId = Number(body.chain_id);
    const lockAddress = String(body.lock_address || "").trim().toLowerCase();
    const controllerAddress = String(body.controller_address || "").trim().toLowerCase();
    const creatorAddress = String(body.creator_address || "").trim().toLowerCase();
    const payoutTokenAddress = body.payout_token_address
      ? String(body.payout_token_address).trim().toLowerCase()
      : null;
    const payoutTokenSymbol = body.payout_token_symbol ? String(body.payout_token_symbol).trim() : null;
    const tokenDecimals = body.token_decimals != null ? Number(body.token_decimals) : null;
    const tokenPerCopyWei = String(body.token_per_copy_wei ?? "0");
    const ethPerCopyWei = String(body.eth_per_copy_wei ?? "0");
    const maxCopies = Number(body.max_copies);
    const maxPerBuyer = Number(body.max_per_buyer ?? 1);
    const keyExpirationSeconds = Number(body.key_expiration_duration_seconds);
    const priceFiat = Number(body.price_fiat ?? 0);
    const priceFiatKobo = body.price_fiat_kobo != null ? Number(body.price_fiat_kobo) : null;
    const fiatSymbol = String(body.fiat_symbol || "NGN").trim().toUpperCase();
    const targetEventAddress = body.target_event_address
      ? String(body.target_event_address).trim().toLowerCase()
      : null;
    const deployTxnHash = body.deploy_txn_hash ? String(body.deploy_txn_hash).trim() : null;
    const metadataSet = Boolean(body.metadata_set);

    // ---- shape validation -------------------------------------------------
    if (!title || !description) return json({ ok: false, error: "Missing title or description" }, 400);
    if (!Number.isFinite(chainId)) return json({ ok: false, error: "Invalid chain_id" }, 400);
    if (!isAddr(lockAddress)) return json({ ok: false, error: "Invalid lock_address" }, 400);
    if (!isAddr(controllerAddress)) return json({ ok: false, error: "Invalid controller_address" }, 400);
    if (!isAddr(creatorAddress)) return json({ ok: false, error: "Invalid creator_address" }, 400);
    if (payoutTokenAddress && !isAddr(payoutTokenAddress)) return json({ ok: false, error: "Invalid payout_token_address" }, 400);
    if (targetEventAddress && !isAddr(targetEventAddress)) return json({ ok: false, error: "Invalid target_event_address" }, 400);
    if (!isWeiString(tokenPerCopyWei) || !isWeiString(ethPerCopyWei)) return json({ ok: false, error: "Invalid per-copy amounts" }, 400);
    if (tokenPerCopyWei === "0" && ethPerCopyWei === "0") return json({ ok: false, error: "Pass has no payout" }, 400);
    if ((tokenPerCopyWei !== "0") !== Boolean(payoutTokenAddress)) return json({ ok: false, error: "payout_token_address must accompany a token amount" }, 400);
    if (!Number.isFinite(maxCopies) || maxCopies <= 0) return json({ ok: false, error: "Invalid max_copies" }, 400);
    if (!Number.isFinite(maxPerBuyer) || maxPerBuyer <= 0 || maxPerBuyer > maxCopies) return json({ ok: false, error: "Invalid max_per_buyer" }, 400);
    if (!Number.isFinite(keyExpirationSeconds) || keyExpirationSeconds <= 0) return json({ ok: false, error: "Invalid key_expiration_duration_seconds" }, 400);

    // The creator wallet must belong to the authenticated user.
    await validateUserWallet(privyUserId, creatorAddress, "creator_address_not_authorized_for_user");

    // ---- on-chain integrity verification ----------------------------------
    // Confirm the lock was actually created by this controller with these exact terms,
    // so the DB row faithfully mirrors chain and cannot be spoofed by a malicious client.
    const networkConfig = await validateChain(
      createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
      chainId,
    );
    if (!networkConfig?.rpc_url) return json({ ok: false, error: "rpc_not_configured" }, 400);
    if (
      networkConfig.ticket_pass_controller_address &&
      networkConfig.ticket_pass_controller_address.toLowerCase() !== controllerAddress
    ) {
      return json({ ok: false, error: "controller_address_not_recognized" }, 400);
    }

    const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
    const controller = new ethers.Contract(controllerAddress, TicketPassControllerAbi as any, provider);
    const cfg = await controller.passByLock(lockAddress);
    if (!cfg.exists) return json({ ok: false, error: "pass_not_found_on_chain" }, 400);
    if (String(cfg.creator).toLowerCase() !== creatorAddress) return json({ ok: false, error: "creator_mismatch_on_chain" }, 400);
    if (String(cfg.tokenPerCopy) !== tokenPerCopyWei) return json({ ok: false, error: "token_per_copy_mismatch_on_chain" }, 400);
    if (String(cfg.ethPerCopy) !== ethPerCopyWei) return json({ ok: false, error: "eth_per_copy_mismatch_on_chain" }, 400);
    if (Number(cfg.maxCopies) !== maxCopies) return json({ ok: false, error: "max_copies_mismatch_on_chain" }, 400);
    // native-only pass -> ZERO on chain; token pass -> payout token address
    const chainToken = String(cfg.payoutToken).toLowerCase();
    if ((payoutTokenAddress ?? ZERO) !== chainToken) {
      return json({ ok: false, error: "payout_token_mismatch_on_chain" }, 400);
    }

    const escrowTokenTotalWei = (BigInt(tokenPerCopyWei) * BigInt(maxCopies)).toString();
    const escrowEthTotalWei = (BigInt(ethPerCopyWei) * BigInt(maxCopies)).toString();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("ticket_passes")
      .insert({
        creator_id: privyUserId,
        creator_address: creatorAddress,
        title,
        description,
        image_url: imageUrl,
        chain_id: chainId,
        lock_address: lockAddress,
        controller_address: controllerAddress,
        payout_token_address: payoutTokenAddress,
        payout_token_symbol: payoutTokenSymbol,
        token_decimals: tokenDecimals,
        token_per_copy_wei: tokenPerCopyWei,
        eth_per_copy_wei: ethPerCopyWei,
        escrow_token_total_wei: escrowTokenTotalWei,
        escrow_eth_total_wei: escrowEthTotalWei,
        max_copies: maxCopies,
        max_per_buyer: maxPerBuyer,
        key_expiration_duration_seconds: keyExpirationSeconds,
        price_fiat: priceFiat,
        price_fiat_kobo: priceFiatKobo,
        fiat_symbol: fiatSymbol,
        target_event_address: targetEventAddress,
        deploy_txn_hash: deployTxnHash,
        metadata_set: metadataSet,
        status: "ACTIVE",
        issuance_enabled: true,
      })
      .select("*")
      .single();

    if (error) {
      const isDuplicate = error.code === "23505";
      return json({ ok: false, error: isDuplicate ? "pass_already_exists" : error.message }, 400);
    }

    return json({ ok: true, pass: data }, 200);
  } catch (err: any) {
    console.error("[create-ticket-pass]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
