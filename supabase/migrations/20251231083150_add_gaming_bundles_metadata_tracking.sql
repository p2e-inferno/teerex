-- Add field to track NFT metadata status
ALTER TABLE public.gaming_bundles
  ADD COLUMN IF NOT EXISTS metadata_set BOOLEAN NOT NULL DEFAULT false;

-- Add comment
COMMENT ON COLUMN public.gaming_bundles.metadata_set IS 'Whether NFT metadata URI has been successfully set on the lock contract';
