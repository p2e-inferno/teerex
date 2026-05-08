/**
 * Notify waitlist members that spots are available
 *
 * This function:
 * 1. Verifies caller is event creator or lock manager (authorization)
 * 2. Fetches waitlist members for the event who haven't been notified
 * 3. Sends "spots available" emails in batches (max 50 per call)
 * 4. Updates notified = true and notified_at timestamp
 * 5. Returns counts of notified/failed emails
 *
 * Authorization:
 * - Event creator (via Privy JWT)
 * - On-chain lock manager (checked via smart contract)
 *
 * Rate limiting:
 * - 50 emails per invocation (can be called multiple times)
 * - Simple throttle to avoid overwhelming Mailgun
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import { verifyPrivyToken } from '../_shared/privy.ts';
import { sendEmail, getWaitlistSpotOpenEmail } from '../_shared/email-utils.ts';
import { formatEventDate } from '../_shared/date-utils.ts';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../_shared/constants.ts';
import { enforcePost } from '../_shared/http.ts';
import { handleError } from '../_shared/error-handler.ts';
import { getEventAuthorization, requireEventAuthorization } from '../_shared/event-auth.ts';

const BATCH_SIZE = 50;
const SEND_DELAY_MS = Number(Deno.env.get('WAITLIST_EMAIL_DELAY_MS') || '150');
const DEFAULT_APP_URL = Deno.env.get('VITE_TEEREX_DOMAIN') || 'https://teerex.live';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) });
  }

  const methodGuard = enforcePost(req);
  if (methodGuard) return methodGuard;

  let privyUserId: string | undefined;
  try {
    // 1. Verify Privy JWT
    privyUserId = await verifyPrivyToken(req.headers.get('X-Privy-Authorization'));

    // 2. Parse request
    const body = await req.json().catch(() => ({}));
    const { event_id, event_url, target_event_id, target_title, target_date, page = 1 } = body;

    const pageNumber = Number(page) || 1;
    if (pageNumber < 1) {
      return new Response(
        JSON.stringify({ ok: false, error: 'page must be >= 1' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!event_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'event_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Fetch event details
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, date, creator_id, lock_address, chain_id')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Event not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    await requireEventAuthorization({
      supabase,
      event,
      privyUserId,
      permission: 'manage_waitlist',
      errorMessage: 'Unauthorized: must be event creator, lock manager, or waitlist manager',
    });

    let targetEvent: any = null;
    if (target_event_id) {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, date, starts_at, creator_id, lock_address, chain_id')
        .eq('id', target_event_id)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Target event not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      const targetAuth = await getEventAuthorization({
        supabase,
        event: data,
        privyUserId,
        allowOnchainManager: true,
      });

      if (data.creator_id !== event.creator_id && !targetAuth.authorized) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Unauthorized: target event must belong to the original event creator or be manageable by you',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      targetEvent = data;
    }

    // 5. Count remaining (for pagination metadata)
    const { count: totalCount, error: countError } = await supabase
      .from('event_waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event_id)
      .eq('notified', false);

    if (countError) {
      console.error('[NOTIFY-WAITLIST] Count error:', countError);
      throw new Error('Failed to query waitlist');
    }

    const offset = (pageNumber - 1) * BATCH_SIZE;

    // 6. Fetch non-notified waitlist members for this page
    const { data: waitlistMembers, error: waitlistError } = await supabase
      .from('event_waitlist')
      .select('id, user_email')
      .eq('event_id', event_id)
      .eq('notified', false)
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (waitlistError) {
      console.error('[NOTIFY-WAITLIST] Query error:', waitlistError);
      throw new Error('Failed to query waitlist');
    }

    if (!waitlistMembers || waitlistMembers.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          notified: 0,
          failed: 0,
          message: 'No members to notify',
          total_pending: totalCount || 0,
          page: pageNumber,
          next_page: null,
          has_more: false,
          remaining: Math.max(0, (totalCount || 0) - offset),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`[NOTIFY-WAITLIST] Notifying ${waitlistMembers.length} members for event ${event_id}`);

    // 6. Prepare email content
    const eventTitle = targetEvent?.title || target_title || event.title;
    const eventDateSource = targetEvent?.starts_at || targetEvent?.date || target_date || event.date;
    const eventDate = eventDateSource
      ? formatEventDate(eventDateSource)
      : event.date
        ? formatEventDate(event.date)
        : 'TBA';

    // Use provided event_url or generate default
    const finalEventUrl = targetEvent
      ? `${DEFAULT_APP_URL}/event/${targetEvent.lock_address}`
      : event_url || `${DEFAULT_APP_URL}/event/${event.lock_address}`;

    const emailContent = getWaitlistSpotOpenEmail(eventTitle, eventDate, finalEventUrl);

    // 7. Send emails with light backoff to avoid rate limits
    const successful: Array<string | number> = [];
    const failed: Array<{ id: string | number; reason: string }> = [];

    for (const member of waitlistMembers) {
      try {
        const result = await sendEmail({
          to: member.user_email,
          ...emailContent,
          tags: ['waitlist-notification', 'spots-available'],
        });

        if (!result.ok) {
          throw new Error(result.error || 'Email send failed');
        }

        successful.push(member.id);
      } catch (err: any) {
        failed.push({ id: member.id, reason: err?.message || String(err) });
      }

      if (SEND_DELAY_MS > 0) {
        await sleep(SEND_DELAY_MS);
      }
    }

    // Log failures
    if (failed.length > 0) {
      console.error(
        '[NOTIFY-WAITLIST] Failed to send emails:',
        failed.map((f: any) => f.reason || f)
      );
    }

    // 8. Update notified flags for successful sends
    if (successful.length > 0) {
      const { error: updateError } = await supabase
        .from('event_waitlist')
        .update({
          notified: true,
          notified_at: new Date().toISOString(),
        })
        .in('id', successful);

      if (updateError) {
        console.error('[NOTIFY-WAITLIST] Failed to update notified flags:', updateError);
        // Don't fail the request - emails were sent successfully
      }
    }

    console.log(`[NOTIFY-WAITLIST] Notified: ${successful.length}, Failed: ${failed.length}`);

    const { count: remainingCount, error: remainingError } = await supabase
      .from('event_waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event_id)
      .eq('notified', false);

    if (remainingError) {
      console.error('[NOTIFY-WAITLIST] Remaining count error:', remainingError);
    }

    const remaining = typeof remainingCount === 'number'
      ? remainingCount
      : Math.max(0, (totalCount || 0) - offset);
    const hasMore = remaining > 0;

    return new Response(
      JSON.stringify({
        ok: true,
        notified: successful.length,
        failed: failed.length,
        total_processed: waitlistMembers.length,
        total_pending: totalCount || 0,
        page: pageNumber,
        next_page: hasMore ? 1 : null,
        has_more: hasMore,
        remaining,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    return handleError(error, privyUserId, { 'Content-Type': 'application/json' });
  }
});
