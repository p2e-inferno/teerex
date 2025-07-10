
import React, { useEffect } from 'react';
import { PrivyProvider as Privy, usePrivy } from '@privy-io/react-auth';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { wagmiConfig } from '@/utils/wagmiConfig';

interface PrivyProviderProps {
  children: React.ReactNode;
}

// Create a query client for wagmi
const queryClient = new QueryClient();

export const PrivyProvider: React.FC<PrivyProviderProps> = ({ children }) => {
  // Get Privy App ID from environment variables or fallback to default
  const appId = import.meta.env.VITE_PRIVY_APP_ID || 'cm5x5kyq500eo5zk1lykex6s5';

  // If no valid App ID is provided, show setup instructions
  if (!appId || appId === 'your_privy_app_id_here') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
            <CardTitle>Privy Setup Required</CardTitle>
            <CardDescription>
              Set VITE_PRIVY_APP_ID in your .env file with your real Privy App ID
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm space-y-2">
              <p><strong>Steps to get your Privy App ID:</strong></p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Visit <a href="https://dashboard.privy.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privy Dashboard</a></li>
                <li>Copy your App ID from your app settings</li>
                <li>Copy .env.example to .env and set VITE_PRIVY_APP_ID</li>
                <li>Restart the development server</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Privy
      appId={appId}
      config={{
        appearance: {
          theme: 'light',
          accentColor: '#676FFF',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        loginMethods: ['email', 'wallet', 'sms'],
        defaultChain: {
          id: 84532, // Base Sepolia testnet
          name: 'Base Sepolia',
          network: 'base-sepolia',
          nativeCurrency: {
            decimals: 18,
            name: 'Ethereum',
            symbol: 'ETH',
          },
          rpcUrls: {
            default: {
              http: ['https://sepolia.base.org'],
            },
            public: {
              http: ['https://sepolia.base.org'],
            },
          },
          blockExplorers: {
            default: { name: 'Base Sepolia Explorer', url: 'https://sepolia.basescan.org' },
          },
        },
        supportedChains: [
          {
            id: 84532, // Base Sepolia testnet
            name: 'Base Sepolia',
            network: 'base-sepolia',
            nativeCurrency: {
              decimals: 18,
              name: 'Ethereum',
              symbol: 'ETH',
            },
            rpcUrls: {
              default: {
                http: ['https://sepolia.base.org'],
              },
              public: {
                http: ['https://sepolia.base.org'],
              },
            },
            blockExplorers: {
              default: { name: 'Base Sepolia Explorer', url: 'https://sepolia.basescan.org' },
            },
          },
          {
            id: 8453, // Base mainnet
            name: 'Base',
            network: 'base',
            nativeCurrency: {
              decimals: 18,
              name: 'Ethereum',
              symbol: 'ETH',
            },
            rpcUrls: {
              default: {
                http: ['https://mainnet.base.org'],
              },
              public: {
                http: ['https://mainnet.base.org'],
              },
            },
            blockExplorers: {
              default: { name: 'BaseScan', url: 'https://basescan.org' },
            },
          },
        ],
      }}
    >
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

// Component to sync Privy auth with Supabase
const SupabaseAuthSync: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, authenticated } = usePrivy();

  useEffect(() => {
    const syncAuth = async () => {
      if (authenticated && user) {
        try {
          console.log('User authenticated with Privy:', user.id);
          // We'll handle authentication at the individual API level
          // since Privy tokens aren't directly compatible with Supabase
        } catch (error) {
          console.error('Error syncing auth:', error);
        }
      } else {
        console.log('User not authenticated');
      }
    };

    syncAuth();
  }, [authenticated, user]);

  return <>{children}</>;
};
