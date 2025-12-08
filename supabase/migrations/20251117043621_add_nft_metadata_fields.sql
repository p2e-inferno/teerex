-- Add NFT metadata tracking fields to events table
-- Note: This migration should be manually applied after testing

ALTER TABLE events
ADD COLUMN IF NOT EXISTS nft_metadata_set BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS nft_base_uri TEXT;

COMMENT ON COLUMN events.nft_metadata_set IS 'Whether NFT metadata (tokenURI) has been configured on the lock contract';
COMMENT ON COLUMN events.nft_base_uri IS 'Base URI for NFT metadata (Edge Function URL)';

