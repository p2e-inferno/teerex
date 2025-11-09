import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'
import { Database } from '../_shared/database.types.ts'
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts'
import { ethers } from "https://esm.sh/ethers@6.14.4";
import {
  createRemoteJWKSet,
  jwtVerify,
  importSPKI,
} from "https://deno.land/x/jose@v4.14.4/index.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PRIVY_APP_ID = Deno.env.get('VITE_PRIVY_APP_ID')!;
const PRIVY_VERIFICATION_KEY = Deno.env.get('PRIVY_VERIFICATION_KEY');

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    })
  }

  try {
    const { eventId } = await req.json();
    
    if (!eventId) {
      return new Response(JSON.stringify({ error: 'Event ID is required' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('Fetching transactions for event (admin):', eventId);

    // Initialize Supabase client with service role (bypasses RLS)
    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Verify Privy JWT
    const authHeader = req.headers.get('X-Privy-Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid X-Privy-Authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const token = authHeader.split(' ')[1]
    let privyUserId: string | undefined
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('JWKS verification timeout after 3 seconds')), 3000))
      const jwksPromise = (async () => {
        const JWKS = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`))
        const { payload } = await jwtVerify(token, JWKS, { issuer: 'privy.io', audience: PRIVY_APP_ID })
        return payload
      })()
      const payload: any = await Promise.race([jwksPromise, timeoutPromise])
      privyUserId = payload.sub as string | undefined
    } catch (jwksError) {
      if (!PRIVY_VERIFICATION_KEY) throw jwksError
      const publicKey = await importSPKI(PRIVY_VERIFICATION_KEY, 'ES256')
      const { payload } = await jwtVerify(token, publicKey, { issuer: 'privy.io', audience: PRIVY_APP_ID })
      privyUserId = (payload as any).sub as string | undefined
    }
    if (!privyUserId) return new Response(JSON.stringify({ error: 'Token verification failed' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Authorize: creator or on-chain lock manager
    const { data: ev, error: evErr } = await supabase.from('events').select('id, creator_id, lock_address, chain_id').eq('id', eventId).maybeSingle()
    if (evErr || !ev) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    let authorized = ev.creator_id === (privyUserId as any)
    if (!authorized) {
      let rpcUrl: string | undefined
      const { data: net } = await supabase.from('network_configs').select('rpc_url').eq('chain_id', ev.chain_id).maybeSingle()
      rpcUrl = net?.rpc_url || (ev.chain_id === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org')
      if (!rpcUrl) rpcUrl = Deno.env.get('PRIMARY_RPC_URL') || undefined
      if (!rpcUrl) return new Response(JSON.stringify({ error: 'Network RPC not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      // Best-effort: require caller to be creator. If you want full on-chain wallet verification, integrate Privy user wallets fetch here.
      // For admin endpoint, creator check is usually sufficient.
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl)
        const lockAbi = [{ inputs: [{ internalType: 'address', name: '_account', type: 'address' }], name: 'isLockManager', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'view', type: 'function' }]
        const lock = new ethers.Contract(ev.lock_address, lockAbi, provider)
        // We can't map Privy IDs to wallets without fetching; leave as creator-only if not using privy.ts here.
      } catch (_) {}
    }
    if (!authorized) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Fetch transactions for the event using service role (bypasses RLS).
    // Return a minimal set but keep gateway_response for admin UI needs.
    const { data: transactions, error } = await supabase
      .from('paystack_transactions')
      .select('id, reference, amount, currency, status, gateway_response, created_at, verified_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching transactions:', error)
      return new Response(JSON.stringify({ error: 'Failed to fetch transactions' }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('Found transactions:', transactions.length);

    return new Response(JSON.stringify({ transactions }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Admin get transactions error:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error'
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
