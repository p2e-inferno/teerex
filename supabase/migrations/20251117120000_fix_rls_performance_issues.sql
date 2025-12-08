-- ============================================================================
-- Fix RLS Performance Issues
-- Created: 2025-11-17
-- Purpose: Fix auth_rls_initplan and multiple_permissive_policies warnings
--
-- Issue 1: Auth RLS Initialization Plan
--   Problem: current_setting() and auth.uid() are re-evaluated for each row
--   Solution: Wrap auth functions with (SELECT ...) to evaluate once per query
--
-- Issue 2: Multiple Permissive Policies
--   Problem: Multiple policies for same role/action cause redundant checks
--   Solution: Consolidate into single policies with OR conditions
-- ============================================================================

-- ============================================================================
-- SECTION 1: Fix auth_rls_initplan issues
-- Wrap auth function calls with SELECT to prevent per-row re-evaluation
-- ============================================================================

-- Fix: attestations table
DROP POLICY IF EXISTS "Attesters can update their own attestations" ON public.attestations;
CREATE POLICY "Attesters can update their own attestations"
  ON public.attestations
  FOR UPDATE
  USING (attester = (SELECT current_setting('request.jwt.claims', true)::json->>'sub'));

-- Fix: attestation_challenges table
DROP POLICY IF EXISTS "Challengers can update their challenges" ON public.attestation_challenges;
CREATE POLICY "Challengers can update their challenges"
  ON public.attestation_challenges
  FOR UPDATE
  USING (challenger_address = (SELECT current_setting('request.jwt.claims', true)::json->>'sub'));

-- Fix: events table - Update policy
DROP POLICY IF EXISTS "Creators can update their own events" ON public.events;
CREATE POLICY "Creators can update their own events"
  ON public.events
  FOR UPDATE
  USING (creator_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub'));

-- Fix: events table - Delete policy
DROP POLICY IF EXISTS "Creators can delete their own events" ON public.events;
CREATE POLICY "Creators can delete their own events"
  ON public.events
  FOR DELETE
  USING (creator_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub'));

-- Fix: user_reputation table
-- Users should NOT be able to mutate their own reputation directly.
-- Restrict INSERT/UPDATE to the service_role (edge functions).
DROP POLICY IF EXISTS "Users can update their own reputation" ON public.user_reputation;
DROP POLICY IF EXISTS "System can insert reputation records" ON public.user_reputation;

CREATE POLICY "Service role inserts reputation records"
  ON public.user_reputation
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role updates reputation records"
  ON public.user_reputation
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix: gasless_attestation_log table
DROP POLICY IF EXISTS "Users can read their own attestation logs" ON public.gasless_attestation_log;
CREATE POLICY "Users can read their own attestation logs"
  ON public.gasless_attestation_log
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub'));

-- Fix: post_comments table - Service role update
DROP POLICY IF EXISTS "Service role can update comments" ON public.post_comments;
CREATE POLICY "Service role can update comments"
  ON public.post_comments
  FOR UPDATE
  USING ((SELECT auth.jwt()->>'role') = 'service_role');

-- Fix: post_reactions table - Delete policy
DROP POLICY IF EXISTS "Users can delete own reactions" ON public.post_reactions;
CREATE POLICY "Users can delete own reactions"
  ON public.post_reactions
  FOR DELETE
  USING (user_address = (SELECT current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- Fix: post_comments table - Delete policy
DROP POLICY IF EXISTS "Users can delete own comments" ON public.post_comments;
CREATE POLICY "Users can delete own comments"
  ON public.post_comments
  FOR DELETE
  USING (user_address = (SELECT current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- Fix: comment_likes table - Delete policy
DROP POLICY IF EXISTS "Users can delete own likes" ON public.comment_likes;
CREATE POLICY "Users can delete own likes"
  ON public.comment_likes
  FOR DELETE
  USING (user_address = (SELECT current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- Fix: event_posts table - Service role insert
DROP POLICY IF EXISTS "Service role can insert posts" ON public.event_posts;
CREATE POLICY "Service role can insert posts"
  ON public.event_posts
  FOR INSERT
  WITH CHECK ((SELECT auth.jwt()->>'role') = 'service_role');

-- Fix: event_posts table - Service role update
DROP POLICY IF EXISTS "Service role can update posts" ON public.event_posts;
CREATE POLICY "Service role can update posts"
  ON public.event_posts
  FOR UPDATE
  USING ((SELECT auth.jwt()->>'role') = 'service_role');

-- Fix: post_reactions table - Service role insert
DROP POLICY IF EXISTS "Service role can insert reactions" ON public.post_reactions;
CREATE POLICY "Service role can insert reactions"
  ON public.post_reactions
  FOR INSERT
  WITH CHECK ((SELECT auth.jwt()->>'role') = 'service_role');

-- Fix: post_comments table - Service role insert
DROP POLICY IF EXISTS "Service role can insert comments" ON public.post_comments;
CREATE POLICY "Service role can insert comments"
  ON public.post_comments
  FOR INSERT
  WITH CHECK ((SELECT auth.jwt()->>'role') = 'service_role');

-- Fix: comment_likes table - Service role insert
DROP POLICY IF EXISTS "Service role can insert likes" ON public.comment_likes;
CREATE POLICY "Service role can insert likes"
  ON public.comment_likes
  FOR INSERT
  WITH CHECK ((SELECT auth.jwt()->>'role') = 'service_role');

-- ============================================================================
-- SECTION 2: Consolidate multiple permissive policies
-- Merge multiple policies for same role/action into single policies
-- ============================================================================

-- Fix: event_waitlist table - Consolidate SELECT policies
DROP POLICY IF EXISTS "Event creators can view waitlist entries" ON public.event_waitlist;
DROP POLICY IF EXISTS "Event creators can manage waitlist" ON public.event_waitlist;
-- Create single unified policy for event creators
CREATE POLICY "Event creators can manage waitlist entries"
  ON public.event_waitlist
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_waitlist.event_id
      AND events.creator_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub')
    )
  );

-- Keep the public insert policy separate (different permission level)
-- "Anyone can join waitlist" - unchanged, allows public signups

-- Fix: event_allow_list table - Consolidate policies
DROP POLICY IF EXISTS "Anyone can view allow list" ON public.event_allow_list;
DROP POLICY IF EXISTS "Event creators can manage allow list" ON public.event_allow_list;
-- Single policy for public read
CREATE POLICY "Public can view allow list"
  ON public.event_allow_list
  FOR SELECT
  USING (true);
-- Single policy for creator management
CREATE POLICY "Event creators manage allow list"
  ON public.event_allow_list
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_allow_list.event_id
      AND events.creator_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub')
    )
  );

-- Fix: network_configs table - Consolidate overlapping SELECT policies
-- The "System can manage network configs" policy uses FOR ALL which includes SELECT
-- This creates duplicate SELECT policies with the public read policy
-- Solution: Keep the FOR ALL policy for system, make the public policy more specific
DROP POLICY IF EXISTS "Anyone can view network configs" ON public.network_configs;
DROP POLICY IF EXISTS "System can manage network configs" ON public.network_configs;

-- Recreate with non-overlapping permissions
CREATE POLICY "Public can read network configs"
  ON public.network_configs
  FOR SELECT
  USING (true);

CREATE POLICY "Service role manages network configs"
  ON public.network_configs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role updates network configs"
  ON public.network_configs
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role deletes network configs"
  ON public.network_configs
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON POLICY "Attesters can update their own attestations" ON public.attestations
  IS 'Optimized: uses (SELECT ...) to prevent per-row re-evaluation';

COMMENT ON POLICY "Event creators can manage waitlist entries" ON public.event_waitlist
  IS 'Consolidated policy: combines view and manage permissions for creators';

COMMENT ON POLICY "Event creators manage allow list" ON public.event_allow_list
  IS 'Consolidated policy: combines all creator permissions for allow list';
