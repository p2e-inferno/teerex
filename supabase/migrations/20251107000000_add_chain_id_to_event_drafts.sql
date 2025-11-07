-- Add chain_id to event_drafts to track the target blockchain network for drafts
-- Safe to run multiple times thanks to IF NOT EXISTS
ALTER TABLE public.event_drafts
ADD COLUMN IF NOT EXISTS chain_id integer;

-- Optional: you can index this if you plan to filter by chain often
-- CREATE INDEX IF NOT EXISTS idx_event_drafts_chain_id ON public.event_drafts(chain_id);

