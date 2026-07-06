import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { getDefaultChainId } from '@/lib/config/network-config';
import { WalletIdentityCard } from '@/components/profile/WalletIdentityCard';
import { TokenBalancesCard } from '@/components/profile/TokenBalancesCard';
import { TransferTokenCard } from '@/components/profile/TransferTokenCard';
import { TransactionHistoryCard } from '@/components/profile/TransactionHistoryCard';
import { UserPayoutAccountCard } from '@/components/profile/UserPayoutAccountCard';
import { DgRedemptionCard } from '@/components/profile/DgRedemptionCard';
import { PlayerNameCard } from '@/components/profile/PlayerNameCard';
import { TelegramNotificationsCard } from '@/components/profile/TelegramNotificationsCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Loader2, User, Wallet, Settings } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { NetworkSelector } from '@/components/profile/NetworkSelector';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Profile page - User wallet identity, token balances, and transfers
 *
 * Features:
 * - Wallet address with QR code
 * - Connected wallets display
 * - Token balances across all active networks
 * - Inline token transfer form
 *
 * Requires authentication - redirects to home if not authenticated
 */
const Profile: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = usePrivy();
  const {
    primaryAddress,
    allAddresses,
    walletType,
    isLoading,
    isAuthenticated,
  } = useUserProfile();
  const { networks: activeNetworks } = useNetworkConfigs();

  // Determine primary chain for WalletIdentityCard
  // Prioritize default chain from env, then first active network, then fallback
  const defaultChainId = getDefaultChainId();
  const primaryChainId = activeNetworks.find(n => n.chain_id === defaultChainId)?.chain_id
    ?? activeNetworks?.[0]?.chain_id
    ?? defaultChainId;

  const chainIdParam = Number(searchParams.get('chainId'));
  const requestedChainId = Number.isFinite(chainIdParam) && chainIdParam > 0 ? chainIdParam : null;
  const [selectedChainId, setSelectedChainId] = useState<number>(requestedChainId ?? getDefaultChainId());

  useEffect(() => {
    if (activeNetworks.length === 0) return;
    if (requestedChainId && activeNetworks.some(n => n.chain_id === requestedChainId)) {
      setSelectedChainId(requestedChainId);
      return;
    }
    if (!activeNetworks.some(n => n.chain_id === selectedChainId)) {
      setSelectedChainId(activeNetworks[0].chain_id);
    }
  }, [activeNetworks, requestedChainId, selectedChainId]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/');
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto shadow-xl shadow-violet-500/20">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          </div>
          <p className="text-slate-500 font-medium">Loading your profile...</p>
        </div>
      </div>
    );
  }

  // Not authenticated state
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 text-center border border-slate-200 dark:border-slate-800">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-violet-500/20">
              <User className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Connect to Continue
            </h2>
            <p className="text-slate-500 mb-6">
              Connect your wallet to view your profile and manage tokens.
            </p>
            <Button
              onClick={login}
              className="w-full h-12 text-base font-medium rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-500/25"
            >
              Connect Wallet
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // No wallet address state
  if (!primaryAddress) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-6">
        <Alert className="max-w-md" variant="destructive">
          <AlertDescription>
            No wallet address found. Please reconnect your wallet.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-7xl">

        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-xl shadow-violet-500/20">
              <User className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                My Profile
              </h1>
              <p className="text-slate-500 mt-1">
                Manage your wallet, view balances, send tokens, and redeem DG
              </p>
            </div>
          </div>
        </div>

        {/* Tabs Control */}
        <Tabs defaultValue="portfolio" className="space-y-8">
          <TabsList className="bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl h-11 border border-slate-200/40 dark:border-slate-700/40">
            <TabsTrigger value="portfolio" className="rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-2 transition-all duration-200 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
              <Wallet className="h-4 w-4" />
              Wallet & Tokens
            </TabsTrigger>
            <TabsTrigger value="settings" className="rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-2 transition-all duration-200 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
              <Settings className="h-4 w-4" />
              Account Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="portfolio" className="space-y-6 focus-visible:outline-none">
            {/* Network Selector Row */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/50 rounded-2xl p-4 shadow-sm">
              <NetworkSelector
                selectedChainId={selectedChainId}
                onSelectChain={setSelectedChainId}
              />
            </div>

            {/* Top Section - 3-Column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 lg:items-start">
              {/* Left Column - Wallet Identity */}
              <div className="flex flex-col h-full">
                <WalletIdentityCard
                  address={primaryAddress}
                  walletType={walletType as 'embedded' | 'connected'}
                  allAddresses={allAddresses}
                  chainId={primaryChainId}
                />
              </div>

              {/* Middle Column - Token Balances */}
              <div className="flex flex-col h-full">
                <TokenBalancesCard
                  address={primaryAddress}
                  selectedChain={selectedChainId}
                />
              </div>

              {/* Right Column - Send Tokens */}
              <div className="flex flex-col h-full">
                <TransferTokenCard
                  address={primaryAddress}
                  chainId={selectedChainId}
                />
              </div>
            </div>

            {/* DG Redemption Card */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
              <div className="flex flex-col h-full">
                <DgRedemptionCard address={primaryAddress} chainId={selectedChainId} />
              </div>
            </div>

            {/* Bottom Section - Full-Width Transaction History */}
            <TransactionHistoryCard address={primaryAddress} chainId={selectedChainId} />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6 focus-visible:outline-none">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 lg:items-start">
              {/* Left Column: Player Name & Telegram Notifications */}
              <div className="space-y-6 lg:space-y-8 flex flex-col h-full">
                <PlayerNameCard />
                <TelegramNotificationsCard />
              </div>

              {/* Right Column: Bank Details */}
              <div id="bank-details" className="flex flex-col h-full scroll-mt-24">
                <UserPayoutAccountCard />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Profile;
