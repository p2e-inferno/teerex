import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * Typed error thrown by callEdgeFunction for both HTTP-level failures
 * and application-level { ok: false } responses.
 */
export class EdgeFunctionError extends Error {
  constructor(
    message: string,
    public readonly functionName: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'EdgeFunctionError';
  }
}

interface CallOptions {
  /** Privy JWT — omit only for public/unauthenticated edge functions */
  privyToken?: string | null;
  /** Pass true for call sites that also need Authorization: Bearer <anonKey> */
  withAnonKey?: boolean;
  /** Any extra headers beyond the standard auth ones */
  extraHeaders?: Record<string, string>;
  /** HTTP method override for REST-style edge functions (GET, POST, PUT, DELETE) */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
}

/**
 * Centralized wrapper around supabase.functions.invoke.
 *
 * Handles both error shapes seen in this codebase:
 *   - HTTP 4xx/5xx  → FunctionsHttpError (parses body for `error` field)
 *   - HTTP 200 with { ok: false, error: string } → application-level failure
 *
 * Throws EdgeFunctionError with a user-readable message in both cases.
 * Callers just catch and show the message — no per-call extraction logic needed.
 */
export async function callEdgeFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
  options: CallOptions,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.privyToken ? { 'X-Privy-Authorization': `Bearer ${options.privyToken}` } : {}),
    ...options.extraHeaders,
  };

  if (options.withAnonKey) {
    headers['Authorization'] = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`;
  }

  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    ...(options.method !== 'GET' ? { body } : {}),
    headers,
    method: options.method,
  });

  if (error) {
    let message = 'Something went wrong. Please try again.';
    let status: number | undefined;

    if (error instanceof FunctionsHttpError) {
      status = error.context.status;
      try {
        const body = await error.context.json();
        message = body?.error || body?.message || message;
      } catch {
        // body not JSON — fall through to generic message
      }
    } else {
      // FunctionsFetchError (network) or FunctionsRelayError
      message = 'Network error. Please check your connection and try again.';
    }

    throw new EdgeFunctionError(message, functionName, status);
  }

  // HTTP 200 but application reported failure via { ok: false, error: string }
  const d = data as Record<string, unknown> | null;
  if (d && d.ok === false) {
    const message = typeof d.error === 'string' && d.error
      ? d.error
      : 'Something went wrong. Please try again.';
    throw new EdgeFunctionError(message, functionName);
  }

  return data as T;
}
