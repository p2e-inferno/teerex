import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { WalletIdentityCard } from '@/components/profile/WalletIdentityCard';
import { TokenBalancesCard } from '@/components/profile/TokenBalancesCard';
import { TransferTokenCard } from '@/components/profile/TransferTokenCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Loader2, User } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';

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
  const { login } = usePrivy();
  const {
    primaryAddress,
    allAddresses,
    walletType,
    isLoading,
    isAuthenticated,
  } = useUserProfile();
  const { activeNetworks } = useNetworkConfigs();

  // Use first active network or default to Base Mainnet (8453)
  const primaryChainId = activeNetworks?.[0]?.chain_id || 8453;

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
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Page Header */}
        <div className="mb-8 sm:mb-12">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-xl shadow-violet-500/20">
              <User className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                My Profile
              </h1>
              <p className="text-slate-500 mt-1">
                Manage your wallet, view balances, and send tokens
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
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
            <TokenBalancesCard address={primaryAddress} />
          </div>

          {/* Right Column - Send Tokens */}
          <div className="flex flex-col h-full">
            <TransferTokenCard address={primaryAddress} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
