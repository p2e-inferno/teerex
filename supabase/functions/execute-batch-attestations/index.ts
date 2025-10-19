/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Contract, JsonRpcProvider, Wallet, ethers } from "https://esm.sh/ethers@6.14.4";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

const encoder = new TextEncoder();
function sseEvent(id: number, event: string | undefined, data: any) {
  const head = `id: ${id}\n` + (event ? `event: ${event}\n` : "");
  return encoder.encode(head + `data: ${JSON.stringify(data)}\n\n`);
}

const BATCH_ABI = [
  {
    type: 'function',
    name: 'createBatchAttestationsByDelegation',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'requests',
        type: 'tuple[]',
        components: [
          { name: 'schemaUID', type: 'bytes32' },
          { name: 'recipient', type: 'address' },
          { name: 'data', type: 'bytes' },
          { name: 'deadline', type: 'uint256' },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'uids', type: 'bytes32[]' }],
  },
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*,x-privy-authorization,authorization,content-type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
    });
  }

  try {
    const url = new URL(req.url);
    const sse = url.searchParams.get('sse') === '1' || req.headers.get('accept')?.includes('text/event-stream');
    let eventId: string | undefined;
    let chainId: number = 84532;
    let contractAddress: string | undefined;

    if (req.method === 'GET') {
      eventId = url.searchParams.get('eventId') || undefined;
      chainId = Number(url.searchParams.get('chainId') ?? 84532);
      contractAddress = url.searchParams.get('contractAddress')
        ?? (chainId === 8453 ? Deno.env.get('TEEREX_ADDRESS_BASE_MAINNET') : Deno.env.get('TEEREX_ADDRESS_BASE_SEPOLIA')) || undefined;
    } else {
      const text = await req.text();
      const body = text ? JSON.parse(text) : {};
      eventId = body.eventId;
      chainId = Number(body.chainId ?? 84532);
      contractAddress = body.contractAddress
        ?? (chainId === 8453 ? Deno.env.get('TEEREX_ADDRESS_BASE_MAINNET') : Deno.env.get('TEEREX_ADDRESS_BASE_SEPOLIA'));
    }

    if (!eventId) return json({ ok: false, error: 'Missing eventId' }, 400);
    if (!contractAddress) return json({ ok: false, error: 'Missing contract address' }, 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch pending delegations for the event
    const { data: delegations, error: fetchErr } = await supabase
      .from('attestation_delegations')
      .select('*')
      .eq('event_id', eventId)
      .eq('executed', false)
      .order('created_at', { ascending: true });

    if (fetchErr) throw fetchErr;
    if (!delegations || delegations.length === 0) {
      if (sse) {
        const stream = new ReadableStream({
          start: async (controller) => {
            controller.enqueue(sseEvent(1, 'status', { state: 'idle', message: 'No pending delegations' }));
            controller.enqueue(sseEvent(2, 'end', { reason: 'empty' }));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      return json({ ok: true, message: 'No pending delegations' });
    }

    // Provider & signer
    const rpcUrl = Deno.env.get('RPC_URL') ?? (chainId === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org');
    const pk = Deno.env.get('UNLOCK_SERVICE_PRIVATE_KEY')
      ?? Deno.env.get('SERVICE_WALLET_PRIVATE_KEY')
      ?? Deno.env.get('SERVICE_PK');
    if (!pk) throw new Error('Missing service wallet private key');

    const provider = new JsonRpcProvider(rpcUrl);
    const signer = new Wallet(pk, provider);
    const contract = new Contract(contractAddress, BATCH_ABI as any, signer);

    // Prepare request tuples from DB rows
    const requests = delegations.map((d: any) => [
      d.schema_uid,
      d.recipient,
      d.data,
      BigInt(Math.floor(new Date(d.deadline).getTime() / 1000)),
      d.signature,
    ]);

    if (sse) {
      let id = 0;
      const stream = new ReadableStream({
        start: async (controller) => {
          controller.enqueue(sseEvent(++id, 'status', { state: 'queued', count: requests.length }));
          try {
            controller.enqueue(sseEvent(++id, 'progress', { state: 'sending' }));
            const tx = await contract.createBatchAttestationsByDelegation(requests);
            controller.enqueue(sseEvent(++id, 'submitted', { txHash: tx.hash }));
            const receipt = await tx.wait();
            controller.enqueue(sseEvent(++id, 'confirmed', { blockNumber: receipt?.blockNumber, txHash: tx.hash }));

            // Parse EAS Attested events for UIDs
            const uids: string[] = [];
            try {
              const IFACE = new ethers.Interface([
                'event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schema)'
              ]);
              for (const log of receipt.logs || []) {
                try {
                  const parsed = IFACE.parseLog({ topics: log.topics as string[], data: log.data as string });
                  if (parsed?.name === 'Attested') {
                    const uid = parsed?.args?.uid as string;
                    if (uid && typeof uid === 'string') uids.push(uid);
                  }
                } catch (_) { /* ignore non-matching logs */ }
              }
            } catch (_) { /* ignore */ }
            controller.enqueue(sseEvent(++id, 'parsed', { count: uids.length }));

            // Update delegations as executed
            const { error: updErr } = await supabase
              .from('attestation_delegations')
              .update({ executed: true, executed_tx_hash: tx.hash, executed_at: new Date().toISOString() })
              .in('id', delegations.map((d: any) => d.id));
            if (updErr) controller.enqueue(sseEvent(++id, 'error', { message: updErr.message }));

            // Insert attestations
            const rows = delegations.map((d: any, i: number) => ({
              attestation_uid: uids[i] || d.message_hash,
              schema_uid: d.schema_uid,
              attester: signer.address,
              recipient: d.recipient,
              event_id: d.event_id,
              data: { eventId: d.event_id, lockAddress: d.lock_address ?? '0x0000000000000000000000000000000000000000', eventTitle: d.event_title ?? '', platform: 'TeeRex' } as any,
              created_at: new Date().toISOString(),
            }));
            const { error: insErr } = await supabase.from('attestations').insert(rows as any);
            if (insErr) controller.enqueue(sseEvent(++id, 'error', { message: insErr.message }));
            controller.enqueue(sseEvent(++id, 'db', { inserted: rows.length }));
            controller.enqueue(sseEvent(++id, 'end', { ok: true, txHash: receipt?.hash || '' }));
            controller.close();
          } catch (e) {
            controller.enqueue(sseEvent(++id, 'error', { message: (e as Error).message }));
            controller.enqueue(sseEvent(++id, 'end', { ok: false }));
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const tx = await contract.createBatchAttestationsByDelegation(requests);
    const receipt = await tx.wait();

    // Update delegations as executed
    const { error: updErr } = await supabase
      .from('attestation_delegations')
      .update({ executed: true, executed_tx_hash: tx.hash, executed_at: new Date().toISOString() })
      .in('id', delegations.map((d: any) => d.id));
    if (updErr) console.error('Failed to update delegations executed:', updErr.message);

    // Parse EAS Attested events for UIDs using ABI
    const extractedUids: string[] = [];
    try {
      const IFACE = new ethers.Interface([
        'event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schema)'
      ]);
      for (const log of receipt.logs || []) {
        try {
          const parsed = IFACE.parseLog({ topics: log.topics as string[], data: log.data as string });
          if (parsed?.name === 'Attested') {
            const uid = parsed?.args?.uid as string;
            if (uid && typeof uid === 'string') extractedUids.push(uid);
          }
        } catch (_) { /* skip */ }
      }
    } catch (_) { /* ignore */ }

    // Build rows; map extracted UIDs by index when possible, else fallback to message_hash
    const rows = delegations.map((d: any, i: number) => ({
      attestation_uid: extractedUids[i] || d.message_hash,
      schema_uid: d.schema_uid,
      attester: signer.address,
      recipient: d.recipient,
      event_id: d.event_id,
      data: { eventId: d.event_id, lockAddress: d.lock_address ?? '0x0000000000000000000000000000000000000000', eventTitle: d.event_title ?? '', platform: 'TeeRex' } as any,
      created_at: new Date().toISOString(),
    }));

    const { error: insErr } = await supabase.from('attestations').insert(rows as any);
    if (insErr) console.error('Failed to insert attestations:', insErr.message);

    return json({ ok: true, txHash: tx.hash, count: delegations.length });
  } catch (err) {
    console.error('[execute-batch-attestations] error:', (err as Error).message);
    return json({ ok: false, error: (err as Error).message }, 200);
  }
});
