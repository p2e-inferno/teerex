
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
import { deployLock, getBlockExplorerUrl } from '@/utils/lockUtils';
import { savePublishedEvent } from '@/utils/eventUtils';
import { saveDraft, updateDraft, getDraft, deleteDraft, getPublishedEvent } from '@/utils/supabaseDraftStorage';
import { supabase } from '@/integrations/supabase/client';
import { addLockManager } from '@/utils/lockUtils';
import { EventCreationSuccessModal } from '@/components/events/EventCreationSuccessModal';
import { WalletConnectionGate } from '@/components/WalletConnectionGate';
import { useGaslessFallback } from '@/hooks/useGasless';

export interface EventFormData {
  title: string;
  description: string;
  date: Date | null;
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
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId);
  const [editingEventId, setEditingEventId] = useState<string | null>(eventId);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdEvent, setCreatedEvent] = useState<any>(null);
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
    imageUrl: ''
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


  useEffect(() => {
    if (draftId && user?.id) {
      const loadDraft = async () => {
        const draft = await getDraft(draftId, user.id);
        if (draft) {
          setFormData({
            title: draft.title,
            description: draft.description,
            date: draft.date,
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
            imageUrl: draft.image_url || ''
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
            imageUrl: event.image_url || ''
          });
          setEditingEventId(eventId);
          setCurrentDraftId(null);
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
          return formData.price > 0 && !!formData.currency;
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

  const saveAsDraft = async () => {
    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      if (currentDraftId) {
        await updateDraft(currentDraftId, formData, user.id);
        toast({
          title: "Draft Updated",
          description: "Your event draft has been updated successfully.",
        });
      } else {
        const newDraftId = await saveDraft(formData, user.id);
        if (newDraftId) {
          setCurrentDraftId(newDraftId);
          toast({
            title: "Draft Saved",
            description: "Your event has been saved as a draft.",
          });
        } else {
          throw new Error('Failed to save draft');
        }
      }
      navigate('/drafts');
    } catch (error) {
      console.error('Error saving draft:', error);
      toast({
        title: "Error Saving Draft",
        description: "There was an error saving your draft. Please try again.",
        variant: "destructive"
      });
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
        expirationDuration: 86400,
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
        expirationDuration: 86400,
        currency: formData.paymentMethod === 'crypto' ? formData.currency : 'FREE',
        price: formData.paymentMethod === 'crypto' ? formData.price : (formData.paymentMethod === 'fiat' ? formData.ngnPrice : 0),
        maxNumberOfKeys: formData.capacity,
        chain_id: lockConfig.chainId,
        maxKeysPerAddress: 1,
        transferable: true,
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
            
            if (serviceError || !serviceData?.address) {
              console.error('Failed to get service address:', serviceError);
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
        const eventId = (error as any).eventId;
        const eventTitle = (error as any).eventTitle;

        toast({
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
                    toast.dismiss();
                    navigate(`/event/${eventId}`);
                  }}
                >
                  View Event
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    toast.dismiss();
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

      if (error instanceof Error) {
        if (error.message.includes('User rejected')) {
          errorMessage = 'Transaction was cancelled. Please try again when ready.';
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient funds to deploy the smart contract. Please add more ETH to your wallet.';
        } else {
          errorMessage = error.message;
        }
      }

      toast({
        title: "Error Creating Event",
        description: errorMessage,
        variant: "destructive"
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
      navigate(`/event/${createdEvent.id}`);
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
      imageUrl: ''
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
        return <EventPreview {...commonProps} onSaveAsDraft={editingEventId ? undefined : saveAsDraft} />;
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
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center">
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
                  ${currentStep >= step.number 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-gray-200 text-gray-600'
                  }
                `}>
                  {step.number}
                </div>
                <div className={`ml-3 ${currentStep === step.number ? 'text-purple-600' : 'text-gray-600'}`}>
                  <div className="text-sm font-medium">{step.title}</div>
                </div>
                {index < steps.length - 1 && (
                  <div className={`
                    flex-1 h-0.5 mx-6
                    ${currentStep > step.number ? 'bg-purple-600' : 'bg-gray-200'}
                  `} />
                )}
              </div>
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
