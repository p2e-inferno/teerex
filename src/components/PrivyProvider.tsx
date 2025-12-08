
import React, { useEffect, useState } from 'react';
import { PrivyProvider as Privy } from '@privy-io/react-auth';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { wagmiConfig as fallbackWagmiConfig, buildWagmiConfig } from '@/utils/wagmiConfig';
import { getPrivyConfig, onCacheClear } from '@/lib/config/network-config';
import { PrivySetupInstructions, SupabaseAuthSync } from '@/components/privy-config';

interface PrivyProviderProps {
  children: React.ReactNode;
}

// Create a query client for wagmi
const queryClient = new QueryClient();

export const PrivyProvider: React.FC<PrivyProviderProps> = ({ children }) => {
  const [privyConfig, setPrivyConfig] = useState<any>(null);
  const [wagmiConfig, setWagmiConfig] = useState(fallbackWagmiConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get Privy App ID from environment variables or fallback to default
  const appId = import.meta.env.VITE_PRIVY_APP_ID;

  useEffect(() => {
    async function loadPrivyConfig() {
      try {
        setIsLoading(true);
        const config = await getPrivyConfig();
        setPrivyConfig(config);
        setError(null); // Clear any previous errors
      } catch (err) {
        console.error('Failed to load Privy configuration:', err);
        setError('Failed to load network configuration');
        // Fallback to basic config
        setPrivyConfig({
          appearance: { theme: 'light', accentColor: '#676FFF' },
          embeddedWallets: { createOnLogin: 'users-without-wallets' },
          loginMethods: ['email', 'wallet'],
          defaultChain: {
            id: 84532,
            name: 'Base Sepolia',
            network: 'base-sepolia',
            nativeCurrency: { decimals: 18, name: 'Ethereum', symbol: 'ETH' },
            rpcUrls: { default: { http: ['https://sepolia.base.org'] } },
            blockExplorers: { default: { name: 'Base Sepolia Explorer', url: 'https://sepolia.basescan.org' } },
          },
          supportedChains: [
            {
              id: 84532,
              name: 'Base Sepolia',
              network: 'base-sepolia',
              nativeCurrency: { decimals: 18, name: 'Ethereum', symbol: 'ETH' },
              rpcUrls: { default: { http: ['https://sepolia.base.org'] } },
              blockExplorers: { default: { name: 'Base Sepolia Explorer', url: 'https://sepolia.basescan.org' } },
            },
            {
              id: 8453,
              name: 'Base',
              network: 'base',
              nativeCurrency: { decimals: 18, name: 'Ethereum', symbol: 'ETH' },
              rpcUrls: { default: { http: ['https://mainnet.base.org'] } },
              blockExplorers: { default: { name: 'BaseScan', url: 'https://basescan.org' } },
            }
          ],
        });
      } finally {
        setIsLoading(false);
      }
    }

    // Load initial config
    loadPrivyConfig();

    // Load wagmi config dynamically from network configs
    let mounted = true;
    const loadWagmi = () =>
      buildWagmiConfig()
        .then(cfg => {
          if (mounted) setWagmiConfig(cfg);
        })
        .catch(err => {
          console.warn('Failed to build wagmi config dynamically, using fallback:', err);
        });
    loadWagmi();

    // Listen for cache clear events
    const unsubscribe = onCacheClear(() => {
      console.log('Cache clear event received, reloading Privy config...');
      loadPrivyConfig();
      loadWagmi();
    });

    // Cleanup listener on unmount
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Show loading state while config is being loaded
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
          <span className="text-gray-600">Loading network configuration...</span>
        </div>
      </div>
    );
  }

  // Show error state if config failed to load
  if (error && !privyConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle>Configuration Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // If no valid App ID is provided, show setup instructions
  if (!appId || appId === 'your_privy_app_id_here') {
    return <PrivySetupInstructions />;
  }

  return (
    <Privy appId={appId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <SupabaseAuthSync>
            {children}
          </SupabaseAuthSync>
        </WagmiProvider>
      </QueryClientProvider>
    </Privy>
  );
};
