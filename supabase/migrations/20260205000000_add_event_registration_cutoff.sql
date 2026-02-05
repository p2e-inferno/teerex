-- Migration: Add starts_at and registration_cutoff to events and event_drafts
-- Description: Establishes a canonical start time and a unified registration cutoff timestamp.

ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS registration_cutoff TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.event_drafts 
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS registration_cutoff TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS timezone_offset_minutes INTEGER;

-- Populate starts_at for legacy events
-- Combines the 'date' (stored as TIMESTAMPTZ, usually midnight) with the 'time' text field.
-- Includes a regex check to ensure 'time' follows a parseable format (24h HH:MM or 12h H:MM AM/PM)
UPDATE public.events 
SET starts_at = (date::date + time::time)::timestamp AT TIME ZONE 'UTC'
WHERE starts_at IS NULL 
  AND date IS NOT NULL 
  AND time IS NOT NULL
  AND time ~* '^((([01]?\\d|2[0-3]):[0-5]\\d)|((0?[1-9]|1[0-2]):[0-5]\\d\\s*[ap]m))$';

UPDATE public.event_drafts 
SET starts_at = (date::date + time::time)::timestamp AT TIME ZONE 'UTC'
WHERE starts_at IS NULL 
  AND date IS NOT NULL 
  AND time IS NOT NULL
  AND time ~* '^((([01]?\\d|2[0-3]):[0-5]\\d)|((0?[1-9]|1[0-2]):[0-5]\\d\\s*[ap]m))$';

-- Index the cutoff for performance during validation
CREATE INDEX IF NOT EXISTS idx_events_registration_cutoff ON public.events (registration_cutoff);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON public.events (starts_at);
