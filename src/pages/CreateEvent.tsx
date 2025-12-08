
import React, { useState, useEffect } from 'react';
import { EventCreateSchema } from '@/types/event.schema';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { EventBasicInfo } from '@/components/create-event/EventBasicInfo';
import { EventDetails } from '@/components/create-event/EventDetails';
import { TicketSettings } from '@/components/create-event/TicketSettings';
import { TicketSettingsDisplay } from '@/components/create-event/TicketSettingsDisplay';
import { EventPreview } from '@/components/create-event/EventPreview';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { deployLock, updateLockTransferability } from '@/utils/lockUtils';
import { savePublishedEvent } from '@/utils/eventUtils';
import { saveDraft, updateDraft, getDraft, deleteDraft, getPublishedEvent } from '@/utils/supabaseDraftStorage';
import { supabase } from '@/integrations/supabase/client';
import { addLockManager } from '@/utils/lockUtils';
import { EventCreationSuccessModal } from '@/components/events/EventCreationSuccessModal';
import { WalletConnectionGate } from '@/components/WalletConnectionGate';
import { useGaslessFallback } from '@/hooks/useGasless';
import { isCryptoPriceValid } from '@/utils/priceUtils';

export interface EventFormData {
  title: string;
  description: string;
  date: Date | null;
  endDate?: Date | null;
  time: string;
  location: string;
  eventType: 'physical' | 'virtual';
  capacity: number;
  // Crypto pricing (used only when paymentMethod === 'crypto')
  price: number;
  currency: 'ETH' | 'USDC';
  // Fiat pricing (used only when paymentMethod === 'fiat')
  ngnPrice: number;
  // Single, mutually exclusive payment method
  paymentMethod: 'free' | 'crypto' | 'fiat';
  category: string;
  imageUrl: string;
  chainId?: number;
  // Ticket validity duration
  ticketDuration: 'event' | '30' | '365' | 'unlimited' | 'custom';
  customDurationDays?: number;
  // Visibility and access control
  isPublic: boolean;
  allowWaitlist: boolean;
  hasAllowList: boolean;
  // Transferability setting
  transferable?: boolean;
}

const CreateEvent = () => {
  const { authenticated, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get('draft');
  const eventId = searchParams.get('eventId');
  
  const [currentStep, setCurrentStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId);
  const [editingEventId, setEditingEventId] = useState<string | null>(eventId);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdEvent, setCreatedEvent] = useState<any>(null);
  const [editingMeta, setEditingMeta] = useState<{ lockAddress: string; chainId: number; initialTransferable: boolean } | null>(null);
  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    date: null,
    time: '',
    location: '',
    eventType: 'physical',
    capacity: 100,
    price: 0,
    currency: 'ETH',
    ngnPrice: 0,
    paymentMethod: 'free',
    category: '',
    imageUrl: '',
    ticketDuration: 'event',
    customDurationDays: undefined,
    isPublic: true,
    allowWaitlist: false,
    hasAllowList: false,
    transferable: false
  });

  // Gasless deployment fallback hook
  const deployLockWithGasless = useGaslessFallback(
    'gasless-deploy-lock',
    async (lockConfig: any) => {
      // Fallback: client-side deployment
      toast({
        title: "Deploying with wallet",
        description: "Please confirm the transaction in your wallet...",
      });
      return await deployLock(lockConfig, wallets[0], lockConfig.chainId);
    },
    true // enabled by default
  );

  const validateRequiredFields = () => {
    const parsed = EventCreateSchema.safeParse({
      title: formData.title,
      date: formData.date,
      time: formData.time,
    });
    if (!parsed.success) {
      // Surface first issue only to keep UX simple
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

  const validateDates = () => {
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


  useEffect(() => {
    if (draftId && user?.id) {
      const loadDraft = async () => {
        const draft = await getDraft(draftId, user.id);
        if (draft) {
          setFormData({
            title: draft.title,
            // Preserve the network selected when the draft was saved
            chainId: (draft as any).chain_id,
            description: draft.description,
            date: draft.date,
            endDate: draft.end_date,
            time: draft.time,
            location: draft.location,
            eventType: (draft as any).event_type || 'physical',
            capacity: draft.capacity,
            // derive payment model
            paymentMethod: (draft.payment_methods && draft.payment_methods[0])
              ? (draft.payment_methods[0] as 'free' | 'crypto' | 'fiat')
              : (draft.currency && draft.currency !== 'FREE' ? 'crypto' : 'free'),
            price: draft.currency !== 'FREE' ? draft.price : 0,
            currency: (draft.currency && draft.currency !== 'FREE' ? (draft.currency as 'ETH' | 'USDC') : 'ETH'),
            ngnPrice: draft.ngn_price || 0,
            category: draft.category,
            imageUrl: draft.image_url || '',
            ticketDuration: (draft.ticket_duration as 'event' | '30' | '365' | 'unlimited' | 'custom') || 'event',
            customDurationDays: draft.custom_duration_days,
            isPublic: (draft as any).is_public ?? true,
            allowWaitlist: (draft as any).allow_waitlist ?? false,
            hasAllowList: (draft as any).has_allow_list ?? false,
            transferable: draft.transferable ?? false
          });
          setCurrentDraftId(draftId);
          setEditingEventId(null);
        }
      };
      loadDraft();
    } else if (eventId && user?.id) {
      const loadEvent = async () => {
        const event = await getPublishedEvent(eventId, user.id);
        if (event) {
          setFormData({
            title: event.title,
            description: event.description,
            date: event.date,
            endDate: event.end_date,
            time: event.time,
            location: event.location,
            eventType: (event as any).event_type || 'physical',
            capacity: event.capacity,
            paymentMethod: (event.payment_methods && event.payment_methods[0])
              ? (event.payment_methods[0] as 'free' | 'crypto' | 'fiat')
              : (event.currency && event.currency !== 'FREE' ? 'crypto' : 'free'),
            price: event.currency !== 'FREE' ? event.price : 0,
            currency: (event.currency && event.currency !== 'FREE' ? (event.currency as 'ETH' | 'USDC') : 'ETH'),
            ngnPrice: event.ngn_price || 0,
            category: event.category,
            imageUrl: event.image_url || '',
            ticketDuration: (event.ticket_duration as 'event' | '30' | '365' | 'unlimited' | 'custom') || 'event',
            customDurationDays: event.custom_duration_days,
            isPublic: (event as any).is_public ?? true,
            allowWaitlist: (event as any).allow_waitlist ?? false,
            hasAllowList: (event as any).has_allow_list ?? false,
            transferable: (event as any).transferable ?? false
          });
          setEditingEventId(eventId);
          setCurrentDraftId(null);
          setEditingMeta({
            lockAddress: (event as any).lockAddress || (event as any).lock_address,
            chainId: event.chain_id,
            initialTransferable: (event as any).transferable ?? false,
          });
        } else {
          toast({
            title: "Event not found",
            description: "Could not load the event to edit.",
            variant: "destructive"
          });
          navigate('/my-events');
        }
      };
      loadEvent();
    }
  }, [draftId, eventId, user?.id, navigate, toast]);

  const steps = [
    { number: 1, title: 'Basic Info', component: EventBasicInfo },
    { number: 2, title: 'Details', component: EventDetails },
    { number: 3, title: 'Tickets', component: TicketSettings },
    { number: 4, title: 'Preview', component: EventPreview }
  ];

  const currentStepData = steps[currentStep - 1];

  const nextStep = () => {
    console.log('Moving to next step, current step:', currentStep);
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const updateFormData = (updates: Partial<EventFormData>) => {
    console.log('Updating form data:', updates);
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const isStepValid = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(formData.title.trim() && formData.description.trim() && formData.date && formData.time);
      case 2: {
        // Validate basic details
        const hasBasicDetails = !!(formData.category && (editingEventId || formData.capacity > 0));

        // Validate location based on event type
        const hasValidLocation = formData.eventType === 'physical'
          ? !!formData.location.trim()
          : !!formData.location.trim(); // Virtual events also need a link

        return hasBasicDetails && hasValidLocation;
      }
      case 3:
        // Skip ticket validation when editing - settings are read-only
        if (editingEventId) {
          return true;
        }
        // Validate ticket settings based on payment method for new events
        if (formData.paymentMethod === 'crypto') {
          if (!formData.currency) {
            return false;
          }
          return isCryptoPriceValid(formData.price, formData.currency);
        }
        if (formData.paymentMethod === 'fiat') {
          const pk = (import.meta as any).env?.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;
          return !!pk && formData.ngnPrice > 0;
        }
        // free
        return true;
      case 4:
        return true;
      default:
        return false;
    }
  };

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

  const saveAsDraft = async () => {
    setIsSavingDraft(true);
    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('Saving draft for user:', user.id);
      console.log('Current draft ID:', currentDraftId);
      console.log('Form data:', formData);

      // Refresh access token to prevent expiration issues
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error('Authentication session expired. Please refresh the page.');
        }
        console.log('Access token refreshed successfully');
      } catch (tokenError) {
        console.error('Error refreshing access token:', tokenError);
        throw new Error('Authentication session expired. Please refresh the page and try again.');
      }

      if (currentDraftId) {
        console.log('Updating existing draft:', currentDraftId);
        await updateDraft(currentDraftId, formData, user.id);
        toast({
          title: "Draft Updated",
          description: "Your event draft has been updated successfully.",
        });
      } else {
        console.log('Creating new draft');
        const newDraftId = await saveDraft(formData, user.id);
        if (newDraftId) {
          setCurrentDraftId(newDraftId);
          console.log('Draft created successfully:', newDraftId);
          toast({
            title: "Draft Saved",
            description: "Your event has been saved as a draft.",
          });
        } else {
          throw new Error('Failed to save draft - no draft ID returned');
        }
      }
      navigate('/drafts');
    } catch (error) {
      console.error('Error saving draft:', error);

      // Provide detailed error messages
      let errorMessage = "There was an error saving your draft. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes('Authentication') || error.message.includes('session')) {
          errorMessage = error.message;
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = "Network error. Please check your connection and try again.";
        } else {
          errorMessage = `Failed to save draft: ${error.message}`;
        }
      }

      toast({
        title: "Error Saving Draft",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const createEvent = async () => {
    console.log('Creating event with data:', formData);
    setIsCreating(true);
    
    try {
      // Validate required fields before proceeding
      if (!validateRequiredFields()) {
        setIsCreating(false);
        return;
      }
      if (!validateDates()) {
        setIsCreating(false);
        return;
      }
      const wallet = wallets[0];
      if (!wallet) {
        throw new Error('Please connect a wallet to create your event.');
      }

      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('Using wallet:', wallet);

      const lockConfig = {
        name: formData.title,
        symbol: `${formData.title.slice(0, 3).toUpperCase()}TIX`,
        keyPrice: formData.paymentMethod === 'crypto' ? formData.price.toString() : '0',
        maxNumberOfKeys: formData.capacity,
        expirationDuration: getExpirationDuration(formData.ticketDuration, formData.customDurationDays),
        currency: formData.paymentMethod === 'crypto' ? formData.currency : 'FREE',
        price: formData.price,
        chainId: (formData as any).chainId as number
      };

      if (!lockConfig.chainId) {
        throw new Error('Please select a network for deployment.');
      }

      // Try gasless deployment first, fallback to client-side if it fails
      const result: any = await deployLockWithGasless({
        name: formData.title,
        expirationDuration: getExpirationDuration(formData.ticketDuration, formData.customDurationDays),
        currency: formData.paymentMethod === 'crypto' ? formData.currency : 'FREE',
        price: formData.paymentMethod === 'crypto' ? formData.price : (formData.paymentMethod === 'fiat' ? formData.ngnPrice : 0),
        maxNumberOfKeys: formData.capacity,
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
        // Include lockConfig properties for fallback
        ...lockConfig
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

      if (deploymentResult.success && deploymentResult.transactionHash && deploymentResult.lockAddress) {
        // Track if service manager was successfully added
        let serviceManagerAdded = false;
        
        // If fiat payment is enabled, add the service wallet as a lock manager
        if (formData.paymentMethod === 'fiat') {
          toast({
            title: "Adding Service Manager",
            description: "Adding unlock service as lock manager for fiat payments...",
          });

          try {
            // Get the service public key from the private key
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
              const managerResult = await addLockManager(deploymentResult.lockAddress, serviceData.address, wallet);

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
        // Save event to Supabase with service manager status
        const savedEvent = await savePublishedEvent(formData, deploymentResult.lockAddress, deploymentResult.transactionHash, user.id, serviceManagerAdded);

        if (currentDraftId && user?.id) {
          await deleteDraft(currentDraftId, user.id);
        }

        // Show success modal instead of navigating immediately
        setCreatedEvent(savedEvent);
        setShowSuccessModal(true);
      } else {
        throw new Error(deploymentResult.error || 'Failed to deploy smart contract');
      }
    } catch (error) {
      console.error('Error creating event:', error);

      // Handle duplicate event detection
      if (error instanceof Error && error.message === 'DUPLICATE_EVENT') {
        const lockAddress = (error as any).lockAddress;
        const eventTitle = (error as any).eventTitle;

        const { dismiss } = toast({
          title: "Event Already Exists",
          description: (
            <div className="space-y-2">
              <p className="text-sm">An event with these core details already exists:</p>
              <p className="font-medium text-sm">"{eventTitle}"</p>
              <p className="text-xs text-gray-600 mt-2">
                If you want to update the description, image, or other details, please view the existing event.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={() => {
                    dismiss();
                    navigate(`/event/${lockAddress}`);
                  }}
                >
                  View Event
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    dismiss();
                    navigate('/my-events');
                  }}
                >
                  My Events
                </Button>
              </div>
            </div>
          ),
          duration: 15000, // 15 seconds to give time to read
        });

        setIsCreating(false);
        return;
      }

      let errorMessage = 'There was an error creating your event. Please try again.';
      let shouldAutoSaveDraft = false;

      if (error instanceof Error) {
        if (error.message.includes('User rejected')) {
          errorMessage = 'Transaction was cancelled. Your work has been automatically saved as a draft.';
          shouldAutoSaveDraft = true;
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient funds to deploy the smart contract. Your work has been saved as a draft.';
          shouldAutoSaveDraft = true;
        } else {
          errorMessage = error.message;
          // Auto-save for any deployment error to prevent data loss
          shouldAutoSaveDraft = true;
        }
      }

      // Automatically save as draft on deployment failure
      if (shouldAutoSaveDraft && user?.id) {
        console.log('Auto-saving draft after deployment error');
        try {
          if (currentDraftId) {
            await updateDraft(currentDraftId, formData, user.id);
            console.log('Draft auto-updated successfully');
          } else {
            const newDraftId = await saveDraft(formData, user.id);
            if (newDraftId) {
              setCurrentDraftId(newDraftId);
              console.log('Draft auto-saved successfully:', newDraftId);
            }
          }
        } catch (draftError) {
          console.error('Failed to auto-save draft:', draftError);
          errorMessage += ' Unable to auto-save draft - please save manually.';
        }
      }

      toast({
        title: "Error Creating Event",
        description: errorMessage,
        variant: "destructive",
        duration: 7000
      });

      setIsCreating(false);
    } finally {
      setIsCreating(false);
    }
  };

  const updateEvent = async () => {
    if (!editingEventId || !user?.id) return;
    setIsCreating(true);

    try {
      // Validate required fields before proceeding
      if (!validateRequiredFields()) {
        setIsCreating(false);
        return;
      }
      if (!validateDates()) {
        setIsCreating(false);
        return;
      }

      // If transferability has changed, update it on-chain first
      const hasEditingMeta = Boolean(editingMeta && editingMeta.lockAddress && editingMeta.chainId);
      const nextTransferable = formData.transferable ?? false;
      const transferabilityChanged =
        hasEditingMeta && editingMeta!.initialTransferable !== nextTransferable;

      if (transferabilityChanged) {
        const wallet = wallets[0];
        if (!wallet) {
          throw new Error("Please connect a wallet to update transferability.");
        }

        const result = await updateLockTransferability(
          editingMeta!.lockAddress,
          editingMeta!.chainId,
          wallet,
          nextTransferable
        );

        if (!result.success) {
          throw new Error(result.error || "Failed to update ticket transferability on-chain.");
        }
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Authentication token not available. Please log in again.");
      }

      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const { data, error } = await supabase.functions.invoke('update-event', {
        body: { eventId: editingEventId, formData },
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${accessToken}`,
        },
      });

      if (error) {
        // Network or function invocation error
        throw new Error(error.message);
      }
      
      // Check for application-level errors returned from the function
      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Event Updated",
        description: "Your event details have been updated successfully.",
      });
      navigate('/my-events');
    } catch (error) {
      console.error('Error updating event:', error);
      toast({
        title: "Error Updating Event",
        description: error instanceof Error ? error.message : "There was an error. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  const canContinue = isStepValid(currentStep);

  const handleViewEvent = () => {
    setShowSuccessModal(false);
    if (createdEvent) {
      navigate(`/event/${createdEvent.lock_address}`);
    }
  };

  const handleCreateAnother = () => {
    setShowSuccessModal(false);
    setCreatedEvent(null);
    // Reset form to initial state
    setFormData({
      title: '',
      description: '',
      date: null,
      time: '',
      location: '',
      eventType: 'physical',
      capacity: 100,
      price: 0,
      currency: 'ETH',
      ngnPrice: 0,
      paymentMethod: 'free',
      category: '',
      imageUrl: '',
      ticketDuration: 'event',
      customDurationDays: undefined,
      isPublic: true,
      allowWaitlist: false,
      hasAllowList: false,
      transferable: false
    });
    setCurrentStep(1);
    setCurrentDraftId(null);
    setEditingEventId(null);
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    setCreatedEvent(null);
    navigate('/my-events');
  };

  const renderStepComponent = () => {
    const commonProps = {
      formData,
      updateFormData,
      onNext: nextStep,
      editingEventId
    };

    switch (currentStep) {
      case 1:
        return <EventBasicInfo {...commonProps} />;
      case 2:
        return <EventDetails {...commonProps} />;
      case 3:
        if (editingEventId) {
          return <TicketSettingsDisplay formData={formData} />;
        }
        return <TicketSettings {...commonProps} />;
      case 4:
        return <EventPreview {...commonProps} onSaveAsDraft={editingEventId ? undefined : saveAsDraft} isSavingDraft={isSavingDraft} isPublishing={isCreating} />;
      default:
        return <EventBasicInfo {...commonProps} />;
    }
  };

  if (!authenticated) {
    return (
      <WalletConnectionGate
        title="Connect Your Wallet to Create Events"
        description="You need to connect your wallet to create and manage Web3 events"
        fullPage={true}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {editingEventId ? 'Edit Event' : (currentDraftId ? 'Edit Event Draft' : 'Create Event')}
          </h1>
          <p className="text-gray-600">Set up your Web3 event with blockchain-verified tickets</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
            {steps.map((step, index) => (
              <React.Fragment key={step.number}>
                <div className="flex items-center md:flex-1">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
                    ${currentStep >= step.number 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-gray-200 text-gray-600'
                    }
                  `}>
                    {step.number}
                  </div>
                  <div className={`ml-3 text-sm font-medium ${currentStep === step.number ? 'text-purple-600' : 'text-gray-700'}`}>
                    {step.title}
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className={`
                    hidden md:block flex-1 h-0.5 mx-6
                    ${currentStep > step.number ? 'bg-purple-600' : 'bg-gray-200'}
                  `} />
                )}
                {index < steps.length - 1 && (
                  <div className={`
                    md:hidden h-px w-full
                    ${currentStep > step.number ? 'bg-purple-600' : 'bg-gray-200'}
                  `} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Form Card */}
        <Card className="border-0 shadow-sm bg-white mb-8">
          <div className="p-8">
            {renderStepComponent()}
          </div>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          {currentStep === 1 ? (
            <Button
              variant="outline"
              onClick={() => navigate('/my-events')}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={prevStep}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          
          {currentStep < steps.length ? (
            <Button
              onClick={nextStep}
              disabled={!canContinue}
              className="bg-purple-600 hover:bg-purple-700 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={editingEventId ? updateEvent : createEvent}
              disabled={!canContinue || isCreating}
              className="bg-purple-600 hover:bg-purple-700 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isCreating ? (editingEventId ? 'Updating Event...' : 'Deploying Smart Contract...') : (editingEventId ? 'Update Event' : 'Publish Event')}
            </Button>
          )}
        </div>
      </div>

      {/* Success Modal */}
      {createdEvent && (
        <EventCreationSuccessModal
          event={createdEvent}
          isOpen={showSuccessModal}
          onClose={handleCloseSuccessModal}
          onViewEvent={handleViewEvent}
          onCreateAnother={handleCreateAnother}
        />
      )}
    </div>
  );
};

export default CreateEvent;
