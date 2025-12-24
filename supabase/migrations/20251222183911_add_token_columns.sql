-- Add token address columns for DG (DreadGang), G (Gooddollar), and UP (UnlockProtocolToken)
ALTER TABLE public.network_configs
ADD COLUMN dg_token_address TEXT,
ADD COLUMN g_token_address TEXT,
ADD COLUMN up_token_address TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.network_configs.dg_token_address IS 'DreadGang (DG) token contract address';
COMMENT ON COLUMN public.network_configs.g_token_address IS 'Gooddollar (G) token contract address';
COMMENT ON COLUMN public.network_configs.up_token_address IS 'UnlockProtocolToken (UP) token contract address';

-- Seed DG and UP tokens on Base Mainnet (8453)
UPDATE public.network_configs
SET
  dg_token_address = '0x4aA47eD29959c7053996d8f7918db01A62D02ee5',
  up_token_address = '0xac27fa800955849d6d17cc8952ba9dd6eaa66187'
WHERE chain_id = 8453;

-- Seed G token on Celo (42220)
UPDATE public.network_configs
SET g_token_address = '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A'
WHERE chain_id = 42220;

-- Seed G token on Ethereum Mainnet (1)
UPDATE public.network_configs
SET g_token_address = '0x67C5870b4A41D4Ebef24d2456547A03F1f3e094B'
WHERE chain_id = 1;
