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
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*,authorization,content-type",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
      },
    });
  }

  const url = new URL(req.url);
  const reference = url.searchParams.get('reference');
  const timeoutMs = Number(url.searchParams.get('timeoutMs') ?? 120000);
  if (!reference) {
    return new Response(JSON.stringify({ error: 'Missing reference' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const lastIdHeader = req.headers.get('last-event-id');
  let idCounter = lastIdHeader ? Number(lastIdHeader) || 0 : 0;
  let lastPayload = '';
  const start = Date.now();

  const stream = new ReadableStream({
    start: async (controller) => {
      controller.enqueue(encoder.encode('retry: 2000\n\n'));
      controller.enqueue(sseComment('connected'));
      const hb = setInterval(() => controller.enqueue(sseComment('keep-alive')), 15000);
      try {
        while (Date.now() - start < timeoutMs) {
          const { data, error } = await supabase
            .from('paystack_transactions')
            .select('reference, status, gateway_response, verified_at, updated_at')
            .eq('reference', reference)
            .maybeSingle();
          if (error) {
            controller.enqueue(sseEvent(++idCounter, 'error', { message: error.message }));
          } else if (data) {
            const payload = {
              reference: data.reference,
              status: data.status,
              keyGranted: Boolean((data as any)?.gateway_response?.key_granted),
              updatedAt: data.updated_at,
              verifiedAt: data.verified_at,
            };
            const key = JSON.stringify(payload);
            if (key !== lastPayload) {
              lastPayload = key;
              controller.enqueue(sseEvent(++idCounter, 'status', payload));
              if (payload.status === 'success' && payload.keyGranted) {
                controller.enqueue(sseEvent(++idCounter, 'end', { reason: 'complete' }));
                break;
              }
            }
          } else {
            controller.enqueue(sseEvent(++idCounter, 'status', { reference, status: 'pending' }));
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (e) {
        controller.enqueue(sseEvent(++idCounter, 'error', { message: (e as Error).message }));
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
