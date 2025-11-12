/* deno-lint-ignore-file no-explicit-any */
import { corsHeaders } from './cors.ts';

export function handleError(e: any, privyUserId?: string, additionalHeaders: HeadersInit = {}) {
  const errorMsg = e?.message || 'Internal error';
  const status = errorMsg.includes('unauthorized') ? 401 : 200;
  console.error(`Gasless error [user: ${privyUserId || 'unknown'}]:`, e);
  return new Response(
    JSON.stringify({ ok: false, error: errorMsg }),
    {
      status,
      headers: { ...corsHeaders, ...additionalHeaders, 'Content-Type': 'application/json' },
    }
  );
}
