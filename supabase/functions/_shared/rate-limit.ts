/* deno-lint-ignore-file no-explicit-any */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

export type RateLimitActivity = 'lock_deploy' | 'ticket_purchase';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Checks if user has exceeded their daily rate limit for the given activity
 * Returns { allowed: true, remaining: N } if under limit
 * Returns { allowed: false, remaining: 0 } if limit exceeded
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  activity: RateLimitActivity,
  dailyLimit: number
): Promise<RateLimitResult> {
  const { data: limitCheck } = await supabase
    .rpc('check_gasless_limit', {
      p_user_id: userId,
      p_activity: activity,
      p_daily_limit: dailyLimit,
    })
    .single();

  return {
    allowed: limitCheck?.allowed ?? false,
    remaining: limitCheck?.remaining ?? 0,
  };
}

/**
 * Logs activity to gasless_activity_log table
 */
export async function logActivity(
  supabase: SupabaseClient,
  userId: string,
  activity: RateLimitActivity,
  chainId: number,
  eventId: string | null,
  metadata?: Record<string, any>
): Promise<void> {
  await supabase.from('gasless_activity_log').insert({
    user_id: userId,
    activity,
    event_id: eventId,
    chain_id: chainId,
    metadata: metadata || null,
  });
}
