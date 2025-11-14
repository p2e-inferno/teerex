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
import { PublishedEvent } from '@/utils/eventUtils';
import { checkIfLockManager, addLockManager } from '@/utils/lockUtils';
import { supabase } from '@/integrations/supabase/client';
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  AlertTriangle,
  Loader2,
  Shield,
  CreditCard,
  Users,
  UserCheck,
  Eye,
  Lock,
  Info
} from 'lucide-react';
import { AllowListManager } from './AllowListManager';
import { WaitlistManager } from './WaitlistManager';

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

  const [serviceWalletAddress, setServiceWalletAddress] = useState<string>('');
  const [isServiceManager, setIsServiceManager] = useState<boolean>(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isAddingManager, setIsAddingManager] = useState(false);
  const [isRemovingManager, setIsRemovingManager] = useState(false);
  const [localServiceManagerAdded, setLocalServiceManagerAdded] = useState(event.service_manager_added);
  const [allowListManagerOpen, setAllowListManagerOpen] = useState(false);
  const [waitlistManagerOpen, setWaitlistManagerOpen] = useState(false);
  const [localAllowWaitlist, setLocalAllowWaitlist] = useState(event.allow_waitlist);
  const [isUpdatingWaitlist, setIsUpdatingWaitlist] = useState(false);

  // Fetch service wallet address
  useEffect(() => {
    const fetchServiceAddress = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-service-address');
        if (error || !data?.address) {
          console.error('Failed to get service address:', error);
        } else {
          setServiceWalletAddress(data.address);
        }
      } catch (error) {
        console.error('Error fetching service address:', error);
      }
    };

    if (open) {
      fetchServiceAddress();
    }
  }, [open]);

  // Check on-chain manager status
  useEffect(() => {
    const checkManagerStatus = async () => {
      if (!serviceWalletAddress || !open) return;
      
      setIsCheckingStatus(true);
      try {
        const isManager = await checkIfLockManager(event.lock_address, serviceWalletAddress);
        setIsServiceManager(isManager);
        
        // If on-chain status doesn't match database, update local state
        if (isManager !== localServiceManagerAdded) {
          setLocalServiceManagerAdded(isManager);
        }
      } catch (error) {
        console.error('Error checking manager status:', error);
      } finally {
        setIsCheckingStatus(false);
      }
    };

    checkManagerStatus();
  }, [serviceWalletAddress, event.lock_address, open]);

  const handleAddServiceManager = async () => {
    if (!wallets[0]) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to continue.",
        variant: "destructive"
      });
      return;
    }

    setIsAddingManager(true);
    try {
      const result = await addLockManager(event.lock_address, serviceWalletAddress, wallets[0]);
      
      if (result.success) {
        // Update database
        const accessToken = await getAccessToken();
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        const { error } = await supabase.functions.invoke('update-event', {
          body: { 
            eventId: event.id, 
            formData: { service_manager_added: true }
          },
          headers: {
            Authorization: `Bearer ${anonKey}`,
            'X-Privy-Authorization': `Bearer ${accessToken}`,
          },
        });

        if (error) {
          console.error('Failed to update database:', error);
        }

        setIsServiceManager(true);
        setLocalServiceManagerAdded(true);
        
        toast({
          title: "Service Manager Added",
          description: "Fiat payments are now enabled for this event.",
        });
        
        onEventUpdated();
      } else {
        throw new Error(result.error || 'Failed to add service manager');
      }
    } catch (error) {
      console.error('Error adding service manager:', error);
      toast({
        title: "Failed to Add Service Manager",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    } finally {
      setIsAddingManager(false);
    }
  };

  const handleRemoveServiceManager = async () => {
    setIsRemovingManager(true);
    try {
      const accessToken = await getAccessToken();
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const { data, error } = await supabase.functions.invoke('remove-service-manager', {
        body: { eventId: event.id },
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${accessToken}`,
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || 'Failed to remove service manager');
      }

      setIsServiceManager(false);
      setLocalServiceManagerAdded(false);
      
      toast({
        title: "Service Manager Removed",
        description: "Fiat payments are now disabled for this event.",
      });
      
      onEventUpdated();
    } catch (error) {
      console.error('Error removing service manager:', error);
      toast({
        title: "Failed to Remove Service Manager",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    } finally {
      setIsRemovingManager(false);
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
  const showWarning = hasFiatPayment && !localServiceManagerAdded;

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

          {/* Service Manager Status */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Service Manager Status</h3>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Current Status:</span>
                  {isCheckingStatus ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : isServiceManager ? (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Added
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-gray-200">
                      <XCircle className="w-3 h-3 mr-1" />
                      Not Added
                    </Badge>
                  )}
                </div>

                {serviceWalletAddress && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">Service Wallet:</span>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-white px-2 py-1 rounded border">
                        {serviceWalletAddress.slice(0, 6)}...{serviceWalletAddress.slice(-4)}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(serviceWalletAddress)}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {!isServiceManager ? (
                    <Button
                      onClick={handleAddServiceManager}
                      disabled={isAddingManager || isCheckingStatus}
                      className="flex-1"
                    >
                      {isAddingManager && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Add Service Manager
                    </Button>
                  ) : (
                    <Button
                      onClick={handleRemoveServiceManager}
                      disabled={isRemovingManager || isCheckingStatus}
                      variant="destructive"
                      className="flex-1"
                    >
                      {isRemovingManager && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Remove Service Manager
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

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

                {hasFiatPayment && !localServiceManagerAdded && (
                  <p className="text-xs text-orange-600 mt-2">
                    ⚠️ Add service manager to activate fiat payments
                  </p>
                )}
              </div>
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
                  <Badge variant="outline">Base Sepolia</Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Transaction:</span>
                  <a
                    href={`https://sepolia.basescan.org/tx/${event.transaction_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                  >
                    <span className="text-xs">View</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
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
