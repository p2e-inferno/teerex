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
  const eventId = url.searchParams.get("eventId");
  const timeoutMs = Number(url.searchParams.get("timeoutMs") ?? 120000);
  if (!eventId) {
    return new Response(JSON.stringify({ error: "Missing eventId" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const lastIdHeader = req.headers.get('last-event-id');
  let idCounter = lastIdHeader ? Number(lastIdHeader) || 0 : 0;
  let lastStatsKey = "";
  let lastExecutedAt = "1970-01-01T00:00:00.000Z";
  const startTime = Date.now();

  const stream = new ReadableStream({
    start: async (controller) => {
      controller.enqueue(encoder.encode("retry: 2000\n\n"));
      controller.enqueue(sseComment("connected"));
      const hb = setInterval(() => controller.enqueue(sseComment("keep-alive")), 15000);
      try {
        while (Date.now() - startTime < timeoutMs) {
          // stats
          const { data: statData, error: statErr } = await supabase
            .from('attestation_delegations')
            .select('executed, executed_at')
            .eq('event_id', eventId);
          if (statErr) {
            controller.enqueue(sseEvent(++idCounter, 'error', { message: statErr.message }));
          } else if (statData) {
            const pending = statData.filter((r: any) => !r.executed).length;
            const executed = statData.length - pending;
            const latestExec = statData
              .filter((r: any) => r.executed && r.executed_at)
              .map((r: any) => r.executed_at)
              .sort()
              .slice(-1)[0] || lastExecutedAt;
            const stats = { pending, executed, latestExecutedAt: latestExec };
            const key = JSON.stringify(stats);
            if (key !== lastStatsKey) {
              lastStatsKey = key;
              controller.enqueue(sseEvent(++idCounter, 'stats', stats));
            }

            // executed slice since last timestamp
            const { data: execRows } = await supabase
              .from('attestation_delegations')
              .select('id, recipient, schema_uid, executed_at, executed_tx_hash')
              .eq('event_id', eventId)
              .eq('executed', true)
              .gt('executed_at', lastExecutedAt)
              .order('executed_at', { ascending: true })
              .limit(50);
            if (execRows && execRows.length > 0) {
              controller.enqueue(sseEvent(++idCounter, 'executed', execRows));
              lastExecutedAt = execRows[execRows.length - 1].executed_at;
            }
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        controller.enqueue(sseEvent(++idCounter, 'end', { reason: 'timeout' }));
      } catch (e) {
        controller.enqueue(sseEvent(++idCounter, 'error', { message: (e as Error).message }));
      } finally {
        clearInterval(hb);
        controller.close();
      }
    },
    cancel: () => {},
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
