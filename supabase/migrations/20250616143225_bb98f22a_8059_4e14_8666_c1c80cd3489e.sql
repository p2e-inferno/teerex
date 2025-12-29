
-- Add a column to store the chain ID for each event
ALTER TABLE public.events
ADD COLUMN chain_id BIGINT NOT NULL DEFAULT 84532; -- Default to Base Sepolia (84532) for existing events

-- Add a comment for clarity on the new column
COMMENT ON COLUMN public.events.chain_id IS 'The chain ID of the network where the event''s smart contract is deployed.';
