-- Add image crop coordinate fields to event_drafts table
ALTER TABLE event_drafts
ADD COLUMN IF NOT EXISTS image_crop_x NUMERIC(5,2) DEFAULT 50,
ADD COLUMN IF NOT EXISTS image_crop_y NUMERIC(5,2) DEFAULT 50;

-- Add image crop coordinate fields to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS image_crop_x NUMERIC(5,2) DEFAULT 50,
ADD COLUMN IF NOT EXISTS image_crop_y NUMERIC(5,2) DEFAULT 50;

-- Add comments for documentation
COMMENT ON COLUMN event_drafts.image_crop_x IS 'Horizontal crop position percentage (0-100, default 50 = center)';
COMMENT ON COLUMN event_drafts.image_crop_y IS 'Vertical crop position percentage (0-100, default 50 = center)';
COMMENT ON COLUMN events.image_crop_x IS 'Horizontal crop position percentage (0-100, default 50 = center)';
COMMENT ON COLUMN events.image_crop_y IS 'Vertical crop position percentage (0-100, default 50 = center)';
