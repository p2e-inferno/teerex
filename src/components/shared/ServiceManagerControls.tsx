import { useEffect, useMemo, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { addLockManager, checkIfLockManager } from '@/utils/lockUtils';

type ServiceManagerControlsProps = {
  entityType: 'event' | 'bundle';
  entityId: string;
  lockAddress: string;
  chainId: number;
  canManage: boolean;
  initialAdded?: boolean;
  onUpdated?: () => void;
};

const labels = {
  event: {
    add: 'Service manager added',
    remove: 'Service manager removed',
    warning: 'Service wallet is not a lock manager for this lock.',
  },
  bundle: {
    add: 'Service manager added',
    remove: 'Service manager removed',
    warning: 'Service wallet is not a lock manager for this lock.',
  },
};

export const ServiceManagerControls = ({
  entityType,
  entityId,
  lockAddress,
  chainId,
  canManage,
  initialAdded = false,
  onUpdated,
}: ServiceManagerControlsProps) => {
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [serviceWalletAddress, setServiceWalletAddress] = useState('');
  const [isServiceManager, setIsServiceManager] = useState(Boolean(initialAdded));
  const [isChecking, setIsChecking] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const updateFn = useMemo(
    () => (entityType === 'event' ? 'update-event' : 'update-gaming-bundle'),
    [entityType]
  );
  const removeFn = useMemo(
    () => (entityType === 'event' ? 'remove-service-manager' : 'remove-gaming-bundle-service-manager'),
    [entityType]
  );

  useEffect(() => {
    setIsServiceManager(Boolean(initialAdded));
  }, [initialAdded]);

  useEffect(() => {
    const fetchServiceAddress = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-service-address');
        if (error || !data?.address) {
          console.error('Failed to get service address:', error);
          return;
        }
        setServiceWalletAddress(data.address);
      } catch (error) {
        console.error('Error fetching service address:', error);
      }
    };

    if (canManage) {
      fetchServiceAddress();
    }
  }, [canManage]);

  useEffect(() => {
    const checkStatus = async () => {
      if (!canManage || !serviceWalletAddress) return;
      setIsChecking(true);
      try {
        const isManager = await checkIfLockManager(lockAddress, serviceWalletAddress, chainId);
        setIsServiceManager(isManager);
      } catch (error) {
        console.error('Error checking service manager status:', error);
      } finally {
        setIsChecking(false);
      }
    };

    checkStatus();
  }, [canManage, serviceWalletAddress, lockAddress, chainId]);

  const updateServiceManagerFlag = async (added: boolean) => {
    const accessToken = await getAccessToken?.();
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const body =
      entityType === 'event'
        ? { eventId: entityId, formData: { service_manager_added: added } }
        : { bundle_id: entityId, service_manager_added: added };
    const { error } = await supabase.functions.invoke(updateFn, {
      body,
      headers: {
        Authorization: `Bearer ${anonKey}`,
        ...(accessToken ? { 'X-Privy-Authorization': `Bearer ${accessToken}` } : {}),
      },
    });
    if (error) {
      console.error('Failed to update service manager flag:', error);
    }
  };

  const handleAdd = async () => {
    if (!wallets[0]) {
      toast({ title: 'Wallet not connected', description: 'Connect a wallet to continue.', variant: 'destructive' });
      return;
    }
    if (!serviceWalletAddress) {
      toast({ title: 'Service wallet missing', description: 'Service wallet address not available.', variant: 'destructive' });
      return;
    }

    setIsAdding(true);
    try {
      const result = await addLockManager(lockAddress, serviceWalletAddress, wallets[0]);
      if (!result.success) {
        throw new Error(result.error || 'Failed to add service manager');
      }

      await updateServiceManagerFlag(true);
      setIsServiceManager(true);
      toast({ title: labels[entityType].add, description: 'Service wallet issuance is now enabled.' });
      onUpdated?.();
    } catch (error) {
      console.error('Error adding service manager:', error);
      toast({
        title: 'Failed to add service manager',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const accessToken = await getAccessToken?.();
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const body = entityType === 'event' ? { eventId: entityId } : { bundle_id: entityId };
      const { data, error } = await supabase.functions.invoke(removeFn, {
        body,
        headers: {
          Authorization: `Bearer ${anonKey}`,
          ...(accessToken ? { 'X-Privy-Authorization': `Bearer ${accessToken}` } : {}),
        },
      });

      const removeOk = data?.ok ?? data?.success;
      if (error || !removeOk) {
        throw new Error(data?.error || 'Failed to remove service manager');
      }

      setIsServiceManager(false);
      await updateServiceManagerFlag(false);
      toast({ title: labels[entityType].remove, description: 'Service wallet is now removed as manager.' });
      onUpdated?.();
    } catch (error) {
      console.error('Error removing service manager:', error);
      toast({
        title: 'Failed to remove service manager',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Service Manager Status</p>
          <p className="text-xs text-gray-600">Fiat issuance uses the service wallet to grant keys.</p>
        </div>
        <div className="text-xs text-gray-500">
          {isChecking ? 'Checking...' : isServiceManager ? 'Manager' : 'Not manager'}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {!isServiceManager ? (
          <Button size="sm" onClick={handleAdd} disabled={isAdding || !canManage || !serviceWalletAddress}>
            {isAdding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Add Service Manager
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={handleRemove} disabled={isRemoving || !canManage}>
            {isRemoving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Remove Service Manager
          </Button>
        )}

        {serviceWalletAddress ? (
          <span className="text-xs text-gray-500 font-mono">
            {serviceWalletAddress.slice(0, 6)}...{serviceWalletAddress.slice(-4)}
          </span>
        ) : null}
      </div>

      {!isServiceManager && <p className="text-xs text-amber-700">{labels[entityType].warning}</p>}
    </div>
  );
};
