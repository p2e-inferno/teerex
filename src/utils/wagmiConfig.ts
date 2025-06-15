
import { createConfig, http } from '@wagmi/core';
import { base, baseSepolia } from 'wagmi/chains';

export const wagmiConfig = createConfig({
  chains: [baseSepolia, base], // Put baseSepolia first for default
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
});
