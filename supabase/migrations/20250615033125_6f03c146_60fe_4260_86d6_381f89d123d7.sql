
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow authenticated users to upload event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their own event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own event images" ON storage.objects;

-- Create new permissive policies for public access
CREATE POLICY "Allow public upload to event images" ON storage.objects
FOR INSERT 
WITH CHECK (bucket_id = 'event-images');

CREATE POLICY "Allow public update of event images" ON storage.objects
FOR UPDATE 
USING (bucket_id = 'event-images');

CREATE POLICY "Allow public delete of event images" ON storage.objects
FOR DELETE 
USING (bucket_id = 'event-images');
