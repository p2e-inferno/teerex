ALTER TABLE public.network_configs
  ADD COLUMN IF NOT EXISTS dg_vendor_address TEXT,
  ADD COLUMN IF NOT EXISTS uniswap_v3_quoter_address TEXT,
  ADD COLUMN IF NOT EXISTS uniswap_v3_weth_address TEXT,
  ADD COLUMN IF NOT EXISTS uniswap_v3_eth_usdc_pool_address TEXT,
  ADD COLUMN IF NOT EXISTS uniswap_v3_up_weth_fee INTEGER,
  ADD COLUMN IF NOT EXISTS uniswap_v3_weth_usdc_fee INTEGER;

COMMENT ON COLUMN public.network_configs.dg_vendor_address IS 'DG vendor contract address used for DG/UP conversion quotes.';
COMMENT ON COLUMN public.network_configs.uniswap_v3_quoter_address IS 'Uniswap V3 QuoterV2 address used for read-only conversion quotes.';
COMMENT ON COLUMN public.network_configs.uniswap_v3_weth_address IS 'Wrapped native token address used in Uniswap V3 quote paths.';
COMMENT ON COLUMN public.network_configs.uniswap_v3_eth_usdc_pool_address IS 'Uniswap V3 WETH/USDC pool address used to resolve ETH/USDC quote fee and token order.';
COMMENT ON COLUMN public.network_configs.uniswap_v3_up_weth_fee IS 'Uniswap V3 fee tier for the UP to WETH quote hop.';
COMMENT ON COLUMN public.network_configs.uniswap_v3_weth_usdc_fee IS 'Uniswap V3 fee tier for the WETH to USDC quote hop.';

UPDATE public.network_configs
SET
  usdc_token_address = COALESCE(usdc_token_address, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
  dg_token_address = COALESCE(dg_token_address, '0x4aA47eD29959c7053996d8f7918db01A62D02ee5'),
  up_token_address = COALESCE(up_token_address, '0xaC27fa800955849d6D17cC8952Ba9dD6EAA66187'),
  dg_vendor_address = COALESCE(dg_vendor_address, '0x45adA67dc9a5fb49c5f1A88f0ff83fb0550b3A82'),
  uniswap_v3_quoter_address = COALESCE(uniswap_v3_quoter_address, '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a'),
  uniswap_v3_weth_address = COALESCE(uniswap_v3_weth_address, '0x4200000000000000000000000000000000000006'),
  uniswap_v3_eth_usdc_pool_address = COALESCE(uniswap_v3_eth_usdc_pool_address, '0xd0b53D9277642d899DF5C87A3966A349A798F224'),
  uniswap_v3_up_weth_fee = COALESCE(uniswap_v3_up_weth_fee, 3000),
  uniswap_v3_weth_usdc_fee = COALESCE(uniswap_v3_weth_usdc_fee, 500)
WHERE chain_id = 8453;
