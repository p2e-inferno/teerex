-- ============================================================================
-- Fix Storage Bucket Delete Policy Security Vulnerability
-- Created: 2025-11-12
-- Purpose: Restore ownership-based delete permissions for event-images bucket
-- ============================================================================

-- ISSUE: Migration 20250615033125 introduced overly permissive policy that allows
-- ANY authenticated user to delete ANY image in the event-images bucket.
-- This is a HIGH security risk as users can delete other users' event images.

-- SOLUTION: Restore the secure policy from the original migration (20250615030145)
-- that restricts deletion to the file owner (folder name matches user ID).

-- Drop the insecure public delete policy
DROP POLICY IF EXISTS "Allow public delete of event images" ON storage.objects;

-- Restore secure ownership-based delete policy
-- Users can only delete files in their own folder (sanitized user ID)
CREATE POLICY "Users can delete their own event images"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'event-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Also restore secure update policy for consistency
DROP POLICY IF EXISTS "Allow public update of event images" ON storage.objects;

CREATE POLICY "Users can update their own event images"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'event-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Note: Upload policy remains permissive by design since file paths include
-- user-specific folders. The client code (supabaseDraftStorage.ts) creates
-- paths like: {sanitizedUserId}/{timestamp}.{ext}

-- ============================================================================
-- BREAKING CHANGES: None
-- - The application code (supabaseDraftStorage.ts:276-279) explicitly does NOT
--   delete images to prevent breaking published event image references.
-- - This migration restores the original secure behavior without functional impact.
-- ============================================================================
