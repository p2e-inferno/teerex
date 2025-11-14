-- Add index on lock_address for efficient lookups by Ethereum address
-- This supports the new Web3-native URL structure using lock addresses instead of UUIDs
-- The index uses LOWER() for case-insensitive lookups since Ethereum addresses
-- are case-insensitive (though they can be checksummed with mixed case)

CREATE INDEX IF NOT EXISTS idx_events_lock_address
  ON public.events(LOWER(lock_address));

-- Add unique constraint to ensure one event per lock address
-- This enforces 1:1 relationship between events and lock contracts
ALTER TABLE public.events
  ADD CONSTRAINT events_lock_address_unique
  UNIQUE (lock_address);

-- Note: This migration enables using lock addresses as URL identifiers
-- New URL format: /event/0x1234...abcd instead of /event/uuid
-- Benefits:
-- - Web3-native (verifiable on-chain)
-- - More meaningful for blockchain users
-- - Can be cross-referenced with block explorers
-- - Backwards compatible (UUID lookups still work)
