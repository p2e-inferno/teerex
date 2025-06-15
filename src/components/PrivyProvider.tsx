
import React from 'react';
import { PrivyProvider as Privy } from '@privy-io/react-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface PrivyProviderProps {
  children: React.ReactNode;
}

export const PrivyProvider: React.FC<PrivyProviderProps> = ({ children }) => {
  const appId = import.meta.env.VITE_PRIVY_APP_ID;

  // If no valid App ID is provided, show setup instructions
  if (!appId || appId === 'your-privy-app-id') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
            <CardTitle>Privy Setup Required</CardTitle>
            <CardDescription>
              To use wallet functionality, you need to set up your Privy App ID
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm space-y-2">
              <p><strong>Steps to set up Privy:</strong></p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Visit <a href="https://privy.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">privy.io</a></li>
                <li>Create an account and new app</li>
                <li>Copy your App ID</li>
                <li>Set it as environment variable: <code className="bg-muted px-1 rounded">VITE_PRIVY_APP_ID</code></li>
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
        loginMethods: ['email', 'wallet'],
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
      {children}
    </Privy>
  );
};
