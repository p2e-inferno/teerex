/* deno-lint-ignore-file no-explicit-any */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import { enforcePost } from '../_shared/http.ts';
import { handleError } from '../_shared/error-handler.ts';
import { getUserWalletAddresses, verifyPrivyToken } from '../_shared/privy.ts';
import { isAnyUserWalletIsLockManagerParallel } from '../_shared/unlock.ts';
import { sendEmail, getPostNotificationEmail, normalizeEmail } from '../_shared/email-utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('VITE_APP_URL') || 'https://teerex.app';
const BATCH_SIZE = 50;
const SEND_DELAY_MS = Number(Deno.env.get('POST_EMAIL_DELAY_MS') || '0');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    const { event_id, post_id, event_url, poster_name } = body || {};

    console.log('[send-post-notification] Received request:', { event_id, post_id, event_url, poster_name });

    if (!event_id || !post_id) {
      return new Response(JSON.stringify({ ok: false, error: 'event_id and post_id are required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const userWallets = await getUserWalletAddresses(privyUserId);
    if (!userWallets?.length) throw new Error('no_wallets');

    const supabaseAdmin = supabase;

    console.log('[send-post-notification] Querying events table for event_id:', event_id);
    const { data: event, error: evErr } = await supabaseAdmin
      .from('events')
      .select('id, title, date, lock_address, chain_id, creator_id')
      .eq('id', event_id)
      .maybeSingle();

    console.log('[send-post-notification] Event query result:', { event, error: evErr?.message });

    if (evErr || !event) throw new Error('event_not_found');

    let authorized = event.creator_id === privyUserId;
    if (!authorized) {
      const { data: net } = await supabaseAdmin
        .from('network_configs')
        .select('rpc_url')
        .eq('chain_id', event.chain_id)
        .maybeSingle();

      const rpcUrl =
        net?.rpc_url ||
        ({
          8453: 'https://mainnet.base.org',
          84532: 'https://sepolia.base.org',
          1: 'https://eth.llamarpc.com',
          11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
          137: 'https://polygon.llamarpc.com',
          80002: 'https://rpc-amoy.polygon.technology',
        } as Record<number, string>)[event.chain_id] ||
        Deno.env.get('PRIMARY_RPC_URL');

      if (!rpcUrl) throw new Error('rpc_url_missing');

      const { anyIsManager } = await isAnyUserWalletIsLockManagerParallel(
        event.lock_address,
        userWallets,
        rpcUrl
      );
      authorized = anyIsManager;
    }

    if (!authorized) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const { data: post, error: postErr } = await supabaseAdmin
      .from('event_posts')
      .select('id, content, created_at')
      .eq('id', post_id)
      .maybeSingle();
    if (postErr || !post) throw new Error('post_not_found');

    const baseUrl = event.lock_address
      ? `${APP_URL}/event/${event.lock_address.toLowerCase()}`
      : `${APP_URL}/event/${event.id}`;
    const eventUrlFinal = event_url || `${baseUrl}#posts`;

    const emailContent = getPostNotificationEmail(
      event.title,
      eventUrlFinal,
      post.content || '',
      post.created_at,
      poster_name
    );

    const { data: recipients, error: recErr } = await supabaseAdmin
      .from('tickets')
      .select('user_email')
      .eq('event_id', event.id)
      .eq('status', 'active')
      .not('user_email', 'is', null);

    if (recErr) throw recErr;
    if (!recipients?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, failed: 0, message: 'no recipients' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const emails = Array.from(
      new Set(
        recipients.map((r: any) => normalizeEmail(r.user_email)).filter((e): e is string => Boolean(e))
      )
    );

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((to) => sendEmail({ to, ...emailContent, tags: ['event-post', 'notification'] }))
      );
      results.forEach((res) => {
        if (res.status === 'fulfilled' && res.value?.ok) sent += 1;
        else failed += 1;
      });
      if (SEND_DELAY_MS > 0) await sleep(SEND_DELAY_MS);
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, total: emails.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e: any) {
    return handleError(e, privyUserId, { 'Content-Type': 'application/json' });
  }
});
