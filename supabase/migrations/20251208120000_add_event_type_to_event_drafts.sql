-- Add event_type column to event_drafts table to support physical and virtual drafts
ALTER TABLE public.event_drafts
  ADD COLUMN event_type TEXT NOT NULL DEFAULT 'physical'
  CHECK (event_type IN ('physical', 'virtual'));

