-- Add visibility and waitlist features to events
-- Phase 1: Database Schema for Allow List and Waitlist

-- Add columns to events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_waitlist BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_allow_list BOOLEAN DEFAULT false;

-- Add columns to event_drafts table
ALTER TABLE public.event_drafts
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_waitlist BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_allow_list BOOLEAN DEFAULT false;

-- Create waitlist table
CREATE TABLE IF NOT EXISTS public.event_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  wallet_address TEXT, -- Optional, if user is logged in
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ,
  UNIQUE(event_id, user_email) -- Prevent duplicate signups
);

-- Create allow list table
CREATE TABLE IF NOT EXISTS public.event_allow_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  added_by TEXT, -- Creator/admin who added this address
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, wallet_address) -- One entry per wallet per event
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_waitlist_event_id
  ON public.event_waitlist(event_id) WHERE notified = false;

CREATE INDEX IF NOT EXISTS idx_event_waitlist_email
  ON public.event_waitlist(user_email);

CREATE INDEX IF NOT EXISTS idx_event_allow_list_event_id
  ON public.event_allow_list(event_id);

CREATE INDEX IF NOT EXISTS idx_event_allow_list_wallet
  ON public.event_allow_list(wallet_address);

-- Enable Row Level Security
ALTER TABLE public.event_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_allow_list ENABLE ROW LEVEL SECURITY;

-- RLS Policies for event_waitlist
-- Only event creators can view waitlist entries (protects email privacy)
CREATE POLICY "Event creators can view waitlist entries"
  ON public.event_waitlist
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_waitlist.event_id
      AND events.creator_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

-- Anyone can join waitlist (insert) - duplicate prevention handled by UNIQUE constraint
CREATE POLICY "Anyone can join waitlist"
  ON public.event_waitlist
  FOR INSERT
  WITH CHECK (true);

-- Only event creators can update/delete waitlist entries
CREATE POLICY "Event creators can manage waitlist"
  ON public.event_waitlist
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_waitlist.event_id
      AND events.creator_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

-- RLS Policies for event_allow_list
-- Anyone can view allow list (needed for purchase verification)
CREATE POLICY "Anyone can view allow list"
  ON public.event_allow_list
  FOR SELECT
  USING (true);

-- Only event creators can manage allow list
CREATE POLICY "Event creators can manage allow list"
  ON public.event_allow_list
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_allow_list.event_id
      AND events.creator_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

-- Comments
COMMENT ON COLUMN public.events.is_public IS 'Whether the event is publicly visible and anyone can attend';
COMMENT ON COLUMN public.events.allow_waitlist IS 'Whether users can join a waitlist when the event is sold out';
COMMENT ON COLUMN public.events.has_allow_list IS 'Whether the event has an allow list (private event with restricted access)';

COMMENT ON TABLE public.event_waitlist IS 'Users waiting for tickets when an event is sold out';
COMMENT ON TABLE public.event_allow_list IS 'Wallet addresses authorized to purchase tickets for private events';
