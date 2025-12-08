-- Align ticket_duration allowed values with UI/storage options (remove duplicate "forever"/"unlimited")

-- Update events table constraint
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_ticket_duration_check,
  ADD CONSTRAINT events_ticket_duration_check
    CHECK (ticket_duration IN ('event', 'custom', 'unlimited', '30', '365'));

COMMENT ON COLUMN public.events.ticket_duration IS 'Duration type for ticket validity: event (expires when event ends), custom (expires after N days), or unlimited (never expires)';

-- Update event_drafts table constraint
ALTER TABLE public.event_drafts
  DROP CONSTRAINT IF EXISTS event_drafts_ticket_duration_check,
  ADD CONSTRAINT event_drafts_ticket_duration_check
    CHECK (ticket_duration IN ('event', 'custom', 'unlimited', '30', '365'));

COMMENT ON COLUMN public.event_drafts.ticket_duration IS 'Duration type for ticket validity: event (expires when event ends), custom (expires after N days), or unlimited (never expires)';
