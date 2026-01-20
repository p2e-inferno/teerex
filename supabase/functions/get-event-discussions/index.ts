/* deno-lint-ignore-file no-explicit-any */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import { enforcePost } from '../_shared/http.ts';
import { handleError } from '../_shared/error-handler.ts';
import { getUserWalletAddresses, verifyPrivyToken } from '../_shared/privy.ts';
import { validateChain } from '../_shared/network-helpers.ts';
import { isAnyUserWalletHasValidKeyParallel, isAnyUserWalletIsLockManagerParallel } from '../_shared/unlock.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildPreflightHeaders(req) });
  const methodGuard = enforcePost(req);
  if (methodGuard) return methodGuard;

  let privyUserId: string | undefined;
  const requestId = crypto.randomUUID();
  try {
    const authHeader = req.headers.get('X-Privy-Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.warn('[get-event-discussions] missing token', { requestId });
      return new Response(JSON.stringify({ ok: false, error: 'missing_privy_token' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    privyUserId = await verifyPrivyToken(authHeader);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const { eventId } = body || {};

    console.log('[get-event-discussions] start', { requestId, privyUserId, eventId });

    if (!eventId) {
      console.warn('[get-event-discussions] missing eventId', { requestId });
      return new Response(JSON.stringify({ ok: false, error: 'eventId is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    let { data: event, error: evErr } = await supabase
      .from('events')
      .select('id, lock_address, chain_id, creator_id')
      .eq('id', eventId)
      .maybeSingle();
    let fallbackUsed = false;
    if ((!event || evErr) && typeof eventId === 'string' && eventId.toLowerCase().startsWith('0x')) {
      const fallback = await supabase
        .from('events')
        .select('id, lock_address, chain_id, creator_id')
        .ilike('lock_address', eventId)
        .maybeSingle();
      event = fallback.data;
      evErr = fallback.error;
      fallbackUsed = true;
    }
    console.log('[get-event-discussions] lookup result', {
      requestId,
      hasEvent: Boolean(event),
      evErr: evErr?.message,
      fallbackUsed,
    });
    if (evErr || !event) {
      console.warn('[get-event-discussions] event not found', { requestId, eventId, fallbackUsed });
      return new Response(JSON.stringify({ ok: false, error: 'event_not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
    if (!event.lock_address) throw new Error('event_missing_lock_address');

    const userWallets = await getUserWalletAddresses(privyUserId);
    const normalizedWallets = (userWallets || []).map((addr) => addr.toLowerCase());

    // const isCreatorByWallet = creatorAddress ? normalizedWallets.includes(creatorAddress) : false;
    const isCreatorById = event.creator_id ? event.creator_id === privyUserId : false;

    const networkConfig = await validateChain(supabase, event.chain_id);
    if (!networkConfig) throw new Error('chain_not_supported');
    if (!networkConfig.rpc_url) throw new Error('rpc_not_configured');

    const [{ anyIsManager }, { anyHasKey }] = await Promise.all([
      isAnyUserWalletIsLockManagerParallel(event.lock_address, normalizedWallets, networkConfig.rpc_url),
      isAnyUserWalletHasValidKeyParallel(event.lock_address, normalizedWallets, networkConfig.rpc_url),
    ]);

    const allowed = Boolean(isCreatorById || anyIsManager || anyHasKey);
    console.log('[get-event-discussions] gating result', {
      requestId,
      walletCount: normalizedWallets.length,
      isCreatorById,
      anyIsManager,
      anyHasKey,
      allowed,
    });
    if (!allowed) {
      return new Response(JSON.stringify({ ok: true, allowed: false, posts: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const postsRes: any = await supabase
      .from('event_posts' as any)
      .select(`
        *,
        post_engagement_stats (*),
        post_reactions (*)
      `)
      .eq('event_id', eventId)
      .eq('is_deleted', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (postsRes.error) throw postsRes.error;

    const userWalletSet = new Set(normalizedWallets);
    const posts = ((postsRes.data as any[]) || []).map((post) => {
      const stats = post.post_engagement_stats;
      const reactions = Array.isArray(post.post_reactions) ? post.post_reactions : [];
      const userReactions = reactions.filter((r: any) => userWalletSet.has(String(r.user_address).toLowerCase()));

      return {
        ...post,
        agree_count: stats?.agree_count || 0,
        disagree_count: stats?.disagree_count || 0,
        comment_count: stats?.comment_count || 0,
        engagement_score: stats?.engagement_score || 0,
        user_has_reacted_agree: userReactions.some((r: any) => r.reaction_type === 'agree'),
        user_has_reacted_disagree: userReactions.some((r: any) => r.reaction_type === 'disagree'),
      };
    });

    console.log('[get-event-discussions] success', {
      requestId,
      postCount: posts.length,
      eventId: event.id,
    });

    return new Response(JSON.stringify({ ok: true, allowed: true, posts }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e: any) {
    console.error('[get-event-discussions] unhandled error', {
      requestId,
      privyUserId,
      message: e?.message,
      stack: e?.stack,
    });
    return handleError(e, privyUserId, { 'Content-Type': 'application/json' });
  }
});
