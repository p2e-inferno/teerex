-- Add end_date column to event_drafts for multi-day event support
ALTER TABLE event_drafts
ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;

-- Add end_date column to events for multi-day event support
ALTER TABLE events
ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE;

-- Add comments for clarity
COMMENT ON COLUMN event_drafts.end_date IS 'Optional end date for multi-day events. NULL or equal to date means single-day event';
COMMENT ON COLUMN events.end_date IS 'Optional end date for multi-day events. NULL or equal to date means single-day event';

-- Add check constraint to ensure end_date >= date (if both are set)
ALTER TABLE event_drafts
ADD CONSTRAINT check_end_date_after_start_date
CHECK (end_date IS NULL OR date IS NULL OR end_date >= date);

ALTER TABLE events
ADD CONSTRAINT check_end_date_after_start_date
CHECK (end_date IS NULL OR date IS NULL OR end_date >= date);
