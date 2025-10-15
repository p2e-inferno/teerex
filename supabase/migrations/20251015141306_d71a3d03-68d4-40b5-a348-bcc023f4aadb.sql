-- Add service_manager_added column to track if the unlock service wallet is added as a lock manager
ALTER TABLE public.events 
ADD COLUMN service_manager_added boolean NOT NULL DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.events.service_manager_added IS 'Tracks whether the unlock service wallet has been successfully added as a lock manager for fiat payment processing';