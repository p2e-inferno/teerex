import React, { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
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
import { checkIfLockManager } from '@/utils/lockUtils';
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
  Image
} from 'lucide-react';
import { AllowListManager } from './AllowListManager';
import { WaitlistManager } from './WaitlistManager';
import { ServiceManagerControls } from '@/components/shared/ServiceManagerControls';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { base, baseSepolia } from 'wagmi/chains';
import { getDivviBrowserProvider } from '@/lib/wallet/provider';

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
  const { toast } = useToast();

  const [allowListManagerOpen, setAllowListManagerOpen] = useState(false);
  const [waitlistManagerOpen, setWaitlistManagerOpen] = useState(false);
  const [localAllowWaitlist, setLocalAllowWaitlist] = useState(event.allow_waitlist);
  const [isUpdatingWaitlist, setIsUpdatingWaitlist] = useState(false);
  const [isUpdatingMetadata, setIsUpdatingMetadata] = useState(false);
  const [isLockManager, setIsLockManager] = useState(false);
  const { networks } = useNetworkConfigs();

  const networkConfig = networks.find(n => n.chain_id === event.chain_id);
  const networkLabel =
    networkConfig?.chain_name ||
    (event.chain_id === base.id ? 'Base' : event.chain_id === baseSepolia.id ? 'Base Sepolia' : 'Network');
  const explorerBase =
    networkConfig?.block_explorer_url ||
    (event.chain_id === base.id
      ? 'https://basescan.org'
      : event.chain_id === baseSepolia.id
      ? 'https://sepolia.basescan.org'
      : undefined);

  // Check if current user is a lock manager
  useEffect(() => {
    const checkUserLockManager = async () => {
      if (!wallets[0] || !open) return;

      try {
        const ethersProvider = await getDivviBrowserProvider(wallets[0]);
        const signer = await ethersProvider.getSigner();
        const userAddress = await signer.getAddress();

        const isManager = await checkIfLockManager(event.lock_address, userAddress, event.chain_id);
        setIsLockManager(isManager);
      } catch (error) {
        console.error('Error checking user lock manager status:', error);
      }
    };

    checkUserLockManager();
  }, [wallets, event.lock_address, open]);

  // Sync local state with prop changes
  useEffect(() => {
    setLocalAllowWaitlist(event.allow_waitlist);
  }, [event.allow_waitlist]);

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
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

        const { data, error } = await supabase.functions.invoke('update-event', {
          body: {
            eventId: event.id,
            formData: {
              nft_metadata_set: true,
              nft_base_uri: baseTokenURI
            }
          },
          headers: {
            Authorization: `Bearer ${anonKey}`,
            'X-Privy-Authorization': `Bearer ${accessToken}`,
          },
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
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const { error } = await supabase.functions.invoke('update-event', {
        body: {
          eventId: event.id,
          formData: { allow_waitlist: enabled }
        },
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${accessToken}`,
        },
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
  const showWarning = hasFiatPayment && !event.service_manager_added;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Event</DialogTitle>
          <DialogDescription>
            Configure service wallet access and payment methods
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Warning Banner */}
          {showWarning && (
            <Card className="border-orange-200 bg-orange-50">
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

          {/* Visibility & Access Settings */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Visibility & Access Settings</h3>
              </div>

              <div className="space-y-4">
                {/* Public Event - Read Only */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">Public Event</span>
                      <Lock className="w-3 h-3 text-gray-400" />
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      Anyone can find and attend this event
                    </p>
                  </div>
                  <Badge variant={event.is_public ? "default" : "secondary"} className={event.is_public ? "bg-green-600" : "bg-gray-400"}>
                    {event.is_public ? "Yes" : "No"}
                  </Badge>
                </div>

                {/* Private Event (Allow List) - Read Only */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">Private Event (Allow List)</span>
                      <Lock className="w-3 h-3 text-gray-400" />
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      Only approved wallet addresses can purchase tickets
                    </p>
                  </div>
                  <Badge variant={event.has_allow_list ? "default" : "secondary"} className={event.has_allow_list ? "bg-blue-600" : "bg-gray-400"}>
                    {event.has_allow_list ? "Enabled" : "Disabled"}
                  </Badge>
                </div>

                {/* Allow Waitlist - Editable */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">Allow Waitlist</span>
                    <p className="text-xs text-gray-600 mt-1">
                      Let users join a waitlist when tickets are sold out
                    </p>
                  </div>
                  <Switch
                    checked={localAllowWaitlist}
                    onCheckedChange={handleToggleWaitlist}
                    disabled={isUpdatingWaitlist}
                  />
                </div>

                {/* Info Box */}
                <div className="flex gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-800">
                    <strong>Note:</strong> Public Event and Allow List settings are locked after event creation to maintain blockchain integrity. Only the Waitlist setting can be changed.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <ServiceManagerControls
            entityType="event"
            entityId={event.id}
            lockAddress={event.lock_address}
            chainId={event.chain_id}
            canManage={isLockManager}
            initialAdded={event.service_manager_added}
            onUpdated={onEventUpdated}
          />

          {/* Payment Methods */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Payment Methods</h3>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Crypto Payments:</span>
                  <Badge variant="default" className="bg-blue-600">Enabled</Badge>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Fiat Payments:</span>
                  {hasFiatPayment ? (
                    <Badge variant="default" className="bg-green-600">Enabled</Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-gray-200">Disabled</Badge>
                  )}
                </div>

                {hasFiatPayment && !event.service_manager_added && (
                  <p className="text-xs text-orange-600 mt-2">
                    ⚠️ Add service manager to activate fiat payments
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* NFT Metadata */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    <span className="font-medium">NFT Metadata</span>
                    <Badge variant={event.nft_metadata_set ? 'default' : 'secondary'}>
                      {event.nft_metadata_set ? 'Set' : 'Not Set'}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600">
                    Update NFT images and metadata for marketplaces like OpenSea
                  </p>
                </div>
                <Button
                  onClick={handleUpdateMetadata}
                  disabled={isUpdatingMetadata || !isLockManager}
                  size="sm"
                >
                  {isUpdatingMetadata ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Metadata'
                  )}
                </Button>
              </div>
              {!isLockManager && (
                <p className="text-xs text-orange-600 mt-2">
                  ⚠️ You must be a lock manager to update metadata
                </p>
              )}
            </CardContent>
          </Card>

          {/* Event Info */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold text-gray-900 mb-3">Event Information</h3>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Lock Address:</span>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {event.lock_address.slice(0, 6)}...{event.lock_address.slice(-4)}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(event.lock_address)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Network:</span>
                  <Badge variant="outline">{networkLabel}</Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Transaction:</span>
                  {explorerBase ? (
                    <a
                      href={`${explorerBase.replace(/\/$/, '')}/tx/${event.transaction_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                    >
                      <span className="text-xs">View</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-gray-500">No explorer configured</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Allow List Management */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <UserCheck className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Allow List Management</h3>
              </div>

              {event.has_allow_list ? (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    This is a private event. Only wallet addresses on the allow list can purchase tickets.
                  </p>

                  <Button
                    onClick={() => setAllowListManagerOpen(true)}
                    className="w-full"
                    variant="outline"
                  >
                    <UserCheck className="w-4 h-4 mr-2" />
                    Manage Allow List
                  </Button>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-600 mb-2">
                    Allow list is not enabled for this event.
                  </p>
                  <p className="text-xs text-gray-500">
                    This setting cannot be changed after event creation.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Waitlist Management */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Waitlist Management</h3>
              </div>

              {localAllowWaitlist ? (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    View users who have joined the waitlist for this event.
                  </p>

                  <Button
                    onClick={() => setWaitlistManagerOpen(true)}
                    className="w-full"
                    variant="outline"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    View Waitlist
                  </Button>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-600 mb-2">
                    Waitlist is not enabled for this event.
                  </p>
                  <p className="text-xs text-gray-500">
                    Enable waitlist in "Visibility & Access Settings" above to allow users to join when sold out.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
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
