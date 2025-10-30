/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ethers, JsonRpcProvider, Wallet } from "https://esm.sh/ethers@6.14.4";
import { EAS } from "https://esm.sh/@ethereum-attestation-service/eas-sdk@2.7.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { getUserWalletAddresses } from "../_shared/privy.ts";
import {
  createRemoteJWKSet,
  jwtVerify,
  importSPKI,
} from "https://deno.land/x/jose@v4.14.4/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRIVY_APP_ID = Deno.env.get("VITE_PRIVY_APP_ID")!;
const PRIVY_VERIFICATION_KEY = Deno.env.get("PRIVY_VERIFICATION_KEY");
const SERVICE_PK = (Deno.env.get('UNLOCK_SERVICE_PRIVATE_KEY') || Deno.env.get('SERVICE_WALLET_PRIVATE_KEY') || Deno.env.get('SERVICE_PK')) as string | undefined;

const EAS_ADDRESS_BY_CHAIN: Record<number, string> = {
  8453: '0x4200000000000000000000000000000000000021',   // Base Mainnet
  84532: '0x4200000000000000000000000000000000000021',  // Base Sepolia
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) });
  }

  try {
    // 1) Authenticate caller via Privy JWT
    const authHeader = req.headers.get('X-Privy-Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing or invalid X-Privy-Authorization header' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 });
    }
    const token = authHeader.split(' ')[1];

    let privyUserId: string | undefined;
    try {
      // Try JWKS verification first (fast path)
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('JWKS verification timeout after 3 seconds')), 3000));
      const jwksPromise = (async () => {
        const JWKS = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`));
        const { payload } = await jwtVerify(token, JWKS, { issuer: 'privy.io', audience: PRIVY_APP_ID });
        return payload;
      })();
      const payload: any = await Promise.race([jwksPromise, timeoutPromise]);
      privyUserId = payload.sub as string | undefined;
    } catch (jwksError) {
      // Fallback to local verification
      if (!PRIVY_VERIFICATION_KEY) throw jwksError;
      const publicKey = await importSPKI(PRIVY_VERIFICATION_KEY, 'ES256');
      const { payload } = await jwtVerify(token, publicKey, { issuer: 'privy.io', audience: PRIVY_APP_ID });
      privyUserId = (payload as any).sub as string | undefined;
    }
    if (!privyUserId) throw new Error('Token verification failed');

    // 2) Parse body
    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};

    const schemaUid: string | undefined = body.schemaUid;
    const recipient: string | undefined = body.recipient;
    const data: string | undefined = body.data; // 0x encoded EAS data
    const deadline: number | string | undefined = body.deadline; // unix timestamp
    const expirationTime: number | string | undefined = body.expirationTime ?? 0;
    const revocable: boolean = body.revocable ?? false;
    const refUID: string = body.refUID ?? '0x0000000000000000000000000000000000000000000000000000000000000000';
    let chainId: number = Number(body.chainId ?? 84532); // default Base Sepolia
    const signature: string | { v: number; r: string; s: string } | undefined = body.signature; // 0x rsv OR {v,r,s}
    const eventId: string | undefined = body.eventId; // optional for DB tracking

    if (!schemaUid || !recipient || !data || !deadline || !signature) {
      throw new Error('Missing required fields: schemaUid, recipient, data, deadline, signature');
    }
    if (!SERVICE_PK) throw new Error('Service wallet private key not configured');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3) Security checks - database-driven configuration

    // 3.1) Check if gasless system is enabled
    const { data: config } = await supabase
      .from('gasless_config')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!config?.enabled) {
      throw new Error('Gasless attestation system is currently disabled');
    }

    // 3.2) Check chain whitelist
    const { data: chain } = await supabase
      .from('gasless_chains')
      .select('*')
      .eq('chain_id', chainId)
      .maybeSingle();

    if (!chain || !chain.enabled) {
      throw new Error(`Chain ${chainId} not whitelisted for gasless attestations`);
    }

    // 3.3) Check schema whitelist
    const { data: schema } = await supabase
      .from('gasless_schemas')
      .select('*')
      .eq('schema_uid', schemaUid)
      .maybeSingle();

    if (!schema || !schema.enabled) {
      throw new Error('Schema not whitelisted for gasless attestations');
    }

    // 3.4) Verify deadline hasn't expired
    const now = Math.floor(Date.now() / 1000);
    if (Number(deadline) < now) {
      throw new Error('Signature deadline expired');
    }

    // 3.5) Rate limiting check
    const { data: rateLimitCheck, error: rateLimitError } = await supabase
      .rpc('check_gasless_rate_limit', {
        p_user_id: privyUserId,
        p_schema_uid: schemaUid
      }) as { data: { allowed: boolean; reason: string } | null; error: any };

    if (rateLimitError) {
      console.error('[eas-gasless] Rate limit check failed:', rateLimitError);
      throw new Error('Rate limit check failed');
    }

    if (!rateLimitCheck?.allowed) {
      throw new Error(rateLimitCheck?.reason || 'Rate limit exceeded');
    }

    // 3.6) EAS SDK accepts signature as either string or {v, r, s} object
    // We'll pass it directly without conversion
    if (config.log_sensitive_data) {
      console.log('[eas-gasless] Using signature as-is (EAS SDK handles both formats):', signature);
    }

    const userWallets = await getUserWalletAddresses(privyUserId);
    const recipientLc = recipient!.toLowerCase();
    if (!userWallets.includes(recipientLc)) {
      throw new Error('Recipient wallet does not belong to authenticated user');
    }

    // 4) Execute gasless attestation via service wallet using EAS SDK
    const rpcUrl = Deno.env.get('PRIMARY_RPC_URL') ?? (chainId === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org');
    const provider = new JsonRpcProvider(rpcUrl);
    const signer = new Wallet(SERVICE_PK!, provider);

    if (config.log_sensitive_data) {
      console.log('[eas-gasless] Service wallet:', await signer.getAddress());
      console.log('[eas-gasless] User (attester & recipient):', recipient);
    }

    // Get EAS contract address for the chain
    const easAddress = EAS_ADDRESS_BY_CHAIN[chainId] || EAS_ADDRESS_BY_CHAIN[84532];

    // Initialize EAS SDK
    const eas = new EAS(easAddress);
    eas.connect(signer);

    let transaction, newAttestationUID;
    try {
      console.log('[eas-gasless] Submitting attestByDelegation', {
        easAddress,
        chainId,
        schema: schemaUid,
        gaslessTx: true,
      });

      // Execute delegated attestation using EAS SDK
      // User is both attester AND recipient
      transaction = await eas.attestByDelegation({
        schema: schemaUid,
        data: {
          recipient,
          expirationTime: BigInt(expirationTime || 0),
          revocable: Boolean(revocable),
          refUID,
          data,
        },
        signature: signature as any, // EAS SDK accepts both string and {v, r, s} object
        attester: recipient, // USER is the attester (not service wallet!)
        deadline: BigInt(deadline),
      });

      // Wait for the transaction and get UID
      newAttestationUID = await transaction.wait();

      if (config.log_sensitive_data) {
        console.log('[eas-gasless] Attestation UID:', newAttestationUID);
        console.log('[eas-gasless] Transaction receipt:', transaction.receipt);
      }

    } catch (err) {
      const shortMessage = (err as any)?.shortMessage || (err as any)?.message || 'Transaction failed';
      const code = (err as any)?.code;
      console.error('[eas-gasless] Transaction failed', { shortMessage, code });
      return new Response(JSON.stringify({ ok: false, error: shortMessage, code }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const uid = newAttestationUID;
    const txHash = (transaction as any)?.hash || (transaction as any)?.receipt?.transactionHash;

    // 5) Log attestation to gasless_attestation_log for rate limiting and monitoring
    try {
      const receipt = (transaction as any)?.receipt;
      const gasUsed = receipt?.gasUsed ? Number(receipt.gasUsed) : null;

      await supabase.from('gasless_attestation_log').insert({
        user_id: privyUserId,
        schema_uid: schemaUid,
        recipient,
        chain_id: chainId,
        event_id: eventId || null,
        gas_used: gasUsed,
        tx_hash: txHash,
        attestation_uid: uid,
      });
    } catch (logErr) {
      console.warn('[eas-gasless] Attestation log insert failed:', (logErr as Error).message);
    }

    // 6) Persist to legacy attestations table (best effort) - optional
    if (eventId) {
      try {
        const ev = (await supabase.from('events').select('id, title, lock_address').eq('id', eventId).maybeSingle()).data;
        await supabase.from('attestations').insert({
          attestation_uid: uid || `temp_${Date.now()}`,
          schema_uid: schemaUid,
          attester: recipient, // User is the attester
          recipient,
          event_id: eventId,
          data: { eventId, lockAddress: ev?.lock_address || '0x0000000000000000000000000000000000000000', eventTitle: ev?.title || '', platform: 'TeeRex-Gasless' } as any,
        } as any);
      } catch (dbErr) {
        console.warn('[eas-gasless] Legacy attestations table insert failed:', (dbErr as Error).message);
      }
    }

    return new Response(JSON.stringify({ ok: true, txHash, uid, gasless: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error) {
    console.error('[eas-gasless] Error:', error);
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  }
});
