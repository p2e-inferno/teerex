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
  try {
    const authHeader = req.headers.get('X-Privy-Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, error: 'missing_privy_token' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    privyUserId = await verifyPrivyToken(authHeader);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const { postId } = body || {};

    if (!postId) {
      return new Response(JSON.stringify({ ok: false, error: 'postId is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const { data: post, error: postError } = await supabase
      .from('event_posts')
      .select('id, event_id')
      .eq('id', postId)
      .maybeSingle();

    if (postError || !post) {
      return new Response(JSON.stringify({ ok: false, error: 'post_not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    let { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, lock_address, chain_id, creator_id')
      .eq('id', post.event_id)
      .maybeSingle();

    if (eventError || !event) {
      return new Response(JSON.stringify({ ok: false, error: 'event_not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
    if (!event.lock_address) throw new Error('event_missing_lock_address');

    const userWallets = await getUserWalletAddresses(privyUserId);
    const normalizedWallets = (userWallets || []).map((addr) => addr.toLowerCase());
    const creatorAddress = (event as any).creator_address
      ? (event as any).creator_address.toLowerCase()
      : undefined;
    const isCreatorByWallet = creatorAddress ? normalizedWallets.includes(creatorAddress) : false;
    const isCreatorById = event.creator_id ? event.creator_id === privyUserId : false;

    const networkConfig = await validateChain(supabase, event.chain_id);
    if (!networkConfig) throw new Error('chain_not_supported');
    if (!networkConfig.rpc_url) throw new Error('rpc_not_configured');

    const [{ anyIsManager }, { anyHasKey }] = await Promise.all([
      isAnyUserWalletIsLockManagerParallel(event.lock_address, normalizedWallets, networkConfig.rpc_url),
      isAnyUserWalletHasValidKeyParallel(event.lock_address, normalizedWallets, networkConfig.rpc_url),
    ]);

    const allowed = Boolean(isCreatorByWallet || isCreatorById || anyIsManager || anyHasKey);
    if (!allowed) {
      return new Response(JSON.stringify({ ok: true, allowed: false, comments: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const commentsRes: any = await supabase
      .from('post_comments' as any)
      .select('*')
      .eq('post_id', postId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (commentsRes.error) throw commentsRes.error;

    return new Response(JSON.stringify({ ok: true, allowed: true, comments: commentsRes.data || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e: any) {
    return handleError(e, privyUserId, { 'Content-Type': 'application/json' });
  }
});
