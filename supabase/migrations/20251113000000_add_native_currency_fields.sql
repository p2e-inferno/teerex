-- Add missing native currency fields for complete Privy configuration
ALTER TABLE network_configs
ADD COLUMN native_currency_decimals INTEGER DEFAULT 18,
ADD COLUMN native_currency_name TEXT;

-- Update existing records with proper native currency information
UPDATE network_configs SET
  native_currency_name = 'Ethereum',
  native_currency_decimals = 18
WHERE native_currency_symbol = 'ETH';

UPDATE network_configs SET
  native_currency_name = 'Polygon',
  native_currency_decimals = 18
WHERE native_currency_symbol = 'POL';

-- Update Polygon records to use POL instead of MATIC
UPDATE network_configs SET
  native_currency_symbol = 'POL',
  native_currency_name = 'Polygon'
WHERE chain_id IN (137, 80002); -- Polygon mainnet and Amoy testnet
