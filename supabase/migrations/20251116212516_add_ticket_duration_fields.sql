-- Add ticket duration fields to event_drafts table
ALTER TABLE event_drafts
ADD COLUMN IF NOT EXISTS ticket_duration TEXT DEFAULT 'event',
ADD COLUMN IF NOT EXISTS custom_duration_days INTEGER;

-- Add ticket duration fields to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS ticket_duration TEXT DEFAULT 'event',
ADD COLUMN IF NOT EXISTS custom_duration_days INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN event_drafts.ticket_duration IS 'Ticket validity duration: event, 30, 365, unlimited, or custom';
COMMENT ON COLUMN event_drafts.custom_duration_days IS 'Custom duration in days when ticket_duration is set to custom';
COMMENT ON COLUMN events.ticket_duration IS 'Ticket validity duration: event, 30, 365, unlimited, or custom';
COMMENT ON COLUMN events.custom_duration_days IS 'Custom duration in days when ticket_duration is set to custom';
