-- Create network configurations table for storing chain and token data
CREATE TABLE public.network_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chain_id BIGINT NOT NULL UNIQUE,
  chain_name TEXT NOT NULL,
  usdc_token_address TEXT,
  native_currency_symbol TEXT NOT NULL DEFAULT 'ETH',
  rpc_url TEXT,
  block_explorer_url TEXT,
  is_mainnet BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.network_configs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view network configs" 
ON public.network_configs 
FOR SELECT 
USING (true);

CREATE POLICY "System can manage network configs" 
ON public.network_configs 
FOR ALL 
USING (true);

-- Insert network configurations
INSERT INTO public.network_configs (chain_id, chain_name, usdc_token_address, native_currency_symbol, rpc_url, block_explorer_url, is_mainnet, is_active)
VALUES 
  -- Mainnets
  (1, 'Ethereum', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ETH', 'https://eth.llamarpc.com', 'https://etherscan.io', true, true),
  (8453, 'Base', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'ETH', 'https://mainnet.base.org', 'https://basescan.org', true, true),
  (42161, 'Arbitrum One', '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 'ETH', 'https://arb1.arbitrum.io/rpc', 'https://arbiscan.io', true, true),
  (10, 'OP Mainnet', '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', 'ETH', 'https://mainnet.optimism.io', 'https://optimistic.etherscan.io', true, true),
  (137, 'Polygon', '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', 'MATIC', 'https://polygon-rpc.com', 'https://polygonscan.com', true, true),
  (324, 'zkSync Era', '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4', 'ETH', 'https://mainnet.era.zksync.io', 'https://explorer.zksync.io', true, true),
  (1135, 'Lisk', NULL, 'ETH', 'https://rpc.api.lisk.com', 'https://blockscout.lisk.com', true, false),
  
  -- Testnets  
  (84532, 'Base Sepolia', '0x036CbD53842c5426634e7929541eC2318f3dCF7e', 'ETH', 'https://sepolia.base.org', 'https://sepolia.basescan.org', false, true),
  (11155111, 'Ethereum Sepolia', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', 'ETH', 'https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.etherscan.io', false, true),
  (421614, 'Arbitrum Sepolia', '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', 'ETH', 'https://sepolia-rollup.arbitrum.io/rpc', 'https://sepolia.arbiscan.io', false, true),
  (11155420, 'OP Sepolia', '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', 'ETH', 'https://sepolia.optimism.io', 'https://sepolia-optimism.etherscan.io', false, true),
  (80002, 'Polygon Amoy', '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', 'MATIC', 'https://rpc-amoy.polygon.technology', 'https://www.oklink.com/amoy', false, true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_network_configs_updated_at
BEFORE UPDATE ON public.network_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();