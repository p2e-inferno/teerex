-- Add unlock_factory_address column to network_configs for network-agnostic gas sponsorship
ALTER TABLE public.network_configs
ADD COLUMN unlock_factory_address TEXT;

-- Add comment
COMMENT ON COLUMN public.network_configs.unlock_factory_address IS 'Unlock Protocol factory contract address for deploying lock contracts on this network. Required for gasless lock deployment support.';

-- Populate existing networks with known Unlock Protocol factory addresses
UPDATE public.network_configs
SET unlock_factory_address = '0xe79B93f8E22676774F2A8dAd469175ebd00029FA'
WHERE chain_id = 1; -- Ethereum Mainnet

UPDATE public.network_configs
SET unlock_factory_address = '0x99b1348a9129ac49c6de7F11245773dE2f51fB0c'
WHERE chain_id = 10; -- Optimism

UPDATE public.network_configs
SET unlock_factory_address = '0xeC83410DbC48C7797D2f2AFe624881674c65c856'
WHERE chain_id = 56; -- BNB Chain

UPDATE public.network_configs
SET unlock_factory_address = '0x1bc53f4303c711cc693F6Ec3477B83703DcB317f'
WHERE chain_id = 100; -- Gnosis Chain

UPDATE public.network_configs
SET unlock_factory_address = '0xE8E5cd156f89F7bdB267EabD5C43Af3d5AF2A78f'
WHERE chain_id = 137; -- Polygon

UPDATE public.network_configs
SET unlock_factory_address = '0x32CF553582159F12fBb1Ae1649b3670395610F24'
WHERE chain_id = 324; -- zkSync Era

UPDATE public.network_configs
SET unlock_factory_address = '0x259813B665C8f6074391028ef782e27B65840d89'
WHERE chain_id = 1101; -- Polygon zkEVM

UPDATE public.network_configs
SET unlock_factory_address = '0xd0b14797b9D08493392865647384974470202A78'
WHERE chain_id = 8453; -- Base Mainnet

UPDATE public.network_configs
SET unlock_factory_address = '0x1FF7e338d5E582138C46044dc238543Ce555C963'
WHERE chain_id = 42161; -- Arbitrum One

UPDATE public.network_configs
SET unlock_factory_address = '0x1FF7e338d5E582138C46044dc238543Ce555C963'
WHERE chain_id = 42220; -- Celo

UPDATE public.network_configs
SET unlock_factory_address = '0x70cBE5F72dD85aA634d07d2227a421144Af734b3'
WHERE chain_id = 43114; -- Avalanche C-Chain

UPDATE public.network_configs
SET unlock_factory_address = '0x70B3c9Dd9788570FAAb24B92c3a57d99f8186Cc7'
WHERE chain_id = 59144; -- Linea

UPDATE public.network_configs
SET unlock_factory_address = '0x259813B665C8f6074391028ef782e27B65840d89'
WHERE chain_id = 84532; -- Base Sepolia

UPDATE public.network_configs
SET unlock_factory_address = '0x259813B665C8f6074391028ef782e27B65840d89'
WHERE chain_id = 534352; -- Scroll

UPDATE public.network_configs
SET unlock_factory_address = '0x36b34e10295cCE69B652eEB5a8046041074515Da'
WHERE chain_id = 11155111; -- Sepolia (Ethereum testnet)

-- Add index on is_active for performance when filtering active networks
CREATE INDEX IF NOT EXISTS idx_network_configs_is_active
ON public.network_configs(is_active)
WHERE is_active = true;

-- Add comment on index
COMMENT ON INDEX idx_network_configs_is_active IS 'Partial index for fast lookup of active networks used in gas sponsorship chain validation';
