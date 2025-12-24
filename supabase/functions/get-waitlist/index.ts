import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { ethers } from 'https://esm.sh/ethers@6.14.4';
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import { enforcePost } from '../_shared/http.ts';
import { handleError } from '../_shared/error-handler.ts';
import { verifyPrivyToken, getUserWalletAddresses } from '../_shared/privy.ts';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../_shared/constants.ts';
import PublicLockV15 from '../_shared/abi/PublicLockV15.json' assert { type: 'json' };
import { validateChain } from '../_shared/network-helpers.ts';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) });
  }

  const methodGuard = enforcePost(req);
  if (methodGuard) return methodGuard;

  let privyUserId: string | undefined;
  try {
    privyUserId = await verifyPrivyToken(req.headers.get('X-Privy-Authorization'));

    const body = await req.json().catch(() => ({}));
    const {
      event_id,
      filter = 'all',
      page = 1,
      page_size,
    } = body;

    const normalizedFilter = filter === 'notified' || filter === 'unnotified' ? filter : 'all';

    if (!event_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'event_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const pageNumber = Number(page) || 1;
    if (pageNumber < 1) {
      return new Response(
        JSON.stringify({ ok: false, error: 'page must be >= 1' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const pageSize = Math.min(
      Math.max(Number(page_size) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE,
    );

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, creator_id, lock_address, chain_id')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Event not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 },
      );
    }

    let authorized = event.creator_id === privyUserId;

    if (!authorized) {
      const userWallets = await getUserWalletAddresses(privyUserId);

      if (userWallets && userWallets.length > 0) {
        // Get network configuration
        const networkConfig = await validateChain(supabase, event.chain_id);
        if (!networkConfig?.rpc_url) {
          console.error(`[get-waitlist] RPC URL not configured for chain ${event.chain_id}`);
        }

        if (networkConfig?.rpc_url) {
          const rpcUrl = networkConfig.rpc_url;
          const provider = new ethers.JsonRpcProvider(rpcUrl);
          const lock = new ethers.Contract(event.lock_address, PublicLockV15 as any, provider);

          for (const wallet of userWallets) {
            try {
              const isManager = await lock.isLockManager(wallet);
              if (isManager) {
                authorized = true;
                break;
              }
            } catch (err) {
              console.error(`[GET-WAITLIST] Error checking lock manager for ${wallet}:`, err);
            }
          }
        }
      }
    }

    if (!authorized) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Unauthorized: must be event creator or lock manager' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 },
      );
    }

    const offset = (pageNumber - 1) * pageSize;

    let dataQuery = supabase
      .from('event_waitlist')
      .select('id, user_email, wallet_address, created_at, notified, notified_at', { count: 'exact' })
      .eq('event_id', event_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (normalizedFilter === 'notified') {
      dataQuery = dataQuery.eq('notified', true);
    } else if (normalizedFilter === 'unnotified') {
      dataQuery = dataQuery.eq('notified', false);
    }

    const { data: rows, error: dataError, count: filteredCount } = await dataQuery;

    if (dataError) {
      console.error('[GET-WAITLIST] Query error:', dataError);
      throw new Error('Failed to load waitlist');
    }

    const { count: totalCount } = await supabase
      .from('event_waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event_id);

    const { count: notifiedCount } = await supabase
      .from('event_waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event_id)
      .eq('notified', true);

    const filteredTotal = filteredCount || 0;
    const hasMore = filteredTotal > offset + (rows?.length || 0);

    return new Response(
      JSON.stringify({
        ok: true,
        data: rows || [],
        counts: {
          total: totalCount || 0,
          notified: notifiedCount || 0,
          unnotified: (totalCount || 0) - (notifiedCount || 0),
        },
        page: pageNumber,
        page_size: pageSize,
        next_page: hasMore ? pageNumber + 1 : null,
        has_more: hasMore,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error: any) {
    return handleError(error, privyUserId, { 'Content-Type': 'application/json' });
  }
});
