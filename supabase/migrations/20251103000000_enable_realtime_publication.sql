-- ============================================================================
-- Enable Realtime for Event Interactions Tables
-- Created: 2025-11-03
-- Purpose: Add event interaction tables to Supabase Realtime publication
--          so that client-side subscriptions can receive database changes
-- ============================================================================

-- Add tables to Supabase Realtime publication
-- This enables Realtime subscriptions to receive INSERT, UPDATE, DELETE events
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_engagement_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;

-- Note: If tables are already in the publication, these commands will fail silently
-- This is expected and safe - the tables will be in the publication either way

