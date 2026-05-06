import React, { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import type { PublishedEvent } from '@/types/event';
import { checkIfLockManager, updateLockPurchasability } from '@/utils/lockUtils';
import {
  cancelAndRefundProtectedEvent,
  getLockWithdrawableBalance,
  releaseProtectedEventManager,
  withdrawLockBalance,
} from '@/utils/lockUtils';
import { getEventRegistrationStatus, isEventRegistrationClosed } from '@/lib/events/registration';
import { supabase } from '@/integrations/supabase/client';
import {
  ExternalLink,
  Copy,
  AlertTriangle,
  Loader2,
  CreditCard,
  Users,
  UserCheck,
  Eye,
  Lock,
  Info,
  Image,
  Shield,
  Wallet,
  Zap,
  Settings2,
  FileText,
  ShieldCheck,
  LayoutDashboard
} from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { AllowListManager } from './AllowListManager';
import { WaitlistManager } from './WaitlistManager';
import { ServiceManagerControls } from '@/components/shared/ServiceManagerControls';
import { EventManagersPanel } from './EventManagersPanel';
import { EventPurchaseMessageSection } from './EventPurchaseMessageSection';
import { EventPurchaseFormSection } from './EventPurchaseFormSection';
import { EventPurchaseResponsesSection } from './EventPurchaseResponsesSection';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { base, baseSepolia } from 'wagmi/chains';
import { getDivviBrowserProvider } from '@/lib/wallet/provider';
import { useUserAddresses } from '@/hooks/useUserAddresses';
import { useRefundableEventStatus } from '@/hooks/useRefundableEventStatus';
import { getRefundProtectionBadge } from '@/lib/events/refundStatus';
import { useEventManagerPermissions } from '@/hooks/useEventManagerPermissions';

interface EventManagementDialogProps {
  event: PublishedEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventUpdated: () => void;
}

export const EventManagementDialog: React.FC<EventManagementDialogProps> = ({
  event,
  open,
  onOpenChange,
  onEventUpdated,
}) => {
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const userAddresses = useUserAddresses();
  const { toast } = useToast();

  const [allowListManagerOpen, setAllowListManagerOpen] = useState(false);
  const [waitlistManagerOpen, setWaitlistManagerOpen] = useState(false);
  const [localAllowWaitlist, setLocalAllowWaitlist] = useState(event.allow_waitlist);
  const [isUpdatingWaitlist, setIsUpdatingWaitlist] = useState(false);
  const [isUpdatingMetadata, setIsUpdatingMetadata] = useState(false);
  const [isUpdatingRegistration, setIsUpdatingRegistration] = useState(false);
  const [isLockManager, setIsLockManager] = useState(false);
  const [isReleasingProtected, setIsReleasingProtected] = useState(false);
  const [isRefundingProtected, setIsRefundingProtected] = useState(false);
  const [isWithdrawingLockBalance, setIsWithdrawingLockBalance] = useState(false);
  const [withdrawableBalance, setWithdrawableBalance] = useState<string | null>(null);
  const [localRegistrationClosed, setLocalRegistrationClosed] = useState(() =>
    isEventRegistrationClosed(event)
  );
  const [pendingRegistrationClosed, setPendingRegistrationClosed] = useState<boolean | null>(null);
  const { networks } = useNetworkConfigs();

  const networkConfig = networks.find(n => n.chain_id === event.chain_id);
  const networkLabel =
    networkConfig?.chain_name ||
    (event.chain_id === base.id ? 'Base' : event.chain_id === baseSepolia.id ? 'Base Sepolia' : 'Network');
  const refundableStatus = useRefundableEventStatus(
    event.refund_protection_enabled ? event : null,
    userAddresses
  );
  const eventAccess = useEventManagerPermissions(event.id);
  const isManagementAccessLoading = open && (!eventAccess.checked || eventAccess.loading);
  const canManageSensitiveControls = eventAccess.isCreator || isLockManager;
  const canManageAccess = eventAccess.canManageAccess;
  const canManageWaitlist = eventAccess.canManageWaitlist;
  const canManageManagers = eventAccess.canManageManagers;
  const refundBadge = getRefundProtectionBadge(refundableStatus.status || event.refund_status, 'creator');
  const creatorMatchesWallet = Boolean(
    wallet?.address &&
    refundableStatus.creatorAddress &&
    wallet.address.toLowerCase() === refundableStatus.creatorAddress.toLowerCase()
  );
  const signerMatchesAuthorizedRefundCaller = Boolean(
    wallet?.address &&
    refundableStatus.authorizedRefundAddress &&
    wallet.address.toLowerCase() === refundableStatus.authorizedRefundAddress.toLowerCase()
  );
  const canRecoverOrReleaseManager = Boolean(
    event.refund_protection_enabled &&
    creatorMatchesWallet &&
    !isLockManager &&
    (refundableStatus.status === 'threshold_met' || refundableStatus.refundComplete)
  );
  const canWithdrawLockBalance = Boolean(
    event.refund_protection_enabled &&
    creatorMatchesWallet &&
    isLockManager &&
    refundableStatus.status !== 'protected'
  );
  const registrationStatus = getEventRegistrationStatus(event);
  const hasEventStarted = registrationStatus.reason === 'event_started';
  const registrationStatusDescription = hasEventStarted
    ? 'Registration is closed because the event has already started.'
    : localRegistrationClosed
      ? 'Registration is closed because the registration cutoff has passed. You can reopen it until the event starts.'
      : 'Manually disable or re-open registrations on the blockchain.';
  const explorerBase =
    networkConfig?.block_explorer_url ||
    (event.chain_id === base.id
      ? 'https://basescan.org'
      : event.chain_id === baseSepolia.id
        ? 'https://sepolia.basescan.org'
        : undefined);

  // Check if current user is a lock manager
  const refreshLockManagerState = async () => {
    if (!wallet || !open) {
      setIsLockManager(false);
      return;
    }

    try {
      const ethersProvider = await getDivviBrowserProvider(wallet);
      const signer = await ethersProvider.getSigner();
      const userAddress = await signer.getAddress();

      const isManager = await checkIfLockManager(event.lock_address, userAddress, event.chain_id);
      setIsLockManager(isManager);
    } catch (error) {
      console.error('Error checking user lock manager status:', error);
      setIsLockManager(false);
    }
  };

  const refreshWithdrawableBalance = useCallback(async () => {
    if (!open || !canWithdrawLockBalance) {
      setWithdrawableBalance(null);
      return;
    }

    try {
      const { balance, decimals } = await getLockWithdrawableBalance(event.lock_address, event.chain_id);
      setWithdrawableBalance(ethers.formatUnits(balance, decimals));
    } catch (error) {
      console.error('Error loading withdrawable lock balance:', error);
      setWithdrawableBalance(null);
    }
  }, [open, canWithdrawLockBalance, event.lock_address, event.chain_id]);

  useEffect(() => {
    void refreshLockManagerState();
  }, [wallet, event.lock_address, event.chain_id, open]);

  useEffect(() => {
    void refreshWithdrawableBalance();
  }, [refreshWithdrawableBalance, refundableStatus.status, refundableStatus.refundComplete]);

  // Sync local state with prop changes
  useEffect(() => {
    setLocalAllowWaitlist(event.allow_waitlist);
  }, [event.allow_waitlist]);

  useEffect(() => {
    setLocalRegistrationClosed(isEventRegistrationClosed(event));
    setPendingRegistrationClosed(null);
  }, [event.id, event.registration_cutoff, event.starts_at, event.date]);

  const handleToggleRegistration = async (isOpening: boolean) => {
    if (!wallets[0]) {
      toast({ title: 'Wallet not connected', variant: 'destructive' });
      return;
    }

    setIsUpdatingRegistration(true);
    const previousClosed = localRegistrationClosed;
    try {
      const isClosing = !isOpening;
      setPendingRegistrationClosed(isClosing);

      // 1. Koordinat with Blockchain
      toast({ title: isClosing ? 'Closing registration on-chain...' : 'Opening registration on-chain...', description: 'Please confirm the transaction in your wallet.' });

      const txResult = await updateLockPurchasability(
        event.lock_address,
        isClosing,
        event.capacity,
        event.chain_id,
        wallets[0]
      );

      if (!txResult.success) {
        throw new Error(txResult.error || 'Blockchain transaction failed');
      }

      // 2. Update Database via Edge Function
      const accessToken = await getAccessToken?.();
      toast({
        title: 'Syncing registration status...',
        description: 'Updating registration status in the database.',
      });

      // Re-open logic: default to 1h before start, but use starts_at if already late
      if (!event.starts_at) {
        throw new Error('Event start time is not set');
      }

      const startsAtTime = new Date(event.starts_at).getTime();
      const defaultCutoff = new Date(startsAtTime - 3600000);
      const now = new Date();

      // Prevent re-opening if event has already started
      if (isOpening && now >= new Date(event.starts_at)) {
        throw new Error('Cannot re-open registration after event has started');
      }

      let newCutoff;
      if (isClosing) {
        newCutoff = now.toISOString();
      } else {
        // If re-opening, set to starts_at if we're already past the 1h margin
        newCutoff = now > defaultCutoff ? event.starts_at : defaultCutoff.toISOString();
      }

      const { error } = await supabase.functions.invoke('update-event', {
        body: {
          eventId: event.id,
          formData: { registration_cutoff: newCutoff }
        },
        headers: accessToken ? { 'X-Privy-Authorization': `Bearer ${accessToken}` } : undefined,
      });

      if (error) throw error;

      setLocalRegistrationClosed(isClosing);
      setPendingRegistrationClosed(null);
      toast({
        title: isClosing ? 'Registration Closed' : 'Registration Re-opened',
        description: isClosing ? 'On-chain purchases are now blocked.' : 'Registration is now active.'
      });
      onEventUpdated();
    } catch (error: any) {
      console.error('Error toggling registration:', error);
      setLocalRegistrationClosed(previousClosed);
      setPendingRegistrationClosed(null);
      toast({
        title: 'Update Failed',
        description: error.message || 'An error occurred',
        variant: 'destructive'
      });
    } finally {
      setIsUpdatingRegistration(false);
    }
  };

  const handleUpdateMetadata = async () => {
    if (!wallets[0]) {
      toast({
        title: 'No wallet',
        description: 'Please connect your wallet',
        variant: 'destructive'
      });
      return;
    }

    setIsUpdatingMetadata(true);
    try {
      const { setLockMetadata, getBaseTokenURI, TEEREX_NFT_SYMBOL } = await import('@/utils/lockMetadata');

      const ethersProvider = await getDivviBrowserProvider(wallets[0]);
      const signer = await ethersProvider.getSigner();

      const baseTokenURI = getBaseTokenURI(event.lock_address);

      const result = await setLockMetadata(
        event.lock_address,
        event.title,
        TEEREX_NFT_SYMBOL,
        baseTokenURI,
        signer
      );

      if (result.success) {
        const accessToken = await getAccessToken();

        const { data, error } = await supabase.functions.invoke('update-event', {
          body: {
            eventId: event.id,
            formData: {
              nft_metadata_set: true,
              nft_base_uri: baseTokenURI
            }
          },
          headers: accessToken ? { 'X-Privy-Authorization': `Bearer ${accessToken}` } : undefined,
        });

        if (error) {
          throw new Error(error.message);
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        toast({
          title: 'Success',
          description: 'NFT metadata updated successfully. Your event images will now appear on OpenSea and other marketplaces.'
        });
        onEventUpdated();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error('Error updating metadata:', error);
      toast({
        title: 'Failed to update metadata',
        description: error.message || 'An error occurred',
        variant: 'destructive'
      });
    } finally {
      setIsUpdatingMetadata(false);
    }
  };

  const handleToggleWaitlist = async (enabled: boolean) => {
    setIsUpdatingWaitlist(true);
    try {
      const accessToken = await getAccessToken();
      const { error } = await supabase.functions.invoke('update-event', {
        body: {
          eventId: event.id,
          formData: { allow_waitlist: enabled }
        },
        headers: accessToken ? { 'X-Privy-Authorization': `Bearer ${accessToken}` } : undefined,
      });

      if (error) {
        throw new Error('Failed to update waitlist setting');
      }

      setLocalAllowWaitlist(enabled);

      toast({
        title: enabled ? "Waitlist Enabled" : "Waitlist Disabled",
        description: enabled
          ? "Users can now join the waitlist when your event is sold out."
          : "Users can no longer join the waitlist for this event.",
      });

      onEventUpdated();
    } catch (error) {
      console.error('Error updating waitlist setting:', error);
      toast({
        title: "Failed to Update Setting",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    } finally {
      setIsUpdatingWaitlist(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Address copied to clipboard",
    });
  };

  const hasFiatPayment = event.payment_methods?.includes('fiat');
  const showWarning = hasFiatPayment && !event.service_manager_added && canManageSensitiveControls;

  const refreshProtectedControls = async (txHash?: string) => {
    await refundableStatus.refresh(txHash);
    await refreshLockManagerState();
    onEventUpdated();
  };

  const handleReleaseProtected = async () => {
    if (!wallet) {
      toast({ title: 'Wallet not connected', variant: 'destructive' });
      return;
    }

    setIsReleasingProtected(true);
    try {
      const result = await releaseProtectedEventManager(
        event.lock_address,
        refundableStatus.controllerAddress || event.refund_controller_address || '',
        wallet,
        event.chain_id
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to release lock control');
      }

      toast({
        title: refundableStatus.refundComplete ? 'Lock control returned' : 'Lock control released',
        description: refundableStatus.refundComplete
          ? 'Creator lock-manager control has been restored after refunds completed.'
          : 'Creator lock-manager control has been released for this event.',
      });

      await refreshProtectedControls(result.transactionHash);
    } catch (error) {
      toast({
        title: 'Release failed',
        description: error instanceof Error ? error.message : 'Failed to release lock control',
        variant: 'destructive',
      });
    } finally {
      setIsReleasingProtected(false);
    }
  };

  const handleRefundProtected = async () => {
    if (!wallet) {
      toast({ title: 'Wallet not connected', variant: 'destructive' });
      return;
    }

    setIsRefundingProtected(true);
    try {
      const result = await cancelAndRefundProtectedEvent(
        event.lock_address,
        refundableStatus.controllerAddress || event.refund_controller_address || '',
        wallet,
        event.chain_id,
        50
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to process refunds');
      }

      toast({ title: 'Refund transaction confirmed' });
      await refreshProtectedControls(result.transactionHash);
    } catch (error) {
      toast({
        title: 'Refund failed',
        description: error instanceof Error ? error.message : 'Failed to process refunds',
        variant: 'destructive',
      });
    } finally {
      setIsRefundingProtected(false);
    }
  };

  const handleWithdrawLockBalance = async () => {
    if (!wallet?.address) {
      toast({ title: 'Wallet not connected', variant: 'destructive' });
      return;
    }

    setIsWithdrawingLockBalance(true);
    try {
      const result = await withdrawLockBalance(
        event.lock_address,
        wallet.address,
        wallet,
        event.chain_id
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to withdraw lock balance');
      }

      toast({
        title: 'Lock balance withdrawn',
        description: 'Available funds were withdrawn from the lock to your connected wallet.',
      });
      setWithdrawableBalance('0');
      await refreshProtectedControls(result.transactionHash);
      void refreshWithdrawableBalance();
    } catch (error) {
      toast({
        title: 'Withdraw failed',
        description: error instanceof Error ? error.message : 'Failed to withdraw lock balance',
        variant: 'destructive',
      });
    } finally {
      setIsWithdrawingLockBalance(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="p-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold tracking-tight">Manage Event</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Configure event settings, manage access, and review responses
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 pb-6">

        {isManagementAccessLoading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <div className="flex flex-col items-center text-center animate-in fade-in duration-500">
              <div className="relative">
                <div className="absolute inset-0 blur-xl bg-purple-200 rounded-full animate-pulse" />
                <Loader2 className="relative mb-4 h-10 w-10 animate-spin text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Fetching permissions</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Securing your management session...
              </p>
            </div>
          </div>
        ) : (
        <div className="w-full">
          <Tabs defaultValue="general" className="w-full">
            <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md pt-2 pb-4 -mx-1 px-1">
              <TabsList className="grid w-full grid-cols-4 p-1 bg-gray-100/50 rounded-xl border border-gray-100">
                <TabsTrigger value="general" className="group flex items-center gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-[0_2px_8px_rgba(0,0,0,0.12)] data-[state=active]:border data-[state=active]:border-gray-200/60 data-[state=inactive]:text-gray-400 transition-all duration-200 py-2">
                  <Settings2 className="w-4 h-4 group-data-[state=active]:text-purple-600" />
                  <span className="hidden sm:inline font-medium">General</span>
                </TabsTrigger>
                <TabsTrigger value="access" className="group flex items-center gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-[0_2px_8px_rgba(0,0,0,0.12)] data-[state=active]:border data-[state=active]:border-gray-200/60 data-[state=inactive]:text-gray-400 transition-all duration-200 py-2">
                  <Users className="w-4 h-4 group-data-[state=active]:text-purple-600" />
                  <span className="hidden sm:inline font-medium">Access</span>
                </TabsTrigger>
                <TabsTrigger value="checkout" className="group flex items-center gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-[0_2px_8px_rgba(0,0,0,0.12)] data-[state=active]:border data-[state=active]:border-gray-200/60 data-[state=inactive]:text-gray-400 transition-all duration-200 py-2">
                  <FileText className="w-4 h-4 group-data-[state=active]:text-purple-600" />
                  <span className="hidden sm:inline font-medium">Checkout</span>
                </TabsTrigger>
                <TabsTrigger value="advanced" className="group flex items-center gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-[0_2px_8px_rgba(0,0,0,0.12)] data-[state=active]:border data-[state=active]:border-gray-200/60 data-[state=inactive]:text-gray-400 transition-all duration-200 py-2">
                  <ShieldCheck className="w-4 h-4 group-data-[state=active]:text-purple-600" />
                  <span className="hidden sm:inline font-medium">Advanced</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="general" className="space-y-4 outline-none">
              {/* Warning Banner */}
              {showWarning && (
                <Card className="border-orange-200 bg-orange-50/50 shadow-none">
                  <CardContent className="pt-6">
                    <div className="flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-orange-900 mb-1">
                          Fiat Payments Not Working
                        </h4>
                        <p className="text-sm text-orange-800">
                          You have enabled fiat payments, but the service manager has not been added.
                          Customers won't be able to purchase tickets with fiat currency until you add the service manager.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Registration Status */}
              {canManageSensitiveControls && (
                <Card className="border-none shadow-sm bg-gray-50/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Lock className="w-4 h-4 text-purple-600" />
                          <span className="font-semibold text-gray-900">Registration Status</span>
                          {pendingRegistrationClosed !== null ? (
                            <Badge variant="secondary" className="animate-pulse">
                              {pendingRegistrationClosed ? 'Closing…' : 'Opening…'}
                            </Badge>
                          ) : localRegistrationClosed ? (
                            <Badge variant="destructive">Closed</Badge>
                          ) : (
                            <Badge variant="default" className="bg-green-600">Open</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {registrationStatusDescription}
                        </p>
                      </div>
                      <Switch
                        checked={!localRegistrationClosed}
                        onCheckedChange={handleToggleRegistration}
                        disabled={isUpdatingRegistration || !isLockManager || (localRegistrationClosed && hasEventStarted)}
                      />
                    </div>
                    {!isLockManager && (
                      <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Lock manager permission required
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Visibility & Access Settings */}
              {canManageSensitiveControls && (
                <Card className="border-none shadow-sm bg-gray-50/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Eye className="w-5 h-5 text-purple-600" />
                      <h3 className="font-semibold text-gray-900">Visibility & Access</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Public Event</p>
                          <p className="text-sm font-semibold text-gray-900">{event.is_public ? "Yes" : "No"}</p>
                        </div>
                        <Badge variant={event.is_public ? "default" : "secondary"} className={event.is_public ? "bg-green-100 text-green-700 hover:bg-green-100 border-none" : ""}>
                          {event.is_public ? "Visible" : "Hidden"}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Allow List</p>
                          <p className="text-sm font-semibold text-gray-900">{event.has_allow_list ? "Enabled" : "Disabled"}</p>
                        </div>
                        <Badge variant="secondary" className={event.has_allow_list ? "bg-blue-100 text-blue-700 hover:bg-blue-100 border-none" : ""}>
                          {event.has_allow_list ? "Private" : "Public"}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-gray-900">Allow Waitlist</span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Let users join when tickets are sold out
                        </p>
                      </div>
                      <Switch
                        checked={localAllowWaitlist}
                        onCheckedChange={handleToggleWaitlist}
                        disabled={isUpdatingWaitlist}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payment Methods */}
              {canManageSensitiveControls && (
                <Card className="border-none shadow-sm bg-gray-50/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <CreditCard className="w-5 h-5 text-purple-600" />
                      <h3 className="font-semibold text-gray-900">Payment Methods</h3>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-100 flex-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-sm font-medium">Crypto</span>
                        <Badge variant="outline" className="ml-auto text-[10px] border-blue-200 text-blue-600">Active</Badge>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-100 flex-1">
                        <div className={`w-2 h-2 rounded-full ${hasFiatPayment ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className="text-sm font-medium">Fiat</span>
                        <Badge variant="outline" className={`ml-auto text-[10px] ${hasFiatPayment ? 'border-green-200 text-green-600' : 'border-gray-200 text-gray-400'}`}>
                          {hasFiatPayment ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Event Info */}
              {canManageAccess && (
                <Card className="border-none shadow-sm bg-gray-50/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Info className="w-5 h-5 text-purple-600" />
                      <h3 className="font-semibold text-gray-900">Technical Details</h3>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Contract:</span>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-white px-2 py-1 rounded border border-gray-100 font-mono">
                            {event.lock_address.slice(0, 6)}...{event.lock_address.slice(-4)}
                          </code>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyToClipboard(event.lock_address)}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Network:</span>
                        <Badge variant="secondary" className="font-normal">{networkLabel}</Badge>
                      </div>
                      {explorerBase && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Blockchain:</span>
                          <a href={`${explorerBase.replace(/\/$/, '')}/tx/${event.transaction_hash}`} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline flex items-center gap-1 font-medium">
                            View Transaction <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="access" className="space-y-4 outline-none">
              <EventManagersPanel event={event} enabled={canManageManagers} />

              <Card className="border-none shadow-sm bg-gray-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <UserCheck className="w-5 h-5 text-purple-600" />
                    <h3 className="font-semibold text-gray-900">Allow List</h3>
                  </div>
                  {event.has_allow_list ? (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        This is a private event. Only approved wallets can purchase tickets.
                      </p>
                      <Button onClick={() => setAllowListManagerOpen(true)} className="w-full bg-white text-gray-900 border-gray-200 hover:bg-gray-50 shadow-none" variant="outline">
                        Manage Approved Attendees
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-200">
                      <p className="text-sm text-muted-foreground">Allow list is not enabled for this event.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm bg-gray-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-5 h-5 text-purple-600" />
                    <h3 className="font-semibold text-gray-900">Waitlist</h3>
                  </div>
                  {localAllowWaitlist ? (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        View and manage users who signed up after tickets sold out.
                      </p>
                      <Button onClick={() => setWaitlistManagerOpen(true)} className="w-full bg-white text-gray-900 border-gray-200 hover:bg-gray-50 shadow-none" variant="outline">
                        View Waitlist
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-200">
                      <p className="text-sm text-muted-foreground">Waitlist is currently disabled.</p>
                      <p className="text-xs text-gray-400 mt-1">Enable it in the General tab.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="checkout" className="space-y-4 outline-none">
              {eventAccess.isCreator && (
                <div className="space-y-4">
                  <EventPurchaseFormSection
                    event={event}
                    isCreator={eventAccess.isCreator}
                    onEventUpdated={onEventUpdated}
                  />
                  <EventPurchaseResponsesSection event={event} />
                  <EventPurchaseMessageSection
                    event={event}
                    isCreator={eventAccess.isCreator}
                    onEventUpdated={onEventUpdated}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4 outline-none">
              {/* NFT Metadata */}
              {canManageSensitiveControls && (
                <Card className="border-none shadow-sm bg-gray-50/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Image className="w-5 h-5 text-purple-600" />
                        <h3 className="font-semibold text-gray-900">NFT Metadata</h3>
                      </div>
                      <Badge variant={event.nft_metadata_set ? 'default' : 'secondary'} className={event.nft_metadata_set ? "bg-purple-100 text-purple-700 hover:bg-purple-100 border-none" : ""}>
                        {event.nft_metadata_set ? 'Synchronized' : 'Pending'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Update NFT images and metadata to ensure they display correctly on marketplaces.
                    </p>
                    <Button
                      onClick={handleUpdateMetadata}
                      disabled={isUpdatingMetadata || !isLockManager}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-100"
                    >
                      {isUpdatingMetadata ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Updating Blockchain...</>
                      ) : (
                        'Update Marketplace Metadata'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Service Manager Controls */}
              {canManageSensitiveControls && (
                <ServiceManagerControls
                  entityType="event"
                  entityId={event.id}
                  lockAddress={event.lock_address}
                  chainId={event.chain_id}
                  canManage={isLockManager}
                  initialAdded={event.service_manager_added}
                  onUpdated={onEventUpdated}
                />
              )}

              {/* Protected Event Controls */}
              {event.refund_protection_enabled && canManageSensitiveControls && (
                <Card className="border-none shadow-sm bg-gray-50/50">
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Shield className="w-5 h-5 text-purple-600" />
                      <h3 className="font-semibold text-gray-900">Protection & Refunds</h3>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {refundableStatus.attendeeCount || 0} / {refundableStatus.minAttendees || event.refund_min_attendees || 0} Attendees
                        </p>
                      </div>
                      <Badge variant="outline" className={refundBadge.className}>
                        {refundBadge.label}
                      </Badge>
                    </div>

                    {canRecoverOrReleaseManager && (
                      <Button className="w-full bg-white text-gray-900 border-gray-200 hover:bg-gray-50" variant="outline" onClick={handleReleaseProtected} disabled={isReleasingProtected}>
                        {isReleasingProtected ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2 text-yellow-500" />}
                        {refundableStatus.refundComplete ? 'Return Lock Control' : 'Release Lock Control'}
                      </Button>
                    )}

                    {(refundableStatus.status === 'refund_available' || refundableStatus.status === 'refund_in_progress' || refundableStatus.status === 'creator_only_refund_window') && (
                      <Button variant="destructive" className="w-full shadow-md shadow-red-50" onClick={handleRefundProtected} disabled={isRefundingProtected || !refundableStatus.authorizedRefundCaller || !signerMatchesAuthorizedRefundCaller}>
                        {isRefundingProtected ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                        {refundableStatus.status === 'refund_in_progress' ? 'Continue Refunds' : 'Cancel Event & Refund All'}
                      </Button>
                    )}

                    <div className="p-4 bg-white rounded-xl border border-gray-100 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                        <Wallet className="w-4 h-4 text-purple-600" />
                        Withdraw Funds
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Available: {withdrawableBalance || '0.00'} {event.currency}
                      </p>
                      <Button variant="outline" className="w-full text-xs h-9 bg-gray-50 border-none hover:bg-gray-100" onClick={handleWithdrawLockBalance} disabled={isWithdrawingLockBalance || !canWithdrawLockBalance}>
                        {isWithdrawingLockBalance ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Withdraw to Wallet'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
        )}
        </div>
      </DialogContent>

      {/* Management Dialogs */}
      <AllowListManager
        event={event}
        isOpen={allowListManagerOpen}
        onClose={() => setAllowListManagerOpen(false)}
      />

      <WaitlistManager
        event={event}
        isOpen={waitlistManagerOpen}
        onClose={() => setWaitlistManagerOpen(false)}
      />
    </Dialog>
  );
};
