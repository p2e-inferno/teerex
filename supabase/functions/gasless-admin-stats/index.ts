import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { JsonRpcProvider, Contract } from 'https://esm.sh/ethers@6.14.4';
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import { verifyPrivyToken, getUserWalletAddresses } from '../_shared/privy.ts';
import { handleError } from '../_shared/error-handler.ts';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../_shared/constants.ts';
import { validateChain } from '../_shared/network-helpers.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  let privyUserId: string;
  try {
    // 1. Verify Privy JWT
    privyUserId = await verifyPrivyToken(req.headers.get('X-Privy-Authorization'));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Authorize admin access (on-chain lock manager check)
    const ADMIN_LOCK_ADDRESS = Deno.env.get("ADMIN_LOCK_ADDRESS");
    if (!ADMIN_LOCK_ADDRESS) {
      return new Response(
        JSON.stringify({ ok: false, error: 'admin_lock_not_configured', is_admin: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Get primary chain RPC
    const primaryChainId = Deno.env.get("VITE_PRIMARY_CHAIN_ID") ? Number(Deno.env.get("VITE_PRIMARY_CHAIN_ID")) : 84532;
    const networkConfig = await validateChain(supabase, primaryChainId);
    if (!networkConfig?.rpc_url) {
      return new Response(
        JSON.stringify({ ok: false, error: 'network_rpc_not_configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
    const rpcUrl = networkConfig.rpc_url;

    // Check if user is admin lock manager
    const userWallets = await getUserWalletAddresses(privyUserId);
    if (!userWallets || userWallets.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'no_wallets_found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const lockManagerABI = [
      {
        inputs: [{ internalType: "address", name: "_account", type: "address" }],
        name: "isLockManager",
        outputs: [{ internalType: "bool", name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
      },
    ];

    const provider = new JsonRpcProvider(rpcUrl);
    const lock = new Contract(ADMIN_LOCK_ADDRESS, lockManagerABI, provider);

    let isAdmin = false;
    for (const addr of userWallets) {
      try {
        const ok = await lock.isLockManager(addr);
        if (ok) {
          isAdmin = true;
          break;
        }
      } catch (_) {}
    }

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ ok: false, error: 'unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Query stats in parallel (optimized)
    const [activityLogRes, gasTxRes] = await Promise.all([
      supabase
        .from('gasless_activity_log')
        .select('id, user_id, activity, chain_id, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('gas_transactions')
        .select('gas_cost_wei')
    ]);

    const activityLog = activityLogRes.data || [];
    const gasTx = gasTxRes.data || [];

    // Calculate total gas cost
    let totalCostWei = 0n;
    for (const tx of gasTx) {
      totalCostWei += BigInt(tx.gas_cost_wei || 0);
    }

    // Get activity counts from activity log
    let totalDeploys = 0;
    let totalPurchases = 0;
    for (const log of activityLog) {
      if (log.activity === 'lock_deploy') totalDeploys++;
      else if (log.activity === 'ticket_purchase') totalPurchases++;
    }

    const stats = {
      totalDeploys,
      totalPurchases,
      totalGasCostEth: Number(totalCostWei) / 1e18,
    };

    return new Response(
      JSON.stringify({ ok: true, stats, activity: activityLog }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return handleError(err, privyUserId);
  }
});
