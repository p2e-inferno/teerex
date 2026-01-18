/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Contract, JsonRpcProvider, Wallet } from "https://esm.sh/ethers@6.14.4";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import PublicLockV15 from "../_shared/abi/PublicLockV15.json" assert { type: "json" };
import { sendEmail, getTicketEmail, normalizeEmail } from "../_shared/email-utils.ts";
import { formatEventDate } from "../_shared/date-utils.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { appendDivviTagToCalldataAsync, submitDivviReferralBestEffort } from "../_shared/divvi.ts";

const PAYSTACK_SUCCESS_EVENT = "charge.success";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizePaystackWebhookPayload(body: any) {
  const data = body?.data ?? {};
  return {
    event: body?.event,
    data: {
      id: data?.id,
      status: data?.status,
      reference: data?.reference,
      amount: data?.amount,
      currency: data?.currency,
      paid_at: data?.paid_at,
      channel: data?.channel,
      gateway_response: data?.gateway_response,
      customer: data?.customer?.email ? { email: data.customer.email } : undefined,
    },
  };
}

function readMetadataField(metadata: any, key: string): string | null {
  const direct = metadata?.[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const fields = Array.isArray(metadata?.custom_fields) ? metadata.custom_fields : [];
  for (const f of fields) {
    if (String(f?.variable_name || "").toLowerCase() === key.toLowerCase()) {
      const v = String(f?.value || "").trim();
      if (v) return v;
    }
  }
  return null;
}

async function hmacSha512Hex(secret: string, data: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*,x-privy-authorization,authorization,content-type",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
    });
  }

  let auditReference: string | undefined;
  let auditBody: any;
  let bundleIssuanceLockId: string | undefined;
  let ticketIssuanceLockId: string | undefined;

  try {
    // 1) Verify Paystack signature over raw body
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secret) {
      console.error("[WEBHOOK] Missing PAYSTACK_SECRET_KEY env");
      return json({ ok: false, error: "server_misconfigured" }, 200);
    }
    const raw = new Uint8Array(await req.arrayBuffer());
    const computed = await hmacSha512Hex(secret, raw);
    const signature = req.headers.get("x-paystack-signature") || "";
    if (!signature || signature !== computed) {
      console.error("[WEBHOOK] Invalid signature");
      return json({ ok: false, error: "invalid_signature" }, 200);
    }

    const bodyText = new TextDecoder().decode(raw);
    const body = bodyText ? JSON.parse(bodyText) : {};
    auditBody = body;
    const paystackEvent = String(body?.event || "").trim();
    const paystackStatus = String(body?.data?.status || "").toLowerCase();
    const reference: string | undefined = body?.data?.reference ?? body.reference;
    if (!reference) throw new Error("Missing reference in webhook payload");
    auditReference = reference;

    if (paystackEvent !== PAYSTACK_SUCCESS_EVENT) {
      return json({ ok: true, skipped: true, reason: "event_ignored", event: paystackEvent }, 200);
    }

    if (paystackStatus !== "success") {
      return json({ ok: true, skipped: true, reason: "status_not_success", status: paystackStatus }, 200);
    }

    const paystackAmount = asNumber(body?.data?.amount);
    const paystackCurrency = String(body?.data?.currency || "").toUpperCase();
    if (paystackAmount === null || !paystackCurrency) {
      return json({ ok: true, skipped: true, reason: "missing_amount_or_currency" }, 200);
    }

    // Supabase: fetch transaction and event to get canonical lock_address and chain_id
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: tx } = await supabase
      .from("paystack_transactions")
      .select("id, reference, status, amount, currency, user_email, gateway_response, verified_at, issuance_lock_id, issuance_locked_at, issuance_attempts, events:events(id, title, date, lock_address, chain_id)")
      .eq("reference", reference)
      .maybeSingle();

    if (!tx) {
      let { data: bundleOrder } = await supabase
        .from("gaming_bundle_orders")
        .select("id, status, txn_hash, token_id, amount_fiat, fiat_symbol, buyer_address, nft_recipient_address, payment_reference, bundle_address, chain_id, gateway_response, verified_at, issuance_lock_id, issuance_locked_at, issuance_attempts, gaming_bundles(bundle_address, chain_id, key_expiration_duration_seconds, price_fiat, fiat_symbol)")
        .eq("payment_reference", reference)
        .maybeSingle();

      if (!bundleOrder) {
        // Recoverability: webhook can arrive before client-side init creates the order record.
        // If Paystack metadata contains bundle + recipient info, create the order and proceed.
        const metadata = body?.data?.metadata ?? {};
        const bundleId = readMetadataField(metadata, "bundle_id");
        const buyerWallet = readMetadataField(metadata, "user_wallet_address");
        const buyerEmail =
          normalizeEmail(readMetadataField(metadata, "user_email") || body?.data?.customer?.email || "") || null;

        if (!bundleId || !buyerWallet) {
          console.warn("[WEBHOOK] No pending transaction found for reference:", reference);
          return json({ ok: true, skipped: true, reason: "transaction_not_found" }, 200);
        }

        const { data: bundle } = await supabase
          .from("gaming_bundles")
          .select("id,vendor_id,vendor_address,bundle_address,chain_id,price_fiat,fiat_symbol,is_active,key_expiration_duration_seconds")
          .eq("id", bundleId)
          .maybeSingle();

        if (!bundle || !bundle.is_active) {
          return json({ ok: true, skipped: true, reason: "bundle_not_found_or_inactive" }, 200);
        }

        const expectedFiat = asNumber(bundle.price_fiat) ?? 0;
        const expectedCurrency = String(bundle.fiat_symbol || "NGN").toUpperCase();
        const expectedAmount = Math.round(expectedFiat * 100);
        const verificationIssues = [
          expectedCurrency !== paystackCurrency ? "currency_mismatch" : null,
          expectedAmount !== paystackAmount ? "amount_mismatch" : null,
        ].filter(Boolean);

        const status = verificationIssues.length ? "FAILED" : "PAID";

        await supabase
          .from("gaming_bundle_orders")
          .upsert({
            bundle_id: bundle.id,
            vendor_id: bundle.vendor_id,
            vendor_address: String(bundle.vendor_address || "").toLowerCase(),
            buyer_email: buyerEmail,
            buyer_address: String(buyerWallet).toLowerCase(),
            payment_provider: "paystack",
            payment_reference: reference,
            amount_fiat: paystackAmount / 100,
            fiat_symbol: paystackCurrency,
            chain_id: bundle.chain_id,
            bundle_address: bundle.bundle_address,
            status,
            fulfillment_method: "NFT",
            nft_recipient_address: String(buyerWallet).toLowerCase(),
            gateway_response: {
              paystack_webhook: sanitizePaystackWebhookPayload(body),
              ...(verificationIssues.length ? { verification_issues: verificationIssues } : {}),
            },
            verified_at: new Date().toISOString(),
          } as any, { onConflict: "payment_reference" });

        if (verificationIssues.length) {
          return json({ ok: true, skipped: true, reason: "verification_failed" }, 200);
        }

        const refetch = await supabase
          .from("gaming_bundle_orders")
          .select("id, status, txn_hash, token_id, amount_fiat, fiat_symbol, buyer_address, nft_recipient_address, payment_reference, bundle_address, chain_id, gateway_response, verified_at, issuance_lock_id, issuance_locked_at, issuance_attempts, gaming_bundles(bundle_address, chain_id, key_expiration_duration_seconds, price_fiat, fiat_symbol)")
          .eq("payment_reference", reference)
          .maybeSingle();
        bundleOrder = refetch.data as any;

        if (!bundleOrder) {
          return json({ ok: true, skipped: true, reason: "transaction_not_found" }, 200);
        }
      }

      const expectedFiat = asNumber((bundleOrder as any)?.gaming_bundles?.price_fiat) ??
        asNumber((bundleOrder as any)?.amount_fiat) ?? 0;
      const expectedCurrency = String((bundleOrder as any)?.fiat_symbol || (bundleOrder as any)?.gaming_bundles?.fiat_symbol || "NGN").toUpperCase();
      const expectedAmount = Math.round(expectedFiat * 100);
      if (expectedCurrency !== paystackCurrency || expectedAmount !== paystackAmount) {
        await supabase
          .from("gaming_bundle_orders")
          .update({
            status: "FAILED",
            gateway_response: {
              ...((bundleOrder as any)?.gateway_response || {}),
              paystack_webhook: sanitizePaystackWebhookPayload(body),
              verification_issues: [
                expectedCurrency !== paystackCurrency ? "currency_mismatch" : null,
                expectedAmount !== paystackAmount ? "amount_mismatch" : null,
              ].filter(Boolean),
            },
            verified_at: new Date().toISOString(),
          } as any)
          .eq("id", (bundleOrder as any).id);
        return json({ ok: true, skipped: true, reason: "verification_failed" }, 200);
      }

      // Mark payment as confirmed (even if issuance later fails)
      await supabase
        .from("gaming_bundle_orders")
        .update({
          status: "PAID",
          gateway_response: {
            ...((bundleOrder as any)?.gateway_response || {}),
            paystack_webhook: sanitizePaystackWebhookPayload(body),
          },
          verified_at: new Date().toISOString(),
        } as any)
        .eq("id", (bundleOrder as any).id);

      const bundle = (bundleOrder as any)?.gaming_bundles;
      const lockAddress: string | undefined = bundle?.bundle_address || (bundleOrder as any)?.bundle_address;
      const recipient: string | undefined = ((bundleOrder as any)?.nft_recipient_address || (bundleOrder as any)?.buyer_address || "").toLowerCase();
      const chainId = Number(bundle?.chain_id || (bundleOrder as any)?.chain_id);
      const expirationSeconds = Number(bundle?.key_expiration_duration_seconds || 60 * 60 * 24 * 30);

      if ((bundleOrder as any)?.status === "PAID" && (bundleOrder as any)?.txn_hash) {
        console.log("[WEBHOOK] Bundle order already processed and key granted. Skipping.");
        return json({ ok: true, granted: true, reference }, 200);
      }

      // Acquire issuance lock (best-effort; avoid double issuance)
      const lockId = crypto.randomUUID();
      bundleIssuanceLockId = lockId;
      const nowIso = new Date().toISOString();
      const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const attempts = ((bundleOrder as any)?.issuance_attempts ?? 0) + 1;

      const { data: lockedOrder } = await supabase
        .from("gaming_bundle_orders")
        .update({
          issuance_lock_id: lockId,
          issuance_locked_at: nowIso,
          issuance_attempts: attempts,
          issuance_last_error: null,
        } as any)
        .eq("id", (bundleOrder as any).id)
        .or(`issuance_lock_id.is.null,issuance_locked_at.lt.${staleBefore}`)
        .select("id,issuance_lock_id")
        .maybeSingle();

      if (!lockedOrder || (lockedOrder as any).issuance_lock_id !== lockId) {
        return json({ ok: true, processing: true, reason: "issuance_already_in_progress" }, 200);
      }

      // Determine RPC URL from network config
      let rpcUrl: string | undefined;
      if (Number.isFinite(chainId)) {
        const networkConfig = await validateChain(supabase, chainId);
        if (!networkConfig?.rpc_url) {
          throw new Error(`RPC URL not configured for chain ${chainId}`);
        }
        rpcUrl = networkConfig.rpc_url;
      }

      const serviceWalletPrivateKey: string | undefined = (Deno.env.get("UNLOCK_SERVICE_PRIVATE_KEY") ?? Deno.env.get("SERVICE_WALLET_PRIVATE_KEY") ?? Deno.env.get("SERVICE_PK")) as string | undefined;

      if (!rpcUrl) throw new Error("Missing RPC_URL");
      if (!serviceWalletPrivateKey) throw new Error("Missing service wallet private key");
      if (!lockAddress || !recipient) throw new Error("Missing lockAddress or recipient");

      const provider = new JsonRpcProvider(rpcUrl);
      const signer = new Wallet(serviceWalletPrivateKey, provider);
      const lock = new Contract(lockAddress, PublicLockV15 as any, signer);

      const hasKey: boolean = await lock.getHasValidKey(recipient).catch(() => false);

      const expirationTimestamp: number = Number(
        Math.floor(Date.now() / 1000) + expirationSeconds,
      );
      const recipients = [recipient];
      const expirations = [BigInt(expirationTimestamp)];
      const keyManagers = [recipient];

      let granted = false;
      let grantTxHash: string | undefined;
      let tokenId: string | null = null;
      if (!hasKey) {
        const serviceUser = (await signer.getAddress()) as `0x${string}`;
        const calldata = lock.interface.encodeFunctionData('grantKeys', [recipients, expirations, keyManagers]);
        const taggedData = await appendDivviTagToCalldataAsync({ data: calldata, user: serviceUser });
        const txSend = await signer.sendTransaction({ to: lockAddress, data: taggedData });
        const receipt = await txSend.wait();
        grantTxHash = receipt.hash as string | undefined;

        // Extract token ID from receipt
        const { extractTokenIdFromReceipt } = await import("../_shared/nft-helpers.ts");
        tokenId = await extractTokenIdFromReceipt(receipt, lockAddress, recipient);
        if (tokenId) {
          console.log(`[PAYSTACK WEBHOOK] Extracted token ID: ${tokenId}`);
        }

        if (Number.isFinite(chainId) && grantTxHash) {
          await submitDivviReferralBestEffort({ txHash: grantTxHash, chainId });
        }
        granted = true;
      } else {
        console.log(" [KEY GRANT] Recipient already has valid key; skipping grant");
        granted = true;
      }

      await supabase
        .from("gaming_bundle_orders")
        .update({
          status: "PAID",
          fulfillment_method: "NFT",
          txn_hash: grantTxHash || (bundleOrder as any)?.txn_hash,
          nft_recipient_address: recipient,
          token_id: tokenId || (bundleOrder as any)?.token_id,
          gateway_response: {
            ...((bundleOrder as any)?.gateway_response || {}),
            key_granted: true,
            ...(grantTxHash ? { key_grant_tx_hash: grantTxHash } : {}),
          },
          issuance_lock_id: null,
          issuance_locked_at: null,
          issuance_last_error: null,
        })
        .eq("id", (bundleOrder as any).id)
        .eq("issuance_lock_id", lockId);

      return json({ ok: true, granted, reference, txHash: grantTxHash });
    }

    // Idempotency: if already successful and key granted, exit
    const alreadyGranted = Boolean((tx as any)?.gateway_response?.key_granted) && (tx as any)?.status === 'success';
    if (alreadyGranted) {
      console.log("[WEBHOOK] Transaction already processed and key granted. Skipping.");
      return json({ ok: true, granted: true, reference }, 200);
    }

    const expectedAmount = asNumber((tx as any)?.amount);
    const expectedCurrency = String((tx as any)?.currency || "NGN").toUpperCase();
    if (expectedAmount === null || expectedCurrency !== paystackCurrency || expectedAmount !== paystackAmount) {
      await supabase
        .from("paystack_transactions")
        .update({
          status: "failed",
          issuance_last_error: "verification_failed",
          gateway_response: {
            ...((tx as any)?.gateway_response || {}),
            paystack_webhook: sanitizePaystackWebhookPayload(body),
            verification_issues: [
              expectedCurrency !== paystackCurrency ? "currency_mismatch" : null,
              expectedAmount !== paystackAmount ? "amount_mismatch" : null,
            ].filter(Boolean),
          },
          verified_at: new Date().toISOString(),
        } as any)
        .eq("reference", reference);
      return json({ ok: true, skipped: true, reason: "verification_failed" }, 200);
    }

    // Mark payment as confirmed (even if issuance later fails)
    await supabase
      .from("paystack_transactions")
      .update({
        status: "success",
        gateway_response: {
          ...((tx as any)?.gateway_response || {}),
          status: "success",
          paystack_webhook: sanitizePaystackWebhookPayload(body),
        },
        verified_at: new Date().toISOString(),
      } as any)
      .eq("reference", reference);

    // Acquire issuance lock (best-effort; avoid double issuance)
    const txLockId = crypto.randomUUID();
    ticketIssuanceLockId = txLockId;
    const txNowIso = new Date().toISOString();
    const txStaleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const txAttempts = ((tx as any)?.issuance_attempts ?? 0) + 1;
    const { data: lockedTx } = await supabase
      .from("paystack_transactions")
      .update({
        issuance_lock_id: txLockId,
        issuance_locked_at: txNowIso,
        issuance_attempts: txAttempts,
        issuance_last_error: null,
      } as any)
      .eq("id", (tx as any).id)
      .or(`issuance_lock_id.is.null,issuance_locked_at.lt.${txStaleBefore}`)
      .select("id,issuance_lock_id")
      .maybeSingle();
    if (!lockedTx || (lockedTx as any).issuance_lock_id !== txLockId) {
      return json({ ok: true, processing: true, reason: "issuance_already_in_progress" }, 200);
    }

    const txEvent = (tx as any)?.events;
    const lockAddress: string | undefined = txEvent?.lock_address;
    // Recipient from DB-initialized metadata only
    const recipient: string | undefined = (Array.isArray((tx as any)?.gateway_response?.metadata?.custom_fields)
      ? (tx as any).gateway_response.metadata.custom_fields.find((f: any) => f?.variable_name === 'user_wallet_address')?.value
      : undefined);
    const keyManager: string | undefined = recipient;
    const expirationTimestamp: number = Number(
      Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    );

    // Determine RPC URL from network config
    let rpcUrl: string | undefined;
    const chainId = txEvent?.chain_id;
    if (typeof chainId === 'number') {
      const networkConfig = await validateChain(supabase, chainId);
      if (!networkConfig?.rpc_url) {
        throw new Error(`RPC URL not configured for chain ${chainId}`);
      }
      rpcUrl = networkConfig.rpc_url;
    }
    const serviceWalletPrivateKey: string | undefined = (Deno.env.get("UNLOCK_SERVICE_PRIVATE_KEY") ?? Deno.env.get("SERVICE_WALLET_PRIVATE_KEY") ?? Deno.env.get("SERVICE_PK")) as string | undefined;

    if (!rpcUrl) throw new Error("Missing RPC_URL");
    if (!serviceWalletPrivateKey) throw new Error("Missing service wallet private key");
    if (!lockAddress || !recipient) throw new Error("Missing lockAddress or recipient");

    console.log(` [KEY GRANT] Network config found: ${JSON.stringify({ chain_name: "Base Sepolia", rpc_url: "SET" })}`);

    const provider = new JsonRpcProvider(rpcUrl);
    const signer = new Wallet(serviceWalletPrivateKey, provider);
    const lock = new Contract(lockAddress, PublicLockV15 as any, signer);

    const hasKey: boolean = await lock.getHasValidKey(recipient).catch(() => false);

    // Build args IN ORDER required by v15
    const recipients = [recipient]; // address[]
    const expirations = [BigInt(expirationTimestamp)]; // uint256[] seconds
    const keyManagers = [keyManager ?? recipient]; // address[]

    console.log("Granting key with params:", {
      expirationTimestamp,
      recipient,
      keyManager,
    });

    let granted = false;
    let grantTxHash: string | undefined;
    let tokenId: string | null = null;
    if (!hasKey) {
      const serviceUser = (await signer.getAddress()) as `0x${string}`;
      const calldata = lock.interface.encodeFunctionData('grantKeys', [recipients, expirations, keyManagers]);
      const taggedData = await appendDivviTagToCalldataAsync({ data: calldata, user: serviceUser });
      const txSend = await signer.sendTransaction({ to: lockAddress, data: taggedData });
      const receipt = await txSend.wait();
      grantTxHash = receipt.hash as string | undefined;

      // Extract token ID from receipt
      const { extractTokenIdFromReceipt } = await import("../_shared/nft-helpers.ts");
      tokenId = await extractTokenIdFromReceipt(receipt, lockAddress, recipient);
      if (tokenId) {
        console.log(`[PAYSTACK WEBHOOK - EVENT TICKET] Extracted token ID: ${tokenId}`);
      }

      if (typeof chainId === 'number' && grantTxHash) {
        await submitDivviReferralBestEffort({ txHash: grantTxHash, chainId });
      }
      granted = true;
    } else {
      console.log(" [KEY GRANT] Recipient already has valid key; skipping grant");
      granted = true;
    }

    // Upsert/update transaction record with success + issuance info
    const gatewayPatch: any = {
      status: 'success',
      key_granted: true,
    };
    if (grantTxHash) gatewayPatch.key_grant_tx_hash = grantTxHash;

    await supabase
      .from('paystack_transactions')
      .update({
        status: 'success',
        gateway_response: {
          ...(tx as any)?.gateway_response,
          paystack_webhook: sanitizePaystackWebhookPayload(body),
          ...gatewayPatch,
        },
        verified_at: new Date().toISOString(),
        issuance_lock_id: null,
        issuance_locked_at: null,
        issuance_last_error: null,
      })
      .eq('reference', reference)
      .eq("issuance_lock_id", txLockId);

    // Store ticket record with token_id if key was granted
    if (granted && grantTxHash) {
      await supabase.from('tickets').insert({
        event_id: txEvent?.id,
        owner_wallet: recipient.toLowerCase(),
        payment_transaction_id: (tx as any).id,
        grant_tx_hash: grantTxHash,
        token_id: tokenId,
        status: 'active',
      });
    }

    console.log(" [WEBHOOK] Webhook processed successfully");

    // Send ticket confirmation email (non-blocking)
    const userEmail = normalizeEmail((tx as any)?.user_email);
    if (granted && userEmail && txEvent?.title) {
      const eventTitle = txEvent.title;
      const eventDate = txEvent.date ? formatEventDate(txEvent.date) : 'TBA';
      const explorerUrl = grantTxHash && chainId
        ? `https://${chainId === 8453 ? 'basescan.org' : 'sepolia.basescan.org'}/tx/${grantTxHash}`
        : undefined;

      const emailContent = getTicketEmail(eventTitle, eventDate, grantTxHash, chainId, explorerUrl);

      // Fire and forget - don't block webhook response
      sendEmail({
        to: userEmail,
        ...emailContent,
        tags: ['ticket-issued', 'paystack'],
      }).catch(err => {
        console.error('[WEBHOOK] Failed to send ticket email:', err);
      });
    }

    return json({ ok: true, granted, reference, txHash: grantTxHash });
  } catch (err) {
    console.error(" [KEY GRANT] Payment was successful but key granting failed");
    console.error(" [KEY GRANT] Failed to grant key:", (err as Error).message);
    // Best-effort persistence for post-mortem + retries (don't overwrite existing gateway_response).
    if (auditReference) {
      try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        if (ticketIssuanceLockId) {
          await supabase
            .from("paystack_transactions")
            .update({
              issuance_last_error: (err as Error).message,
              issuance_lock_id: null,
              issuance_locked_at: null,
            } as any)
            .eq("reference", auditReference)
            .eq("issuance_lock_id", ticketIssuanceLockId);
        }
        if (bundleIssuanceLockId) {
          await supabase
            .from("gaming_bundle_orders")
            .update({
              issuance_last_error: (err as Error).message,
              issuance_lock_id: null,
              issuance_locked_at: null,
            } as any)
            .eq("payment_reference", auditReference)
            .eq("issuance_lock_id", bundleIssuanceLockId);
        }
      } catch (_) {
        // ignore
      }
    }
    return json({ ok: false, error: (err as Error).message }, 200);
  }
});
