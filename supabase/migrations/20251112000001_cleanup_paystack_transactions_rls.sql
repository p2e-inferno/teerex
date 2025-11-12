-- ============================================================================
-- Cleanup: Paystack Transactions RLS Policy
-- Created: 2025-11-12
-- Purpose: Replace unused email-based RLS policy with service-role policy for clarity
-- ============================================================================

-- CONTEXT: The paystack_transactions table is ONLY accessed via edge functions
-- using the service-role key, which bypasses RLS entirely. The existing
-- "Users can view their own transactions" policy is never enforced.

-- ISSUE WITH EXISTING POLICY:
-- - Uses email matching from JWT claims: user_email = current_setting('request.jwt.claims')::json->>'email'
-- - This would be broken if used since Privy JWTs don't include email in standard claims
-- - However, since all access uses service-role key, this policy is never actually enforced

-- EDGE FUNCTIONS THAT ACCESS THIS TABLE (all use service-role):
-- - paystack-grant-keys: SELECT with service-role
-- - get-transaction-status: SELECT with service-role
-- - init-paystack-transaction: INSERT with service-role
-- - paystack-webhook: UPDATE with service-role

-- SOLUTION: Replace with explicit service-role policies that document
-- the actual access pattern. This is cosmetic cleanup with no functional impact.

-- Drop the unused email-based SELECT policy
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.paystack_transactions;

-- Create explicit service-role policies for documentation clarity
-- (Note: These policies don't change behavior since service-role already bypasses RLS,
-- but they document the intended access pattern)

CREATE POLICY "Service role can view transactions"
  ON public.paystack_transactions
  FOR SELECT
  TO service_role
  USING (true);

-- Update existing system policies to be explicit about service_role
DROP POLICY IF EXISTS "System can insert transactions" ON public.paystack_transactions;
DROP POLICY IF EXISTS "System can update transactions" ON public.paystack_transactions;

CREATE POLICY "Service role can insert transactions"
  ON public.paystack_transactions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update transactions"
  ON public.paystack_transactions
  FOR UPDATE
  TO service_role
  USING (true);

-- ============================================================================
-- BREAKING CHANGES: None
-- - All edge functions already use service-role key which bypasses RLS
-- - This migration only improves policy clarity and documentation
-- - No client-side code directly queries this table
-- ============================================================================

-- ============================================================================
-- SECURITY NOTES:
-- - Paystack transactions contain sensitive payment data (user_email, amount, reference)
-- - Edge functions validate authorization before accessing transactions
-- - This architecture is secure because:
--   1. Clients cannot directly query this table (all access via edge functions)
--   2. Edge functions validate Privy JWT before operations
--   3. Service-role access is restricted to trusted edge function environment
-- ============================================================================
