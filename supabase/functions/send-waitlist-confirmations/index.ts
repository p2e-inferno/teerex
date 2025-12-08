/**
 * Batch send confirmation emails to waitlist members
 *
 * This function:
 * 1. Queries event_waitlist for rows with confirmation_sent = false
 * 2. Sends confirmation emails in batches (max 50 per invocation)
 * 3. Updates confirmation_sent = true for successful sends
 * 4. Returns counts of sent/failed emails
 *
 * Can be triggered:
 * - Manually via API call
 * - Via Supabase cron (scheduled)
 * - After new waitlist signups
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import { sendEmail, getWaitlistConfirmationEmail } from '../_shared/email-utils.ts';
import { formatEventDate } from '../_shared/date-utils.ts';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../_shared/constants.ts';

const BATCH_SIZE = 50;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse optional event_id filter from request body
    const body = await req.json().catch(() => ({}));
    const { event_id } = body;

    // Query waitlist entries that haven't received confirmation
    let query = supabase
      .from('event_waitlist')
      .select('id, event_id, user_email, events:events(title, date)')
      .eq('confirmation_sent', false)
      .limit(BATCH_SIZE);

    if (event_id) {
      query = query.eq('event_id', event_id);
    }

    const { data: waitlistEntries, error: queryError } = await query;

    if (queryError) {
      console.error('[WAITLIST-CONFIRM] Query error:', queryError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to query waitlist' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (!waitlistEntries || waitlistEntries.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, failed: 0, message: 'No pending confirmations' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`[WAITLIST-CONFIRM] Processing ${waitlistEntries.length} confirmation emails`);

    // Send emails and track results
    const results = await Promise.allSettled(
      waitlistEntries.map(async (entry: any) => {
        const event = entry.events;
        if (!event?.title) {
          throw new Error(`Event not found for waitlist entry ${entry.id}`);
        }

        const eventTitle = event.title;
        const eventDate = event.date ? formatEventDate(event.date) : 'TBA';
        const emailContent = getWaitlistConfirmationEmail(eventTitle, eventDate);

        const result = await sendEmail({
          to: entry.user_email,
          ...emailContent,
          tags: ['waitlist-confirmation'],
        });

        if (!result.ok) {
          throw new Error(result.error || 'Email send failed');
        }

        return { id: entry.id, email: entry.user_email };
      })
    );

    // Separate successful and failed sends
    const successful = results
      .filter((r) => r.status === 'fulfilled')
      .map((r: any) => r.value.id);

    const failed = results.filter((r) => r.status === 'rejected');

    // Log failures
    if (failed.length > 0) {
      console.error(
        '[WAITLIST-CONFIRM] Failed to send emails:',
        failed.map((f: any) => f.reason?.message || f.reason)
      );
    }

    // Update confirmation_sent flag for successful sends
    if (successful.length > 0) {
      const { error: updateError } = await supabase
        .from('event_waitlist')
        .update({ confirmation_sent: true })
        .in('id', successful);

      if (updateError) {
        console.error('[WAITLIST-CONFIRM] Failed to update confirmation flags:', updateError);
        // Don't fail the request - emails were sent successfully
      }
    }

    console.log(`[WAITLIST-CONFIRM] Sent: ${successful.length}, Failed: ${failed.length}`);

    return new Response(
      JSON.stringify({
        ok: true,
        sent: successful.length,
        failed: failed.length,
        total_processed: waitlistEntries.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('[WAITLIST-CONFIRM] Error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error?.message || 'Internal error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
