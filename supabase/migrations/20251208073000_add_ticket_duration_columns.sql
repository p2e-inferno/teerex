-- Add ticket duration columns to events table
-- These columns control how long tickets (NFT keys) remain valid after purchase

ALTER TABLE public.events
  ADD COLUMN ticket_duration TEXT DEFAULT 'event' CHECK (ticket_duration IN ('event', 'custom', 'forever')),
  ADD COLUMN custom_duration_days INTEGER;

COMMENT ON COLUMN public.events.ticket_duration IS 'Duration type for ticket validity: event (expires when event ends), custom (expires after N days), or forever (never expires)';
COMMENT ON COLUMN public.events.custom_duration_days IS 'Number of days ticket is valid when ticket_duration is set to custom';

-- Add the same columns to event_drafts table for consistency
ALTER TABLE public.event_drafts
  ADD COLUMN ticket_duration TEXT DEFAULT 'event' CHECK (ticket_duration IN ('event', 'custom', 'forever')),
  ADD COLUMN custom_duration_days INTEGER;

COMMENT ON COLUMN public.event_drafts.ticket_duration IS 'Duration type for ticket validity: event (expires when event ends), custom (expires after N days), or forever (never expires)';
COMMENT ON COLUMN public.event_drafts.custom_duration_days IS 'Number of days ticket is valid when ticket_duration is set to custom';
