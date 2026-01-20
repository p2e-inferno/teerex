-- Migration: Fix permissive RLS policies for security
-- Date: 2026-01-17
--
-- IMPORTANT: All write operations now go through Edge Functions with service_role,
-- which bypasses RLS. These policies serve as defense-in-depth to block any
-- accidental direct client writes.
--
-- Performance Note: All current_setting() calls are wrapped with (SELECT ...)
-- to ensure they're evaluated once per query, not once per row.

-- ============================================================================
-- 1. Fix public.event_drafts policies
-- ============================================================================
-- Rationale: Restrict all operations to the owner of the draft (user_id = Privy DID).
-- Writes go through manage-drafts edge function, but these policies block direct access.

CREATE INDEX IF NOT EXISTS idx_event_drafts_user_id ON public.event_drafts(user_id);

-- Fix SELECT policy (previously was permissive USING(true))
DROP POLICY IF EXISTS "Users can view their own drafts" ON public.event_drafts;
CREATE POLICY "Users can view their own drafts" ON public.event_drafts
FOR SELECT USING (
  user_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub')
);

DROP POLICY IF EXISTS "Users can create their own drafts" ON public.event_drafts;
CREATE POLICY "Users can create their own drafts" ON public.event_drafts
FOR INSERT WITH CHECK (
  user_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub')
);

DROP POLICY IF EXISTS "Users can update their own drafts" ON public.event_drafts;
CREATE POLICY "Users can update their own drafts" ON public.event_drafts
FOR UPDATE USING (
  user_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub')
);

DROP POLICY IF EXISTS "Users can delete their own drafts" ON public.event_drafts;
CREATE POLICY "Users can delete their own drafts" ON public.event_drafts
FOR DELETE USING (
  user_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub')
);


-- ============================================================================
-- 2. Fix public.events policies
-- ============================================================================
-- Rationale: Restrict INSERT to the creator. Writes go through create-event edge function.

CREATE INDEX IF NOT EXISTS idx_events_creator_id ON public.events(creator_id);

DROP POLICY IF EXISTS "Creators can publish their own events" ON public.events;
CREATE POLICY "Creators can publish their own events" ON public.events
FOR INSERT WITH CHECK (
  creator_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub')
);


-- ============================================================================
-- 3. Fix public.attestation_schemas policies
-- ============================================================================
-- Rationale: Schema creation should be restricted. Using service_role for writes.

DROP POLICY IF EXISTS "Anyone can create attestation schemas" ON public.attestation_schemas;
DROP POLICY IF EXISTS "Authenticated users can create attestation schemas" ON public.attestation_schemas;
-- No new INSERT policy - service_role handles schema creation


-- ============================================================================
-- 4. Fix public.attestations policies
-- ============================================================================
-- Rationale: Writes go through manage-attestations edge function with service_role.
-- The old policy comparing 'attester' (wallet address) to jwt.sub (Privy DID) was
-- semantically incorrect. Removing it since service_role bypasses RLS anyway.

DROP POLICY IF EXISTS "Anyone can create attestations" ON public.attestations;
DROP POLICY IF EXISTS "Attesters can create their own attestations" ON public.attestations;
-- No new INSERT policy - service_role handles attestation creation


-- ============================================================================
-- 5. Fix public.attestation_challenges policies
-- ============================================================================
-- Rationale: challenger_address is a wallet address, not a Privy DID.
-- Writes should go through edge functions with service_role.

CREATE INDEX IF NOT EXISTS idx_attestation_challenges_challenger ON public.attestation_challenges(challenger_address);

DROP POLICY IF EXISTS "Authenticated users can create challenges" ON public.attestation_challenges;
DROP POLICY IF EXISTS "Users can create their own challenges" ON public.attestation_challenges;
-- No new INSERT policy - service_role handles challenge creation


-- ============================================================================
-- 6. Fix public.attestation_votes policies
-- ============================================================================
-- Rationale: voter_address is a wallet address, not a Privy DID.
-- Writes should go through edge functions with service_role.

DROP POLICY IF EXISTS "Authenticated users can vote" ON public.attestation_votes;
DROP POLICY IF EXISTS "Users can vote as themselves" ON public.attestation_votes;
-- No new INSERT policy - service_role handles vote creation


-- ============================================================================
-- 7. Fix public.event_waitlist policies
-- ============================================================================
-- Rationale: Writes go through join-waitlist edge function with service_role.
-- Dropping permissive policy to prevent direct client writes.

DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.event_waitlist;
DROP POLICY IF EXISTS "Anyone can join waitlist (secure)" ON public.event_waitlist;
-- No new INSERT policy - service_role handles waitlist joins


-- ============================================================================
-- 8. Fix public.event_allow_list_requests policies
-- ============================================================================
-- Rationale: Writes go through request-allow-list edge function with service_role.
-- Dropping permissive policy to prevent direct client writes.

DROP POLICY IF EXISTS "Anyone can request allow list" ON public.event_allow_list_requests;
DROP POLICY IF EXISTS "Anyone can request allow list (secure)" ON public.event_allow_list_requests;
-- No new INSERT policy - service_role handles allow list requests


-- ============================================================================
-- 9. Fix public.tickets policies
-- ============================================================================
-- Rationale: Strictly limit INSERT/UPDATE to service_role (System).
-- Dropping the permissive policies; service_role bypasses RLS.

DROP POLICY IF EXISTS "System can insert tickets" ON public.tickets;
DROP POLICY IF EXISTS "System can update tickets" ON public.tickets;


-- ============================================================================
-- 10. Fix public.gas_transactions policies
-- ============================================================================
-- Rationale: System-only table. Service_role handles all operations.

DROP POLICY IF EXISTS "System can manage gas transactions" ON public.gas_transactions;


-- ============================================================================
-- 11. Fix public.gasless_activity_log policies
-- ============================================================================
-- Rationale: System-only table. Service_role handles all operations.

DROP POLICY IF EXISTS "System can manage gasless activity log" ON public.gasless_activity_log;


-- ============================================================================
-- 12. Fix public.key_grant_attempts policies
-- ============================================================================
-- Rationale: System-only table. Service_role handles all operations.

DROP POLICY IF EXISTS "System can manage key grant attempts" ON public.key_grant_attempts;
