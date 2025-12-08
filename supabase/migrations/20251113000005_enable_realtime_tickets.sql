-- Enable Realtime subscriptions for tickets table
-- This allows clients to subscribe to INSERT, UPDATE, and DELETE events on the tickets table

-- Add tickets table to the Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;

-- Note: RLS policies are already in place from previous migrations
-- The existing "Anyone can view tickets" policy (SELECT access) allows
-- anonymous users to subscribe to Realtime changes via Supabase client
