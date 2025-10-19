/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Contract, JsonRpcProvider, Wallet } from "https://esm.sh/ethers@6.14.4";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import PublicLockV15 from "../_shared/abi/PublicLockV15.json" assert { type: "json" };

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
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
    const bodyText = await req.text();
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
      .select("*, events:events(id, lock_address, chain_id)")
      .eq("reference", reference)
      .maybeSingle();

    const txEvent = (tx as any)?.events;
    let lockAddress: string | undefined = md.lockAddress ?? md.lock_address ?? txEvent?.lock_address ?? body.lockAddress ?? body.lock_address;
    const recipientFromTx = (Array.isArray((tx as any)?.gateway_response?.metadata?.custom_fields)
      ? (tx as any).gateway_response.metadata.custom_fields.find((f: any) => f?.variable_name === 'user_wallet_address')?.value
      : undefined);
    const recipientFromMd = (Array.isArray((md as any)?.custom_fields)
      ? (md as any).custom_fields.find((f: any) => f?.variable_name === 'user_wallet_address')?.value
      : undefined);
    const recipient: string | undefined = recipientFromTx ?? recipientFromMd ?? (md as any).recipient ?? body.recipient;
    const keyManager: string | undefined = md.keyManager ?? body.keyManager ?? recipient;
    const expirationTimestamp: number = Number(
      md.expirationTimestamp ?? md.expiresAt ?? body.expirationTimestamp ?? Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    );

    // Determine RPC URL: DB first, fallback to chain map, then env
    let rpcUrl: string | undefined;
    const chainId = txEvent?.chain_id ?? (md.chain_id ? Number(md.chain_id) : undefined) ?? (body.chain_id ? Number(body.chain_id) : undefined);
    if (typeof chainId === 'number') {
      const { data: net } = await supabase
        .from("network_configs")
        .select("rpc_url")
        .eq("chain_id", chainId)
        .maybeSingle();
      rpcUrl = net?.rpc_url as string | undefined;
      if (!rpcUrl) {
        rpcUrl = ({ 8453: "https://mainnet.base.org", 84532: "https://sepolia.base.org", 1: "https://eth.llamarpc.com", 11155111: "https://ethereum-sepolia-rpc.publicnode.com", 137: "https://polygon.llamarpc.com" } as Record<number, string>)[chainId];
      }
    }
    rpcUrl = rpcUrl ?? (md.rpcUrl as string | undefined) ?? (body.rpcUrl as string | undefined) ?? (Deno.env.get("PRIMARY_RPC_URL") as string | undefined);
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
    if (!hasKey) {
      const txSend = await lock.grantKeys(recipients, expirations, keyManagers);
      await txSend.wait();
      grantTxHash = txSend.hash as string | undefined;
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

    if (!tx) {
      // Fallback: create the transaction if client insert hasn't happened yet
      const derivedEventId = (md as any).event_id as string | undefined;
      await supabase
        .from('paystack_transactions')
        .upsert(
          {
            event_id: derivedEventId as any,
            user_email: verificationLog.email,
            reference,
            amount: verificationLog.amount,
            currency: 'NGN',
            status: 'success',
            gateway_response: {
              status: verificationLog.status || 'success',
              key_granted: true,
              ...(grantTxHash ? { key_grant_tx_hash: grantTxHash } : {}),
              metadata: md,
            },
            verified_at: new Date().toISOString(),
          },
          { onConflict: 'reference' }
        );
    } else {
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
    }

    console.log(" [WEBHOOK] Webhook processed successfully");
    return json({ ok: true, granted, reference: verificationLog.reference, txHash: grantTxHash });
  } catch (err) {
    console.error(" [KEY GRANT] Payment was successful but key granting failed");
    console.error(" [KEY GRANT] Failed to grant key:", (err as Error).message);
    return json({ ok: false, error: (err as Error).message }, 200);
  }
});
