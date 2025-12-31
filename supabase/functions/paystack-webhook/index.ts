/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Contract, JsonRpcProvider, Wallet } from "https://esm.sh/ethers@6.14.4";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import PublicLockV15 from "../_shared/abi/PublicLockV15.json" assert { type: "json" };
import { sendEmail, getTicketEmail, normalizeEmail } from "../_shared/email-utils.ts";
import { formatEventDate } from "../_shared/date-utils.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { appendDivviTagToCalldataAsync, submitDivviReferralBestEffort } from "../_shared/divvi.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
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

    const verificationLog = {
      reference: body?.data?.reference ?? body.reference,
      amount: body?.data?.amount ?? body.amount,
      email: body?.data?.customer?.email ?? body.email,
      status: body?.data?.status ?? body.status,
      paid_at: body?.data?.paid_at ?? body.paid_at,
    };
    console.log(`🎉 [VERIFICATION] Payment verified successfully: ${JSON.stringify(verificationLog, null, 2)}`);

    const md = (body?.data?.metadata ?? body.metadata ?? {}) as Record<string, any>;
    const reference: string | undefined = body?.data?.reference ?? body.reference;
    if (!reference) throw new Error("Missing reference in webhook payload");

    // Supabase: fetch transaction and event to get canonical lock_address and chain_id
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: tx } = await supabase
      .from("paystack_transactions")
      .select("reference, status, user_email, gateway_response, events:events(id, title, date, lock_address, chain_id)")
      .eq("reference", reference)
      .maybeSingle();

    if (!tx) {
      const { data: bundleOrder } = await supabase
        .from("gaming_bundle_orders")
        .select("id, status, txn_hash, nft_recipient_address, payment_reference, bundle_address, chain_id, gaming_bundles(bundle_address, chain_id, key_expiration_duration_seconds)")
        .eq("payment_reference", reference)
        .maybeSingle();

      if (!bundleOrder) {
        console.warn("[WEBHOOK] No pending transaction found for reference:", reference);
        return json({ ok: true, skipped: true, reason: "transaction_not_found" }, 200);
      }

      const bundle = (bundleOrder as any)?.gaming_bundles;
      const lockAddress: string | undefined = bundle?.bundle_address || (bundleOrder as any)?.bundle_address;
      const recipient: string | undefined = (bundleOrder as any)?.nft_recipient_address;
      const chainId = Number(bundle?.chain_id || (bundleOrder as any)?.chain_id);
      const expirationSeconds = Number(bundle?.key_expiration_duration_seconds || 60 * 60 * 24 * 30);

      if ((bundleOrder as any)?.status === "PAID" && (bundleOrder as any)?.txn_hash) {
        console.log("[WEBHOOK] Bundle order already processed and key granted. Skipping.");
        return json({ ok: true, granted: true, reference }, 200);
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
          token_id: tokenId,
        })
        .eq("id", (bundleOrder as any).id);

      return json({ ok: true, granted, reference, txHash: grantTxHash });
    }

    // Idempotency: if already successful and key granted, exit
    const alreadyGranted = Boolean((tx as any)?.gateway_response?.key_granted) && (tx as any)?.status === 'success';
    if (alreadyGranted) {
      console.log("[WEBHOOK] Transaction already processed and key granted. Skipping.");
      return json({ ok: true, granted: true, reference }, 200);
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
          ...gatewayPatch,
        },
        verified_at: new Date().toISOString(),
      })
      .eq('reference', reference);

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

    return json({ ok: true, granted, reference: verificationLog.reference, txHash: grantTxHash });
  } catch (err) {
    console.error(" [KEY GRANT] Payment was successful but key granting failed");
    console.error(" [KEY GRANT] Failed to grant key:", (err as Error).message);
    return json({ ok: false, error: (err as Error).message }, 200);
  }
});
