/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ethers, Contract, JsonRpcProvider, Wallet } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { getUserWalletAddresses } from "../_shared/privy.ts";
import { isAnyUserWalletHasValidKeyParallel } from "../_shared/unlock.ts";
import {
  createRemoteJWKSet,
  jwtVerify,
  importSPKI,
} from "https://deno.land/x/jose@v4.14.4/index.ts";
import PublicLockV15 from "../_shared/abi/PublicLockV15.json" assert { type: "json" };
import { validateChain } from "../_shared/network-helpers.ts";

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
      return new Response(JSON.stringify({ error: 'Missing or invalid X-Privy-Authorization header' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 });
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
    const eventId: string | undefined = body.eventId;
    const schemaUid: string | undefined = body.schemaUid;
    const recipient: string | undefined = body.recipient;
    const data: string | undefined = body.data; // 0x encoded EAS data
    const deadline: number | string | undefined = body.deadline; // seconds
    const expirationTime: number | string | undefined = body.expirationTime ?? 0;
    const revocable: boolean = body.revocable ?? false;
    const refUID: string = body.refUID ?? '0x0000000000000000000000000000000000000000000000000000000000000000';
    let chainId: number = Number(body.chainId ?? 84532); // default Base Sepolia
    const envAddr = chainId === 8453
      ? Deno.env.get('TEEREX_ADDRESS_BASE_MAINNET')
      : Deno.env.get('TEEREX_ADDRESS_BASE_SEPOLIA');
    let contractAddress: string | undefined = body.contractAddress ?? envAddr;
    const signature: string | undefined = body.signature; // 0x rsv

    if (!schemaUid || !recipient || !data || !deadline || !signature || !contractAddress) {
      throw new Error('Missing required fields: schemaUid, recipient, data, deadline, signature, contractAddress');
    }
    if (!SERVICE_PK) throw new Error('Service wallet private key not configured');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Derive lockAddress from event if provided
    let lockAddress: string | undefined = body.lockAddress;
    if (eventId) {
      const { data: ev } = await supabase.from('events').select('id, title, lock_address, chain_id').eq('id', eventId).maybeSingle();
      if (ev?.chain_id && !body.chainId) chainId = Number(ev.chain_id);
      if (!body.contractAddress) {
        const envAddr2 = chainId === 8453
          ? Deno.env.get('TEEREX_ADDRESS_BASE_MAINNET')
          : Deno.env.get('TEEREX_ADDRESS_BASE_SEPOLIA');
        contractAddress = envAddr2 || contractAddress;
      }
      lockAddress = lockAddress || ev?.lock_address;
    }

    // 3) Verify EIP-712 delegated signature against TeeRex proxy domain
    if (!signature || typeof signature !== 'string' || !signature.startsWith('0x')) {
      throw new Error('Missing or invalid signature');
    }
    // TeeRex proxy contract domain (NOT EAS domain)
    const domain = {
      name: 'TeeRex',
      version: '1.4.0',
      chainId,
      verifyingContract: contractAddress!,
    } as const;
    // EIP-712 type structure matching ATTEST_PROXY_TYPEHASH from EIP712Proxy.sol
    // Field order MUST match exactly: attester, schema, recipient, expirationTime, revocable, refUID, data, value, deadline
    const types = {
      Attest: [
        { name: 'attester', type: 'address' },
        { name: 'schema', type: 'bytes32' },
        { name: 'recipient', type: 'address' },
        { name: 'expirationTime', type: 'uint64' },
        { name: 'revocable', type: 'bool' },
        { name: 'refUID', type: 'bytes32' },
        { name: 'data', type: 'bytes' },
        { name: 'value', type: 'uint256' },
        { name: 'deadline', type: 'uint64' },
      ],
    } as const;
    const value = {
      attester: recipient!, // The user is the attester
      schema: schemaUid,
      recipient,
      expirationTime: BigInt(expirationTime || 0),
      revocable: Boolean(revocable),
      refUID,
      data,
      value: 0n,
      deadline: BigInt(deadline),
    } as const;
    let recovered: string;
    try {
      recovered = ethers.verifyTypedData(domain as any, types as any, value as any, signature);
    } catch (e) {
      throw new Error('Signature verification failed');
    }
    const recoveredLc = recovered.toLowerCase();
    const recipientLc = recipient!.toLowerCase();
    // Fetch user's wallet addresses from Privy and ensure recovered is one of them
    const userWallets = await getUserWalletAddresses(privyUserId);
    if (!userWallets.includes(recoveredLc)) {
      throw new Error('Signer wallet does not belong to authenticated user');
    }
    if (recoveredLc !== recipientLc) {
      throw new Error('Signer wallet does not match recipient');
    }
    // Also decode r,s,v for contract call
    const bytes = signature.slice(2);
    if (bytes.length !== 130) throw new Error('Invalid signature length');
    const r = '0x' + bytes.slice(0, 64);
    const s = '0x' + bytes.slice(64, 128);
    let v = parseInt(bytes.slice(128, 130), 16);
    if (v < 27) v += 27;
    const attester = recipient!;

    // 4) Optional: Unlock key gating (if eventId provided)
    if (eventId && lockAddress) {
      const { data: ev } = await supabase.from('events').select('lock_address, chain_id, title').eq('id', eventId).maybeSingle();
      if ((ev?.lock_address || lockAddress) && (ev?.chain_id || chainId)) {
        const networkConfig = await validateChain(supabase, ev?.chain_id || chainId);
        if (!networkConfig?.rpc_url) throw new Error('Missing RPC URL for event chain');
        const rpcUrl = networkConfig.rpc_url;
        const userWallets = await getUserWalletAddresses(privyUserId);
        const { anyHasKey } = await isAnyUserWalletHasValidKeyParallel(lockAddress || ev!.lock_address, userWallets, rpcUrl);
        if (!anyHasKey) throw new Error('User does not hold a valid ticket for this event');
      }
    }

    // 5) Execute single attestation via service wallet using TeeRex proxy's attestByDelegation
    // Get network config for main attestation
    const networkConfig = await validateChain(supabase, chainId);
    if (!networkConfig?.rpc_url) {
      throw new Error('Chain not supported or RPC URL not configured');
    }
    const rpcUrl = networkConfig.rpc_url;
    const provider = new JsonRpcProvider(rpcUrl);
    const signer = new Wallet(SERVICE_PK!, provider);

    // Use the correct attestByDelegation ABI from EIP712Proxy
    const TEEREX_ABI = [
      {
        type: 'function',
        name: 'attestByDelegation',
        stateMutability: 'payable',
        inputs: [
          {
            name: 'delegatedRequest',
            type: 'tuple',
            components: [
              { name: 'schema', type: 'bytes32' },
              {
                name: 'data',
                type: 'tuple',
                components: [
                  { name: 'recipient', type: 'address' },
                  { name: 'expirationTime', type: 'uint64' },
                  { name: 'revocable', type: 'bool' },
                  { name: 'refUID', type: 'bytes32' },
                  { name: 'data', type: 'bytes' },
                  { name: 'value', type: 'uint256' },
                ],
              },
              {
                name: 'signature',
                type: 'tuple',
                components: [
                  { name: 'v', type: 'uint8' },
                  { name: 'r', type: 'bytes32' },
                  { name: 's', type: 'bytes32' },
                ],
              },
              { name: 'attester', type: 'address' },
              { name: 'deadline', type: 'uint64' },
            ],
          },
        ],
        outputs: [{ name: 'uid', type: 'bytes32' }],
      },
    ] as const;
    const contract = new Contract(contractAddress!, TEEREX_ABI as any, signer);

    if (!lockAddress) throw new Error('Missing lockAddress');

    // Structure the DelegatedProxyAttestationRequest tuple
    const delegatedRequest = {
      schema: schemaUid,
      data: {
        recipient,
        expirationTime: BigInt(expirationTime || 0),
        revocable: Boolean(revocable),
        refUID,
        data,
        value: 0n,
      },
      signature: { v, r, s },
      attester,
      deadline: BigInt(deadline),
    };

    const tx = await contract.attestByDelegation(delegatedRequest);
    const receipt = await tx.wait();

    // Parse Attested event for UID
    let uid: string | undefined;
    try {
      const IFACE = new ethers.Interface(['event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schema)']);
      for (const log of receipt.logs || []) {
        try {
          const parsed = IFACE.parseLog({ topics: log.topics as string[], data: log.data as string });
          if (parsed?.name === 'Attested') {
            uid = parsed?.args?.uid as string;
            break;
          }
        } catch (_) { /* not ours */ }
      }
    } catch (_) { /* ignore */ }

    // 6) Persist to DB (best effort)
    try {
      if (uid) {
        const ev = eventId ? (await supabase.from('events').select('id, title, lock_address').eq('id', eventId).maybeSingle()).data : null;
        await supabase.from('attestations').insert({
          attestation_uid: uid,
          schema_uid: schemaUid,
          attester: signer.address,
          recipient,
          event_id: eventId || null,
          data: { eventId, lockAddress: ev?.lock_address || '0x0000000000000000000000000000000000000000', eventTitle: ev?.title || '', platform: 'TeeRex' } as any,
        } as any);
      }
    } catch (dbErr) {
      console.warn('DB insert failed:', (dbErr as Error).message);
    }

    return new Response(JSON.stringify({ ok: true, txHash: (tx as any).hash, uid }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  }
});
