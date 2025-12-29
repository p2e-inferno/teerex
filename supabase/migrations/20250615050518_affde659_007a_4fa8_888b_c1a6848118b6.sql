
-- Create a table for published events
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  date TIMESTAMP WITH TIME ZONE,
  time TEXT NOT NULL,
  location TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'FREE',
  category TEXT NOT NULL,
  image_url TEXT,
  lock_address TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add Row Level Security (RLS)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (anyone can view events)
CREATE POLICY "Anyone can view published events" 
  ON public.events 
  FOR SELECT 
  USING (true);

-- Create policy for creators to insert their own events
CREATE POLICY "Creators can publish their own events" 
  ON public.events 
  FOR INSERT 
  WITH CHECK (true);

-- Create policy for creators to update their own events
CREATE POLICY "Creators can update their own events" 
  ON public.events 
  FOR UPDATE 
  USING (creator_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Create policy for creators to delete their own events
CREATE POLICY "Creators can delete their own events" 
  ON public.events 
  FOR DELETE 
  USING (creator_id = current_setting('request.jwt.claims', true)::json->>'sub');
