-- Add DG, G, UP token support
-- Remove CHECK constraint on event_drafts.currency to support dynamic tokens

-- Drop the currency check constraint if it exists
ALTER TABLE event_drafts
DROP CONSTRAINT IF EXISTS event_drafts_currency_check;

-- Add documentation comments
COMMENT ON COLUMN event_drafts.currency IS 'Supported currencies: ETH, USDC, DG, G, UP. Token availability per chain is configured in network_configs table.';
COMMENT ON COLUMN events.currency IS 'Supported currencies: ETH, USDC, DG, G, UP. Token availability per chain is configured in network_configs table.';
