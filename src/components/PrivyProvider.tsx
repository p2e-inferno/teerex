
import React, { useEffect, useRef, useState } from 'react';
import {
  PrivyProvider as Privy,
  type BaseConnectedWalletType,
  useActiveWallet,
  usePrivy,
  useWallets,
  type User,
} from '@privy-io/react-auth';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { wagmiConfig as fallbackWagmiConfig, buildWagmiConfig } from '@/utils/wagmiConfig';
import { getPrivyConfig, onCacheClear } from '@/lib/config/network-config';
import { PrivySetupInstructions, SupabaseAuthSync } from '@/components/privy-config';
import {
  getPreferredPrivyLinkedConnectedWallet,
  isPrivyEmailAccount,
  isPrivyEmbeddedWallet,
  isPrivyExternalWallet,
  isPrivyWalletAccount,
  isPrivyWalletAddressLinked,
  normalizeWalletAddress,
  type PrivyWalletIdentitySource,
} from '@/lib/wallet/privyWalletIdentity';

interface PrivyProviderProps {
  children: React.ReactNode;
}

// Create a query client for wagmi
const queryClient = new QueryClient();

const PRIVY_SESSION_DEBUG_STORAGE_KEY = 'teerex_privy_debug';

const formatDebugAddress = (address?: string | null) => {
  if (!address) return null;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const formatDebugEmail = (email?: string | null) => {
  if (!email) return null;
  const [name, domain] = email.split('@');
  if (!name || !domain) return '[redacted]';
  return `${name.slice(0, 2)}***@${domain}`;
};

const isPrivySessionDebugEnabled = () => {
  if (import.meta.env.DEV) return true;

  try {
    return window.localStorage.getItem(PRIVY_SESSION_DEBUG_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const getWalletDebugSnapshot = (wallet?: PrivyWalletIdentitySource | null) => ({
  address: formatDebugAddress(wallet?.address),
  chainType: wallet?.chainType ?? null,
  connectorType: wallet?.connectorType ?? null,
  imported: wallet?.imported ?? null,
  type: wallet?.type ?? null,
  walletClientType: wallet?.walletClientType ?? null,
  walletIndex: wallet?.walletIndex ?? null,
});

const getExternalConnectedWallet = (wallets: PrivyWalletIdentitySource[]) =>
  wallets.find(isPrivyExternalWallet) ?? null;

const getPrivySessionDebugSnapshot = ({
  activeWallet,
  activeWalletLinked,
  authenticated,
  preferredLinkedConnectedWallet,
  user,
  wallets,
}: {
  activeWallet: PrivyWalletIdentitySource | null;
  activeWalletLinked: boolean;
  authenticated: boolean;
  preferredLinkedConnectedWallet: PrivyWalletIdentitySource | null;
  user: User | null;
  wallets: PrivyWalletIdentitySource[];
}) => {
  const linkedAccounts = user?.linkedAccounts ?? [];
  const linkedWallets = linkedAccounts
    .filter(isPrivyWalletAccount)
    .map(getWalletDebugSnapshot);
  const linkedEmails = linkedAccounts
    .filter(isPrivyEmailAccount)
    .map((account) => formatDebugEmail(account.address));

  return {
    authenticated,
    activeWallet: getWalletDebugSnapshot(activeWallet),
    activeWalletKind: activeWallet
      ? isPrivyEmbeddedWallet(activeWallet)
        ? 'embedded'
        : 'external'
      : null,
    activeWalletLinked,
    connectedWallets: wallets.map(getWalletDebugSnapshot),
    embeddedWallet: formatDebugAddress(user?.wallet?.address),
    externalConnectedWallet: getWalletDebugSnapshot(getExternalConnectedWallet(wallets)),
    linkedAccountTypes: linkedAccounts.map((account) => account.type).sort(),
    linkedEmails,
    linkedWallets,
    preferredLinkedConnectedWallet: getWalletDebugSnapshot(preferredLinkedConnectedWallet),
    primaryConnectedWallet: formatDebugAddress(wallets[0]?.address),
    userId: user?.id ?? null,
  };
};

const WalletSessionGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { ready, authenticated, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { wallet: activeWallet, setActiveWallet } = useActiveWallet();
  const externalWalletRef = useRef<string | null>(null);
  const logoutInProgressRef = useRef(false);
  const lastSnapshotRef = useRef<string | null>(null);
  const lastReconciledActiveWalletRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    const connectedWallets = (wallets ?? []) as BaseConnectedWalletType[];
    const activeWalletSource = (activeWallet ?? null) as PrivyWalletIdentitySource | null;
    const preferredLinkedConnectedWallet = authenticated
      ? getPreferredPrivyLinkedConnectedWallet(user?.linkedAccounts, connectedWallets)
      : null;
    const preferredLinkedConnectedWalletAddress = normalizeWalletAddress(
      preferredLinkedConnectedWallet?.address
    );
    const activeWalletLinked = authenticated
      ? isPrivyWalletAddressLinked(user?.linkedAccounts, activeWalletSource?.address)
      : false;
    const activeExternalWallet = activeWalletLinked && isPrivyExternalWallet(activeWalletSource)
      ? activeWalletSource
      : null;
    const activeEmbeddedWallet = activeWalletLinked && isPrivyEmbeddedWallet(activeWalletSource)
      ? activeWalletSource
      : null;
    const unlinkedExternalWallet = authenticated && isPrivyExternalWallet(activeWalletSource) && !activeWalletLinked
      ? activeWalletSource
      : null;
    const externalWalletAddress = authenticated
      ? normalizeWalletAddress(activeExternalWallet?.address)
      : null;
    const snapshot = getPrivySessionDebugSnapshot({
      activeWallet: activeWalletSource,
      activeWalletLinked,
      authenticated,
      preferredLinkedConnectedWallet,
      user,
      wallets: connectedWallets,
    });
    const serializedSnapshot = JSON.stringify(snapshot);
    const debugEnabled = isPrivySessionDebugEnabled();

    if (debugEnabled && serializedSnapshot !== lastSnapshotRef.current) {
      console.info('[privy-session-debug] state', {
        ready,
        ...snapshot,
      });
    }

    if (!authenticated) {
      externalWalletRef.current = null;
      logoutInProgressRef.current = false;
      lastReconciledActiveWalletRef.current = null;
      lastSnapshotRef.current = serializedSnapshot;
      return;
    }

    if (logoutInProgressRef.current) {
      lastSnapshotRef.current = serializedSnapshot;
      return;
    }

    if (!activeWalletLinked && preferredLinkedConnectedWallet && preferredLinkedConnectedWalletAddress) {
      if (lastReconciledActiveWalletRef.current !== preferredLinkedConnectedWalletAddress) {
        lastReconciledActiveWalletRef.current = preferredLinkedConnectedWalletAddress;
        if (debugEnabled) {
          console.warn('[privy-session-debug] replacing unlinked active wallet', {
            activeWallet: getWalletDebugSnapshot(activeWalletSource),
            preferredLinkedConnectedWallet: getWalletDebugSnapshot(preferredLinkedConnectedWallet),
          });
        }
        setActiveWallet(preferredLinkedConnectedWallet);
      }
      lastSnapshotRef.current = serializedSnapshot;
      return;
    }

    lastReconciledActiveWalletRef.current = null;

    if (unlinkedExternalWallet) {
      if (externalWalletRef.current) {
        logoutInProgressRef.current = true;
        console.warn('[privy-session-debug] active external wallet is unlinked; logging out', {
          anchored: formatDebugAddress(externalWalletRef.current),
          activeWallet: getWalletDebugSnapshot(unlinkedExternalWallet),
          snapshot,
        });
        queryClient.clear();
        void logout().catch((error) => {
          console.error('Failed to log out after unlinked external wallet became active:', error);
          logoutInProgressRef.current = false;
        });
      }
      lastSnapshotRef.current = serializedSnapshot;
      return;
    }

    if (activeEmbeddedWallet) {
      externalWalletRef.current = null;
      lastSnapshotRef.current = serializedSnapshot;
      return;
    }

    if (!externalWalletAddress) {
      lastSnapshotRef.current = serializedSnapshot;
      return;
    }

    if (!externalWalletRef.current) {
      externalWalletRef.current = externalWalletAddress;
      if (debugEnabled) {
        console.info('[privy-session-debug] anchored external wallet', {
          address: formatDebugAddress(externalWalletAddress),
          wallet: getWalletDebugSnapshot(activeExternalWallet ?? {}),
        });
      }
      lastSnapshotRef.current = serializedSnapshot;
      return;
    }

    if (externalWalletRef.current !== externalWalletAddress) {
      logoutInProgressRef.current = true;
      console.warn('[privy-session-debug] external wallet changed; logging out', {
        from: formatDebugAddress(externalWalletRef.current),
        to: formatDebugAddress(externalWalletAddress),
        snapshot,
      });
      queryClient.clear();
      void logout().catch((error) => {
        console.error('Failed to log out after external wallet switch:', error);
        logoutInProgressRef.current = false;
      });
    }
    lastSnapshotRef.current = serializedSnapshot;
  }, [activeWallet, authenticated, logout, ready, setActiveWallet, user, wallets]);

  return <>{children}</>;
};

export const PrivyProvider: React.FC<PrivyProviderProps> = ({ children }) => {
  const [privyConfig, setPrivyConfig] = useState<any>(null);
  const [wagmiConfig, setWagmiConfig] = useState<any>(fallbackWagmiConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const appId = import.meta.env.VITE_PRIVY_APP_ID?.trim();
  const clientId = import.meta.env.VITE_PUBLIC_PRIVY_CLIENT_ID?.trim() || "";

  useEffect(() => {
    async function loadPrivyConfig({ silent = false }: { silent?: boolean } = {}) {
      try {
        // Only show the full-screen loading state on the initial mount.
        // Background refreshes (e.g. triggered by an admin editing a network)
        // must not flip `isLoading`, otherwise the whole app tree unmounts and
        // remounts — which looks identical to a page refresh.
        if (!silent) setIsLoading(true);
        const config = await getPrivyConfig();
        setPrivyConfig(config);
        setError(null); // Clear any previous errors
      } catch (err) {
        console.error('Failed to load Privy configuration:', err);
        setError('Failed to load network configuration');
        // Fallback to basic config
        setPrivyConfig({
          appearance: { theme: 'light', accentColor: '#676FFF' },
          embeddedWallets: {
            ethereum: { createOnLogin: 'users-without-wallets' },
          },
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
        if (!silent) setIsLoading(false);
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
      console.log('Cache clear event received, refreshing Privy config in background...');
      // Silent refresh: update config in place without tearing down the app tree.
      loadPrivyConfig({ silent: true });
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

  // If no valid Privy IDs are provided, show setup instructions
  if (
    !appId ||
    appId === 'your_privy_app_id_here' ||
    !clientId ||
    clientId === 'your_privy_client_id_here'
  ) {
    return <PrivySetupInstructions />;
  }

  return (
    <Privy appId={appId} clientId={clientId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <WalletSessionGuard>
            <SupabaseAuthSync>
              {children}
            </SupabaseAuthSync>
          </WalletSessionGuard>
        </WagmiProvider>
      </QueryClientProvider>
    </Privy>
  );
};
