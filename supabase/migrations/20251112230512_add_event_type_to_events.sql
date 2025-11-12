-- Add event_type column to events table to support physical and virtual events
ALTER TABLE events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'physical' CHECK (event_type IN ('physical', 'virtual'));
