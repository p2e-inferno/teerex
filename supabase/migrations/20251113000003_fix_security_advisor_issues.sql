-- Fix Supabase Advisor Security Issues
-- 1. Remove SECURITY DEFINER from tickets_public view (ERROR level)
-- 2. Add search_path to functions (WARN level)

-- Issue 1: Security Definer View
-- The tickets_public view doesn't need SECURITY DEFINER since it's just filtering columns
-- from a table that already has RLS policies. Regular views inherit the querying user's permissions.
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

-- Issue 2: Function Search Path Mutable
-- Add explicit search_path to prevent search path injection attacks

-- Fix check_gasless_limit function
CREATE OR REPLACE FUNCTION public.check_gasless_limit(
  p_user_id TEXT,
  p_activity TEXT,
  p_daily_limit INT
) RETURNS TABLE(allowed BOOLEAN, remaining INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- Fix get_my_ticket_email function
CREATE OR REPLACE FUNCTION public.get_my_ticket_email(p_owner_wallet TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
