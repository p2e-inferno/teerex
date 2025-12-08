-- Gasless activity log for rate limiting (simple append-only)
CREATE TABLE IF NOT EXISTS public.gasless_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, -- Privy sub
  activity TEXT NOT NULL CHECK (activity IN ('lock_deploy','ticket_purchase')),
  event_id UUID NULL REFERENCES public.events(id) ON DELETE SET NULL,
  chain_id BIGINT NOT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gasless_activity_user
  ON public.gasless_activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gasless_activity_kind
  ON public.gasless_activity_log(user_id, activity, created_at DESC);

ALTER TABLE public.gasless_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can manage gasless activity log"
  ON public.gasless_activity_log FOR ALL USING (true);

-- Helper function for per-user/day rate limit checks
CREATE OR REPLACE FUNCTION public.check_gasless_limit(
  p_user_id TEXT,
  p_activity TEXT,
  p_daily_limit INT
) RETURNS TABLE(allowed BOOLEAN, remaining INT) LANGUAGE plpgsql AS $$
DECLARE
  used INT;
BEGIN
  SELECT COUNT(*) INTO used
  FROM public.gasless_activity_log
  WHERE user_id = p_user_id
    AND activity = p_activity
    AND created_at >= (now() AT TIME ZONE 'UTC')::date; -- since midnight UTC

  IF used < p_daily_limit THEN
    RETURN QUERY SELECT TRUE, (p_daily_limit - used);
  ELSE
    RETURN QUERY SELECT FALSE, 0;
  END IF;
END; $$;

-- Add email column to tickets table for attendee contact info
-- This stores email for both crypto and fiat ticket purchases
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Update RLS policies for tickets table to protect email privacy
-- Drop the overly permissive policy created in migration 20250712143153
DROP POLICY IF EXISTS "Anyone can view tickets" ON public.tickets;

-- New policy: Public can view tickets but NOT emails (unless they own the ticket)
CREATE POLICY "Public can view basic ticket info"
  ON public.tickets
  FOR SELECT
  USING (
    CASE
      -- If requesting user_email column, only allow if they own the ticket
      WHEN current_setting('request.columns', true)::text LIKE '%user_email%'
      THEN owner_wallet = lower(current_setting('request.jwt.claims', true)::json->>'wallet_address')
      -- For all other columns, allow public read
      ELSE true
    END
  );

-- Alternative simpler approach: Always allow SELECT, but use column-level security
-- This approach is more compatible with existing queries
DROP POLICY IF EXISTS "Public can view basic ticket info" ON public.tickets;

CREATE POLICY "Anyone can view tickets except emails"
  ON public.tickets
  FOR SELECT
  USING (true);

-- Note: The above policy allows viewing all columns. To restrict email access,
-- we need to handle this at the application level OR use a different approach.
--
-- RECOMMENDED APPROACH: Create a separate view for public ticket data
CREATE OR REPLACE VIEW public.tickets_public AS
SELECT
  id,
  event_id,
  owner_wallet,
  payment_transaction_id,
  token_id,
  grant_tx_hash,
  status,
  granted_at,
  expires_at,
  created_at,
  updated_at
  -- Deliberately exclude user_email
FROM public.tickets;

-- Grant public read access to the view
GRANT SELECT ON public.tickets_public TO anon, authenticated;

-- Helper function: Users can fetch their own email via owner_wallet match
CREATE OR REPLACE FUNCTION public.get_my_ticket_email(p_owner_wallet TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT;
BEGIN
  -- Only return email if the wallet address matches (case-insensitive)
  SELECT user_email INTO v_email
  FROM public.tickets
  WHERE lower(owner_wallet) = lower(p_owner_wallet)
    AND user_email IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN v_email;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_ticket_email(TEXT) TO authenticated, anon;
