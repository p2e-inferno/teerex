/* deno-lint-ignore-file no-explicit-any */
import { corsHeaders } from './cors.ts';

export function handleError(
  e: any,
  privyUserId?: string,
  additionalHeaders: HeadersInit = {},
  statusOverride?: number,
) {
  const errorMsg = e?.message || 'Internal error';
  const inferredStatus =
    typeof statusOverride === 'number' ? statusOverride
      : typeof e?.status === 'number' ? e.status
      : typeof e?.statusCode === 'number' ? e.statusCode
      : errorMsg.includes('unauthorized') ? 401
      : errorMsg.toLowerCase().includes('invalid') || errorMsg.toLowerCase().includes('required') ? 400
      : 500;

  console.error(`Gasless error [user: ${privyUserId || 'unknown'}]:`, e);
  return new Response(
    JSON.stringify({ ok: false, error: errorMsg }),
    {
      status: inferredStatus,
      headers: { ...corsHeaders, ...additionalHeaders, 'Content-Type': 'application/json' },
    }
  );
}
