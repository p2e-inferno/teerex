/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const encoder = new TextEncoder();
function sseEvent(id: number, event: string | undefined, data: any) {
  const head = `id: ${id}\n` + (event ? `event: ${event}\n` : "");
  return encoder.encode(head + `data: ${JSON.stringify(data)}\n\n`);
}
function sseComment(comment: string) {
  return encoder.encode(`: ${comment}\n\n`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*,authorization,content-type',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
      },
    });
  }

  const url = new URL(req.url);
  const eventId = url.searchParams.get('eventId');
  const recipient = url.searchParams.get('recipient');
  const schemaUid = url.searchParams.get('schemaUid');
  const timeoutMs = Number(url.searchParams.get('timeoutMs') ?? 90000);
  if (!eventId || !recipient || !schemaUid) {
    return new Response(JSON.stringify({ error: 'Missing eventId, recipient or schemaUid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let id = 0;
  const start = Date.now();

  const stream = new ReadableStream({
    start: async (controller) => {
      controller.enqueue(encoder.encode('retry: 2000\n\n'));
      controller.enqueue(sseComment('connected'));
      const hb = setInterval(() => controller.enqueue(sseComment('keep-alive')), 15000);
      try {
        controller.enqueue(sseEvent(++id, 'status', { state: 'waiting' }));
        while (Date.now() - start < timeoutMs) {
          const { data, error } = await supabase
            .from('attestations')
            .select('attestation_uid, created_at')
            .eq('event_id', eventId)
            .eq('recipient', recipient)
            .eq('schema_uid', schemaUid)
            .eq('is_revoked', false)
            .order('created_at', { ascending: false })
            .limit(1);
          if (error) {
            controller.enqueue(sseEvent(++id, 'error', { message: error.message }));
          } else if (data && data.length > 0) {
            controller.enqueue(sseEvent(++id, 'found', { uid: data[0].attestation_uid, createdAt: data[0].created_at }));
            controller.enqueue(sseEvent(++id, 'end', { reason: 'complete' }));
            break;
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (e) {
        controller.enqueue(sseEvent(++id, 'error', { message: (e as Error).message }));
      } finally {
        clearInterval(hb);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

