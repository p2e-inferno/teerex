import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useToast } from '@/hooks/use-toast';
import { deployLock, addLockManager } from '@/utils/lockUtils';
import { savePublishedEventViaEdge, deleteDraftViaEdge } from '@/utils/edgeFunctionStorage';
import { supabase } from '@/integrations/supabase/client';
import { useGaslessFallback } from '@/hooks/useGasless';
import { EventCreateSchema } from '@/types/event.schema';
import type { EventFormData } from '@/pages/CreateEvent';

export interface PublishEventResult {
  success: boolean;
  event?: any;
  error?: string;
  autoSavedDraftId?: string;
  duplicateEvent?: {
    lockAddress: string;
    eventTitle: string;
  };
}

/**
 * Shared hook for publishing events from both CreateEvent and Drafts flows
 * Handles deployment, service manager setup, validation, and database operations
 */
export function useEventPublisher() {
  const { getAccessToken, user } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [isPublishing, setIsPublishing] = useState(false);

  // Gasless deployment fallback hook
  const deployLockWithGasless = useGaslessFallback(
    'gasless-deploy-lock',
    async (lockConfig: any) => {
      // Fallback: client-side deployment
      const wallet = wallets[0];
      if (!wallet) {
        throw new Error('Wallet disconnected. Please reconnect your wallet and try again.');
      }

      toast({
        title: "Deploying with wallet",
        description: "Please confirm the transaction in your wallet...",
      });
      return await deployLock(lockConfig, wallet, lockConfig.chainId);
    },
    true // enabled by default
  );

  /**
   * Calculate ticket expiration duration based on settings
   */
  const getExpirationDuration = (duration: string, customDays?: number): number => {
    switch (duration) {
      case '30':
        return 30 * 24 * 60 * 60;      // 30 days in seconds
      case '365':
        return 365 * 24 * 60 * 60;    // 1 year in seconds
      case 'unlimited':
        return 999999999;              // ~31 years (effectively unlimited)
      case 'custom':
        return (customDays || 1) * 24 * 60 * 60; // Custom days in seconds
      case 'event':
      default:
        return 86400;                  // 1 day (valid until event)
    }
  };

  /**
   * Validate required form fields
   */
  const validateRequiredFields = (formData: EventFormData): boolean => {
    const parsed = EventCreateSchema.safeParse({
      title: formData.title,
      date: formData.date,
      time: formData.time,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast({
        title: 'Missing or invalid fields',
        description: first?.message || 'Please check your inputs',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  /**
   * Validate date logic
   */
  const validateDates = (formData: EventFormData): boolean => {
    if (!formData.date) {
      return false;
    }

    if (formData.endDate && formData.endDate < formData.date) {
      toast({
        title: 'Invalid Date Range',
        description: 'End date must be on or after start date',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

  /**
   * Auto-save draft on deployment failure
   * Returns updated error message and new draft ID (if created)
   */
  const autoSaveDraft = async (
    formData: EventFormData,
    currentDraftId: string | null,
    errorMessage: string,
    autoSaveEnabled: boolean
  ): Promise<{ errorMessage: string; newDraftId?: string }> => {
    if (!autoSaveEnabled) {
      return { errorMessage };
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken || !user?.id) {
        return {
          errorMessage: errorMessage + ' Unable to auto-save draft - please save manually.'
        };
      }

      const { updateDraftViaEdge, saveDraftViaEdge } = await import('@/utils/edgeFunctionStorage');

      if (currentDraftId) {
        await updateDraftViaEdge(currentDraftId, formData, user.id, accessToken);
        console.log('Draft auto-updated successfully');
        return { errorMessage };
      } else {
        const newDraftId = await saveDraftViaEdge(formData, user.id, accessToken);
        if (newDraftId) {
          console.log('Draft auto-saved successfully:', newDraftId);
          return { errorMessage, newDraftId };
        }
        return { errorMessage };
      }
    } catch (draftError) {
      console.error('Failed to auto-save draft:', draftError);
      return {
        errorMessage: errorMessage + ' Unable to auto-save draft - please save manually.'
      };
    }
  };

  /**
   * Main publish event function
   */
  const publishEvent = async (
    formData: EventFormData,
    options?: {
      currentDraftId?: string | null;
      onSuccess?: (event: any) => void;
      autoSaveOnError?: boolean;
    }
  ): Promise<PublishEventResult> => {
    setIsPublishing(true);

    try {
      // 1. Validate
      if (!validateRequiredFields(formData)) {
        setIsPublishing(false);
        return { success: false, error: 'Validation failed' };
      }
      if (!validateDates(formData)) {
        setIsPublishing(false);
        return { success: false, error: 'Invalid dates' };
      }

      // 2. Check wallet
      const wallet = wallets[0];
      if (!wallet) {
        throw new Error('Please connect a wallet to create your event.');
      }

      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      // 3. Build lock configuration
      const lockConfig = {
        name: formData.title,
        symbol: `${formData.title.slice(0, 3).toUpperCase()}TIX`,
        keyPrice: formData.paymentMethod === 'crypto' ? formData.price.toString() : '0',
        maxNumberOfKeys: formData.capacity,
        expirationDuration: getExpirationDuration(
          formData.ticketDuration,
          formData.customDurationDays
        ),
        currency: formData.paymentMethod === 'crypto' ? formData.currency : 'FREE',
        price: formData.paymentMethod === 'crypto'
          ? formData.price
          : (formData.paymentMethod === 'fiat' ? formData.ngnPrice : 0),
        chainId: (formData.chainId || 0) as number,
      };

      if (!lockConfig.chainId) {
        throw new Error('Please select a network for deployment.');
      }

      // 4. Deploy lock (gasless with fallback)
      const result: any = await deployLockWithGasless({
        ...lockConfig,
        chain_id: lockConfig.chainId,
        maxKeysPerAddress: 1,
        transferable: formData.transferable ?? false,
        requiresApproval: false,
        creator_address: wallet.address?.toLowerCase(),
        // Fields for idempotency hash
        eventDate: formData.date?.toISOString() || null,
        eventTime: formData.time,
        eventLocation: formData.location,
        paymentMethod: formData.paymentMethod,
      });

      // Normalize response format (gasless returns {ok, lock_address, tx_hash}, client returns {success, lockAddress, transactionHash})
      const deploymentResult = result.ok
        ? { success: true, lockAddress: result.lock_address, transactionHash: result.tx_hash }
        : result;

      // Show success message for gasless
      if (result.ok) {
        toast({
          title: "Lock deployed!",
          description: "Gas sponsored by TeeRex ✨",
        });
      }

      if (!deploymentResult.success || !deploymentResult.transactionHash || !deploymentResult.lockAddress) {
        throw new Error(deploymentResult.error || 'Failed to deploy smart contract');
      }

      // 5. Add service manager for fiat payments
      let serviceManagerAdded = false;
      if (formData.paymentMethod === 'fiat') {
        toast({
          title: "Adding Service Manager",
          description: "Adding unlock service as lock manager for fiat payments...",
        });

        try {
          // Get the service public key
          const { data: serviceData, error: serviceError } = await supabase.functions.invoke('get-service-address');

          if (serviceError) {
            console.error('Failed to get service address (network error):', serviceError);
            toast({
              title: "Warning",
              description: "Event created but fiat payments may not work. Service manager not added.",
              variant: "default"
            });
          } else if (!serviceData?.ok) {
            console.error('Failed to get service address (application error):', serviceData?.error);
            toast({
              title: "Warning",
              description: "Event created but fiat payments may not work. Service manager not added.",
              variant: "default"
            });
          } else if (!serviceData.address) {
            console.error('Service address not returned');
            toast({
              title: "Warning",
              description: "Event created but fiat payments may not work. Service manager not added.",
              variant: "default"
            });
          } else {
            const managerResult = await addLockManager(
              deploymentResult.lockAddress,
              serviceData.address,
              wallet
            );

            if (!managerResult.success) {
              console.error('Failed to add service manager:', managerResult.error);
              toast({
                title: "Warning",
                description: "Event created but fiat payments may not work. Service manager not added.",
                variant: "default"
              });
            } else {
              console.log('Service manager added successfully:', managerResult.transactionHash);
              serviceManagerAdded = true;
            }
          }
        } catch (error) {
          console.error('Error adding service manager:', error);
          toast({
            title: "Warning",
            description: "Event created but fiat payments may not work. Service manager not added.",
            variant: "default"
          });
        }
      }

      // 6. Get access token for edge function calls
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Authentication session expired. Please refresh the page.');
      }

      // 7. Save event to database
      const savedEvent = await savePublishedEventViaEdge(
        formData,
        deploymentResult.lockAddress,
        deploymentResult.transactionHash,
        user.id,
        accessToken,
        serviceManagerAdded
      );

      // 8. Delete draft if provided
      if (options?.currentDraftId && user?.id) {
        await deleteDraftViaEdge(options.currentDraftId, user.id, accessToken);
      }

      // 9. Success - prepare result before calling callback
      setIsPublishing(false);
      const successResult: PublishEventResult = { success: true, event: savedEvent };

      // 10. Call success callback (don't let callback errors affect success state)
      if (options?.onSuccess) {
        try {
          options.onSuccess(savedEvent);
        } catch (callbackError) {
          console.error('Success callback error (event was published successfully):', callbackError);
          // Don't throw - event was successfully published and saved
        }
      }

      return successResult;

    } catch (error) {
      console.error('Error publishing event:', error);

      // Handle duplicate event detection
      if (error instanceof Error && error.message === 'DUPLICATE_EVENT') {
        const lockAddress = (error as any).lockAddress;
        const eventTitle = (error as any).eventTitle;

        setIsPublishing(false);
        return {
          success: false,
          error: 'DUPLICATE_EVENT',
          duplicateEvent: { lockAddress, eventTitle }
        };
      }

      // Build error message
      const autoSaveEnabled = options?.autoSaveOnError !== false;
      let errorMessage = 'There was an error creating your event. Please try again.';
      let shouldAutoSaveDraft = false;

      if (error instanceof Error) {
        if (error.message.includes('User rejected')) {
          errorMessage = autoSaveEnabled
            ? 'Transaction was cancelled. Your work has been automatically saved as a draft.'
            : 'Transaction was cancelled.';
          shouldAutoSaveDraft = true;
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = autoSaveEnabled
            ? 'Insufficient funds to deploy the smart contract. Your work has been saved as a draft.'
            : 'Insufficient funds to deploy the smart contract.';
          shouldAutoSaveDraft = true;
        } else {
          errorMessage = error.message;
          // Auto-save for any deployment error to prevent data loss
          shouldAutoSaveDraft = true;
        }
      }

      // Auto-save draft on deployment failure
      let newDraftId: string | undefined;
      if (shouldAutoSaveDraft && user?.id) {
        console.log('Auto-saving draft after deployment error');
        const autoSaveResult = await autoSaveDraft(
          formData,
          options?.currentDraftId || null,
          errorMessage,
          autoSaveEnabled
        );
        errorMessage = autoSaveResult.errorMessage;
        newDraftId = autoSaveResult.newDraftId;
      }

      toast({
        title: "Error Creating Event",
        description: errorMessage,
        variant: "destructive",
        duration: 7000
      });

      setIsPublishing(false);
      return {
        success: false,
        error: errorMessage,
        autoSavedDraftId: newDraftId
      };
    }
  };

  return {
    publishEvent,
    isPublishing,
  };
}
