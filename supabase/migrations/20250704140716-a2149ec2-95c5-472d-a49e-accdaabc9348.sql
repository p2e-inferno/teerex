-- Add fields to events table for Unlock Protocol configuration
ALTER TABLE public.events 
ADD COLUMN max_keys_per_address integer NOT NULL DEFAULT 1,
ADD COLUMN transferable boolean NOT NULL DEFAULT true,
ADD COLUMN requires_approval boolean NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.events.max_keys_per_address IS 'Maximum number of tickets/keys one user can own for this event';
COMMENT ON COLUMN public.events.transferable IS 'Whether tickets can be transferred between users';  
COMMENT ON COLUMN public.events.requires_approval IS 'Whether ticket transfers require approval from lock manager';