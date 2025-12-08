-- Add email tracking columns for Mailgun integration
-- This migration adds minimal tracking columns needed for email functionality
-- following KISS principle - no separate email_events table (YAGNI)

-- Add confirmation_sent flag to event_waitlist table
-- This prevents duplicate confirmation emails and enables batch processing
ALTER TABLE public.event_waitlist
ADD COLUMN IF NOT EXISTS confirmation_sent BOOLEAN DEFAULT false;

-- Add index for efficient querying of unsent confirmations
CREATE INDEX IF NOT EXISTS idx_event_waitlist_confirmation_sent
ON public.event_waitlist(confirmation_sent)
WHERE confirmation_sent = false;

-- The user_email column already exists in tickets table (added in previous migration)
-- Just ensure we have an index for efficient email lookups
CREATE INDEX IF NOT EXISTS idx_tickets_user_email
ON public.tickets(user_email)
WHERE user_email IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.event_waitlist.confirmation_sent IS
'Flag to track if confirmation email has been sent to prevent duplicates';
