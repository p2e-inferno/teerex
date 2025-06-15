
-- Create a table for event drafts
CREATE TABLE public.event_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  date TIMESTAMPTZ,
  time TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 100,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'FREE' CHECK (currency IN ('ETH', 'USDC', 'FREE')),
  category TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add Row Level Security (RLS) to ensure users can only see their own drafts
ALTER TABLE public.event_drafts ENABLE ROW LEVEL SECURITY;

-- Create policies for drafts
CREATE POLICY "Users can view their own drafts" 
  ON public.event_drafts 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own drafts" 
  ON public.event_drafts 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own drafts" 
  ON public.event_drafts 
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own drafts" 
  ON public.event_drafts 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Create storage bucket for event images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('event-images', 'event-images', true);

-- Create storage policies for event images
CREATE POLICY "Users can upload their own event images"
  ON storage.objects FOR INSERT 
  WITH CHECK (bucket_id = 'event-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view event images"
  ON storage.objects FOR SELECT 
  USING (bucket_id = 'event-images');

CREATE POLICY "Users can update their own event images"
  ON storage.objects FOR UPDATE 
  USING (bucket_id = 'event-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own event images"
  ON storage.objects FOR DELETE 
  USING (bucket_id = 'event-images' AND auth.uid()::text = (storage.foldername(name))[1]);
