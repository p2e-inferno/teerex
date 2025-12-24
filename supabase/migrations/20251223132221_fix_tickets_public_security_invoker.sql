-- Fix tickets_public view to use security_invoker mode
-- This ensures the view uses the CALLING USER's permissions instead of the view owner's permissions
-- Resolves Supabase Advisor security issue: "Security Definer View"

-- Issue: Even without explicit SECURITY DEFINER, views created by the service role
-- can bypass RLS on the underlying table because they execute with the view owner's permissions.
-- Solution: Use security_invoker = on (PostgreSQL 15+) to enforce RLS based on the querying user.

-- Drop the existing view
DROP VIEW IF EXISTS public.tickets_public;

-- Recreate with security_invoker = on
CREATE VIEW public.tickets_public
WITH (security_invoker = on) AS
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
  -- Deliberately exclude user_email for privacy
FROM public.tickets;

-- Grant read access to authenticated and anonymous users
-- Note: Actual data access is now controlled by RLS policies on the tickets table
GRANT SELECT ON public.tickets_public TO anon, authenticated;

-- Add comment for documentation
COMMENT ON VIEW public.tickets_public IS 'Public view of tickets table excluding sensitive user_email field. Uses security_invoker mode to enforce RLS policies based on the querying user.';
