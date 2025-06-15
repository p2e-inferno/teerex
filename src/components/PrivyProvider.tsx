
import React, { useEffect } from 'react';
import { PrivyProvider as Privy, usePrivy } from '@privy-io/react-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PrivyProviderProps {
  children: React.ReactNode;
}

export const PrivyProvider: React.FC<PrivyProviderProps> = ({ children }) => {
  // Replace this with your actual Privy App ID from https://dashboard.privy.io
  const appId = 'cm5x5kyq500eo5zk1lykex6s5';

  // If no valid App ID is provided, show setup instructions
  if (!appId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
            <CardTitle>Privy Setup Required</CardTitle>
            <CardDescription>
              Replace 'your-actual-privy-app-id-here' in PrivyProvider.tsx with your real Privy App ID
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm space-y-2">
              <p><strong>Steps to get your Privy App ID:</strong></p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Visit <a href="https://dashboard.privy.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privy Dashboard</a></li>
                <li>Copy your App ID from your app settings</li>
                <li>Replace the placeholder in the code with your real App ID</li>
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
        supportedChains: [
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
      <SupabaseAuthSync>
        {children}
      </SupabaseAuthSync>
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
