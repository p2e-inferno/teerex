
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { EventFormData } from '@/pages/CreateEvent';
import { DollarSign, Ticket, Globe, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { useEventLockState } from '@/hooks/useEventLockState';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { usePrivy } from '@privy-io/react-auth';
import { toast } from 'sonner';


interface TicketSettingsDisplayProps {
  formData: EventFormData;
  lockAddress?: string;
  eventId?: string;
}

export const TicketSettingsDisplay: React.FC<TicketSettingsDisplayProps> = ({
  formData,
  lockAddress,
  eventId
}) => {
  const { networks } = useNetworkConfigs();
  const { getAccessToken } = usePrivy();
  const [isSyncing, setIsSyncing] = React.useState(false);

  const network = formData.chainId ? networks.find(n => n.chain_id === formData.chainId) : undefined;
  const networkLabel = network?.chain_name || (formData.chainId === 8453 ? 'Base' : formData.chainId === 84532 ? 'Base Sepolia' : 'Network');

  // Phase 1: Detect pricing mismatches (only for published events with crypto payments)
  const isPublishedCryptoEvent = !!lockAddress && formData.paymentMethod === 'crypto';
  const lockState = useEventLockState({
    lockAddress: isPublishedCryptoEvent ? lockAddress : undefined,
    chainId: isPublishedCryptoEvent ? formData.chainId : undefined,
    dbPrice: isPublishedCryptoEvent ? formData.price : undefined,
    dbCurrency: isPublishedCryptoEvent ? formData.currency : undefined,
    enabled: isPublishedCryptoEvent,
  });
  // Phase 2: Sync database to on-chain pricing
  const handleSyncToOnChain = async () => {
    if (!eventId || !lockAddress) {
      toast.error('Missing event information');
      return;
    }

    setIsSyncing(true);
    try {
      const accessToken = await getAccessToken();
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const { data, error } = await supabase.functions.invoke('sync-event-pricing-from-chain', {
        body: { event_id: eventId },
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${accessToken}`,
        },
      });

      if (error) throw error;

      if (!data.ok) {
        throw new Error(data.error || 'Failed to sync pricing');
      }

      toast.success('Pricing synced successfully! Refreshing...');

      // Refetch on-chain state to update UI
      await lockState.refetch();

      // Reload page to update form data from database
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Error syncing pricing:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to sync pricing');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">Ticket & Contract Details</h2>
      <p className="text-gray-600">
        These settings are permanently stored on the blockchain and cannot be changed after the event is published.
      </p>

      {/* Phase 1: Mismatch Alert */}
      {isPublishedCryptoEvent && lockState.hasMismatch && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <AlertDescription className="ml-2">
            <div className="space-y-2">
              <p className="font-semibold text-red-900">
                Pricing Mismatch Detected
              </p>
              <div className="text-sm text-red-800 space-y-1">
                {lockState.mismatchType === 'price' && (
                  <p>
                    Database price ({formData.price} {formData.currency}) differs from on-chain price ({lockState.onChainPrice} {lockState.onChainCurrency})
                  </p>
                )}
                {lockState.mismatchType === 'currency' && (
                  <p>
                    Database currency ({formData.currency}) differs from on-chain currency ({lockState.onChainCurrency})
                  </p>
                )}
                {lockState.mismatchType === 'both' && (
                  <>
                    <p>Database: {formData.price} {formData.currency}</p>
                    <p>On-chain: {lockState.onChainPrice} {lockState.onChainCurrency}</p>
                  </>
                )}
                <div className="pt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSyncToOnChain}
                    disabled={isSyncing}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {isSyncing ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      'Update Database to Match On-Chain'
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => lockState.refetch()}
                    disabled={lockState.isLoading}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${lockState.isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Phase 1: No Mismatch Indicator */}
      {isPublishedCryptoEvent && !lockState.hasMismatch && !lockState.isLoading && !lockState.error && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <AlertDescription className="ml-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-green-900">
                Pricing is in sync with on-chain lock contract
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => lockState.refetch()}
                disabled={lockState.isLoading}
                className="text-green-700 hover:text-green-900 hover:bg-green-100"
              >
                <RefreshCw className={`w-4 h-4 ${lockState.isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Error State */}
      {lockState.error && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          <AlertDescription className="ml-2 text-sm text-yellow-900">
            Unable to verify on-chain pricing. This may be due to network issues.
            <Button
              size="sm"
              variant="ghost"
              onClick={() => lockState.refetch()}
              className="ml-2 text-yellow-700 hover:text-yellow-900"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-start gap-4">
            <div className="bg-blue-100 text-blue-600 rounded-lg p-3">
              <Ticket className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Ticket Capacity</p>
              <p className="text-lg font-semibold text-gray-900">{formData.capacity}</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="bg-green-100 text-green-600 rounded-lg p-3">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Ticket Price</p>
              <p className="text-lg font-semibold text-gray-900">
                {formData.paymentMethod === 'free' && 'Free'}
                {formData.paymentMethod === 'crypto' && `${formData.price} ${formData.currency}`}
                {formData.paymentMethod === 'fiat' && `₦${formData.ngnPrice.toLocaleString()}`}
              </p>
              {isPublishedCryptoEvent && lockState.onChainPrice !== null && !lockState.hasMismatch && (
                <p className="text-xs text-gray-500 mt-1">
                  On-chain: {lockState.onChainPrice} {lockState.onChainCurrency}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="bg-purple-100 text-purple-600 rounded-lg p-3">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Network</p>
              <p className="text-lg font-semibold text-gray-900">{networkLabel}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
