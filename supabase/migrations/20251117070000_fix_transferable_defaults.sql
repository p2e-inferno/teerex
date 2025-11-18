-- Fix transferable defaults: non-transferable by default for security
-- Prevents ticket resale/transfer unless explicitly enabled by creator

-- 1. Change default on events table from true to false
ALTER TABLE public.events
  ALTER COLUMN transferable SET DEFAULT false;

-- 2. Add transferable column to event_drafts table
ALTER TABLE public.event_drafts
  ADD COLUMN IF NOT EXISTS transferable boolean NOT NULL DEFAULT false;

-- 3. Update any existing events/drafts with transferable=true to false
-- This is a one-time data fix for existing records
-- Comment out if you want to preserve existing transferable settings
UPDATE public.events SET transferable = false WHERE transferable = true;
UPDATE public.event_drafts SET transferable = false WHERE transferable = true;
