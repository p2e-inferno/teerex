import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import { stripHtml, truncateText } from '../_shared/html-utils.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../_shared/constants.ts';

const isAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) });
  }

  try {
    const id = (new URL(req.url).searchParams.get('id') || '').trim();
    if (!id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing event id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const query = supabase
      .from('events')
      .select('id, lock_address, title, description, image_url, location, starts_at, date');
    // Lock-address URLs can arrive checksummed (e.g. copied from an explorer or an NFT
    // external_url), so match case-insensitively like getPublishedEventByLockAddress.
    const { data: event, error } = await (isAddress(id)
      ? query.ilike('lock_address', id.toLowerCase())
      : query.eq('id', id)
    ).maybeSingle();

    if (error || !event) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const description = truncateText(stripHtml(event.description || ''), 200);

    return new Response(
      JSON.stringify({
        ok: true,
        event: {
          id: event.id,
          title: event.title || 'TeeRex Event',
          description: description || 'Join this event on TeeRex.',
          image_url: event.image_url || null,
          location: event.location || null,
          starts_at: event.starts_at || event.date || null,
        },
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      },
    );
  } catch (err) {
    console.error('[get-public-event-og]', err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
