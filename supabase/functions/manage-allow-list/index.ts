import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { ethers } from 'https://esm.sh/ethers@6.14.4';
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import { enforcePost } from '../_shared/http.ts';
import { handleError } from '../_shared/error-handler.ts';
import { verifyPrivyToken, getUserWalletAddresses } from '../_shared/privy.ts';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../_shared/constants.ts';
import { validateChain } from '../_shared/network-helpers.ts';
import { sendEmail, normalizeEmail, getAllowListApprovalEmail } from '../_shared/email-utils.ts';
import { formatEventDate } from '../_shared/date-utils.ts';
import PublicLockV15 from '../_shared/abi/PublicLockV15.json' assert { type: 'json' };
import type { Database } from '../_shared/database.types.ts';

type UpsertEntry = {
  user_email?: string;
  wallet_address: string;
};

type ManageAllowListPayload =
  | {
      action: 'upsert_allow_list';
      event_id: string;
      entries: UpsertEntry[];
    }
  | {
      action: 'remove_allow_list';
      event_id: string;
      ids: string[];
    }
  | {
      action: 'get_requests';
      event_id: string;
      status?: 'pending' | 'approved' | 'rejected';
      page?: number;
      page_size?: number;
    }
  | {
      action: 'approve_requests';
      event_id: string;
      request_ids: string[];
    }
  | {
      action: 'reject_requests';
      event_id: string;
      request_ids: string[];
    }
  | {
      action: 'approve_by_email';
      event_id: string;
      user_email: string;
    };

const MAX_PAGE_SIZE = 200;

function clamp(value: number | undefined, min: number, max: number): number {
  const numericValue = Number(value || 0) || min;
  if (numericValue < min) return min;
  if (numericValue > max) return max;
  return numericValue;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) });
  }

  const methodGuard = enforcePost(req);
  if (methodGuard) return methodGuard;

  let privyUserId: string | undefined;

  try {
    privyUserId = await verifyPrivyToken(req.headers.get('X-Privy-Authorization'));

    const body = (await req.json().catch(() => ({}))) as ManageAllowListPayload | Record<string, unknown>;
    if (!body || typeof body !== 'object' || !('action' in body)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid request payload' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const action = (body as any).action as ManageAllowListPayload['action'];
    const event_id = (body as any).event_id as string | undefined;

    if (!event_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'event_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, date, creator_id, lock_address, chain_id')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Event not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 },
      );
    }

    // Authorization: event creator or lock manager
    let authorized = event.creator_id === privyUserId;

    if (!authorized) {
      const userWallets = await getUserWalletAddresses(privyUserId as string);

      if (userWallets && userWallets.length > 0) {
        const networkConfig = await validateChain(supabase, event.chain_id);
        if (!networkConfig?.rpc_url) {
          console.error(`[manage-allow-list] RPC URL not configured for chain ${event.chain_id}`);
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
              console.error(`[MANAGE-ALLOW-LIST] Error checking lock manager for ${wallet}:`, err);
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

    const appUrl = Deno.env.get('VITE_TEEREX_DOMAIN') || 'https://teerex.live';
    const eventUrl = `${appUrl}/event/${event.lock_address}`;
    const eventDateStr = event.date ? formatEventDate(event.date) : 'TBA';

    // Helper to upsert allow list entries and send emails when applicable
    const upsertAllowListEntries = async (entries: UpsertEntry[]) => {
      if (!entries || entries.length === 0) return { inserted: 0 };

      const rows = entries.map((entry) => {
        const rawWallet = entry.wallet_address?.trim().toLowerCase();
        if (!rawWallet) {
          throw new Error('wallet_address is required for allow list entries');
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(rawWallet)) {
          throw new Error(`Invalid wallet address: ${rawWallet}`);
        }

        const normalizedEmail = normalizeEmail(entry.user_email ?? null);

        return {
          event_id,
          wallet_address: rawWallet,
          user_email: normalizedEmail,
          added_by: privyUserId as string,
        };
      });

      const { data, error } = await supabase
        .from('event_allow_list')
        .upsert(rows, { onConflict: 'event_id,wallet_address' })
        .select('wallet_address, user_email');

      if (error) {
        console.error('[manage-allow-list] Error upserting allow list entries:', error);
        throw new Error('Failed to update allow list');
      }

      if (data && data.length > 0) {
        for (const row of data) {
          if (row.user_email) {
            try {
              const content = getAllowListApprovalEmail(event.title, eventDateStr, eventUrl);
              await sendEmail({
                to: row.user_email,
                ...content,
                tags: ['allow-list-approval'],
              });
            } catch (err) {
              console.error('[manage-allow-list] Failed to send allow list approval email:', err);
            }
          }
        }
      }

      return { inserted: rows.length };
    };

    if (action === 'upsert_allow_list') {
      const entries = (body as any).entries as UpsertEntry[] | undefined;
      if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: 'entries array is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
        );
      }

      const result = await upsertAllowListEntries(entries);

      return new Response(
        JSON.stringify({ ok: true, ...result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    if (action === 'remove_allow_list') {
      const ids = (body as any).ids as string[] | undefined;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: 'ids array is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
        );
      }

      const { error } = await supabase
        .from('event_allow_list')
        .delete()
        .in('id', ids)
        .eq('event_id', event_id);

      if (error) {
        console.error('[manage-allow-list] Error removing allow list entries:', error);
        throw new Error('Failed to remove allow list entries');
      }

      return new Response(
        JSON.stringify({ ok: true, deleted: ids.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    if (action === 'get_requests') {
      const status = ((body as any).status as 'pending' | 'approved' | 'rejected' | undefined) || 'pending';
      const page = clamp((body as any).page as number | undefined, 1, Number.MAX_SAFE_INTEGER);
      const pageSize = clamp((body as any).page_size as number | undefined, 1, MAX_PAGE_SIZE);
      const offset = (page - 1) * pageSize;

      const { data, error, count } = await supabase
        .from('event_allow_list_requests')
        .select('id, user_email, wallet_address, status, created_at, processed_at, processed_by', { count: 'exact' })
        .eq('event_id', event_id)
        .eq('status', status)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('[manage-allow-list] Error fetching allow list requests:', error);
        throw new Error('Failed to load allow list requests');
      }

      return new Response(
        JSON.stringify({
          ok: true,
          data: data || [],
          page,
          page_size: pageSize,
          total: count || 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    if (action === 'approve_requests') {
      const requestIds = (body as any).request_ids as string[] | undefined;
      if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: 'request_ids array is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
        );
      }

      const { data: requests, error: requestError } = await supabase
        .from('event_allow_list_requests')
        .select('id, user_email, wallet_address')
        .eq('event_id', event_id)
        .eq('status', 'pending')
        .in('id', requestIds);

      if (requestError) {
        console.error('[manage-allow-list] Error loading requests to approve:', requestError);
        throw new Error('Failed to load allow list requests');
      }

      if (!requests || requests.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, approved: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
        );
      }

      for (const reqEntry of requests) {
        if (!reqEntry.wallet_address) {
          throw new Error('All approval requests must have a wallet_address');
        }
      }

      await upsertAllowListEntries(
        requests.map((r) => ({
          user_email: r.user_email,
          wallet_address: r.wallet_address,
        })),
      );

      const { error: updateError } = await supabase
        .from('event_allow_list_requests')
        .update({
          status: 'approved',
          processed_by: privyUserId as string,
          processed_at: new Date().toISOString(),
        })
        .in('id', requestIds)
        .eq('event_id', event_id);

      if (updateError) {
        console.error('[manage-allow-list] Error updating approved requests:', updateError);
        throw new Error('Failed to update allow list requests');
      }

      return new Response(
        JSON.stringify({ ok: true, approved: requests.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    if (action === 'reject_requests') {
      const requestIds = (body as any).request_ids as string[] | undefined;
      if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: 'request_ids array is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
        );
      }

      const { error: updateError } = await supabase
        .from('event_allow_list_requests')
        .update({
          status: 'rejected',
          processed_by: privyUserId as string,
          processed_at: new Date().toISOString(),
        })
        .in('id', requestIds)
        .eq('event_id', event_id);

      if (updateError) {
        console.error('[manage-allow-list] Error updating rejected requests:', updateError);
        throw new Error('Failed to update allow list requests');
      }

      return new Response(
        JSON.stringify({ ok: true, rejected: requestIds.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    if (action === 'approve_by_email') {
      const rawEmail = (body as any).user_email as string | undefined;
      const normalizedEmail = normalizeEmail(rawEmail);

      if (!normalizedEmail) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Valid user_email is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
        );
      }

      const { data: requests, error: requestError } = await supabase
        .from('event_allow_list_requests')
        .select('id, user_email, wallet_address')
        .eq('event_id', event_id)
        .eq('status', 'pending')
        .eq('user_email', normalizedEmail);

      if (requestError) {
        console.error('[manage-allow-list] Error loading requests to approve by email:', requestError);
        throw new Error('Failed to load allow list requests');
      }

      if (!requests || requests.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: 'No pending requests found for that email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 },
        );
      }

      for (const request of requests) {
        if (!request.wallet_address) {
          throw new Error('All approval requests must have a wallet_address');
        }
      }

      await upsertAllowListEntries(
        requests.map((request) => ({
          user_email: request.user_email,
          wallet_address: request.wallet_address,
        })),
      );

      const requestIds = requests.map((request) => request.id);

      const { error: updateError } = await supabase
        .from('event_allow_list_requests')
        .update({
          status: 'approved',
          processed_by: privyUserId as string,
          processed_at: new Date().toISOString(),
        })
        .in('id', requestIds)
        .eq('event_id', event_id);

      if (updateError) {
        console.error('[manage-allow-list] Error updating requests approved by email:', updateError);
        throw new Error('Failed to update allow list requests');
      }

      return new Response(
        JSON.stringify({ ok: true, approved: requests.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: 'Unknown action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    );
  } catch (error: any) {
    return handleError(error, privyUserId, { 'Content-Type': 'application/json' });
  }
});
