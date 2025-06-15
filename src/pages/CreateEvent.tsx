import React, { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { EventBasicInfo } from '@/components/create-event/EventBasicInfo';
import { EventDetails } from '@/components/create-event/EventDetails';
import { TicketSettings } from '@/components/create-event/TicketSettings';
import { EventPreview } from '@/components/create-event/EventPreview';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { deployLock, getBlockExplorerUrl } from '@/utils/lockUtils';
import { saveDraft, updateDraft, getDraft, deleteDraft } from '@/utils/supabaseDraftStorage';
import { supabase } from '@/integrations/supabase/client';

export interface EventFormData {
  title: string;
  description: string;
  date: Date | null;
  time: string;
  location: string;
  capacity: number;
  price: number;
  currency: 'ETH' | 'USDC' | 'FREE';
  category: string;
  imageUrl: string;
}

const CreateEvent = () => {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get('draft');
  
  const [currentStep, setCurrentStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId);
  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    date: null,
    time: '',
    location: '',
    capacity: 100,
    price: 0,
    currency: 'FREE',
    category: '',
    imageUrl: ''
  });

  if (!authenticated) {
    return <Navigate to="/" replace />;
  }

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
            capacity: draft.capacity,
            price: draft.price,
            currency: draft.currency,
            category: draft.category,
            imageUrl: draft.image_url || ''
          });
          setCurrentDraftId(draftId);
        }
      };
      loadDraft();
    }
  }, [draftId, user?.id]);

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
        return !!(formData.title.trim() && formData.description.trim() && formData.date);
      case 2:
        return !!(formData.category && formData.capacity > 0);
      case 3:
        return true; // Ticket settings are optional
      case 4:
        return true; // Preview step is always valid
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

  const saveEventToSupabase = async (lockAddress: string, transactionHash: string) => {
    try {
      if (!user) {
        throw new Error('User not authenticated');
      }

      const eventData = {
        title: formData.title,
        description: formData.description,
        date: formData.date?.toISOString(),
        time: formData.time,
        location: formData.location,
        capacity: formData.capacity,
        price: formData.price,
        currency: formData.currency,
        category: formData.category,
        image_url: formData.imageUrl || null,
        lock_address: lockAddress,
        transaction_hash: transactionHash,
        creator_id: user.id,
        created_at: new Date().toISOString()
      };

      // Note: We would need to create an 'events' table in Supabase to store published events
      // For now, we'll just log the data
      console.log('Event data to save:', eventData);
      
      // TODO: Save to Supabase events table once it's created
      // const { error } = await supabase.from('events').insert(eventData);
      // if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error saving event to Supabase:', error);
      throw error;
    }
  };

  const createEvent = async () => {
    console.log('Creating event with data:', formData);
    setIsCreating(true);
    
    try {
      // Get any connected wallet - Privy provides embedded wallets
      const wallet = wallets[0]; // Get the first available wallet
      if (!wallet) {
        throw new Error('Please connect a wallet to create your event.');
      }

      console.log('Using wallet:', wallet);

      toast({
        title: "Deploying Smart Contract",
        description: "Please confirm the transaction in your wallet...",
      });

      // Deploy the Unlock Protocol lock
      const lockConfig = {
        name: formData.title,
        symbol: `${formData.title.slice(0, 3).toUpperCase()}TIX`,
        keyPrice: formData.currency === 'FREE' ? '0' : formData.price.toString(),
        maxNumberOfKeys: formData.capacity,
        expirationDuration: 86400, // 24 hours in seconds
        currency: formData.currency,
        price: formData.price
      };

      const deploymentResult = await deployLock(lockConfig, wallet);
      
      if (deploymentResult.success && deploymentResult.transactionHash && deploymentResult.lockAddress) {
        // Save event to Supabase
        await saveEventToSupabase(deploymentResult.lockAddress, deploymentResult.transactionHash);

        const explorerUrl = getBlockExplorerUrl(deploymentResult.transactionHash, 'baseSepolia');
        
        toast({
          title: "Event Created Successfully!",
          description: (
            <div className="space-y-2">
              <p>Your event has been deployed to the blockchain.</p>
              <div className="text-sm text-gray-600">
                <p>Lock Address: {deploymentResult.lockAddress}</p>
              </div>
              <a 
                href={explorerUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline"
              >
                View Transaction <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ),
        });

        // Remove from drafts if it was a draft
        if (currentDraftId && user?.id) {
          await deleteDraft(currentDraftId, user.id);
        }
      } else {
        throw new Error(deploymentResult.error || 'Failed to deploy smart contract');
      }
      
      // Navigate to the explore page
      navigate('/explore');
    } catch (error) {
      console.error('Error creating event:', error);
      
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
    } finally {
      setIsCreating(false);
    }
  };

  const canContinue = isStepValid(currentStep);

  const renderStepComponent = () => {
    const commonProps = {
      formData,
      updateFormData,
      onNext: nextStep
    };

    switch (currentStep) {
      case 1:
        return <EventBasicInfo {...commonProps} />;
      case 2:
        return <EventDetails {...commonProps} />;
      case 3:
        return <TicketSettings {...commonProps} />;
      case 4:
        return <EventPreview {...commonProps} onSaveAsDraft={saveAsDraft} />;
      default:
        return <EventBasicInfo {...commonProps} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {currentDraftId ? 'Edit Event Draft' : 'Create Event'}
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
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1}
            className="border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
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
              onClick={createEvent}
              disabled={!canContinue || isCreating}
              className="bg-purple-600 hover:bg-purple-700 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Deploying Smart Contract...' : 'Publish Event'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateEvent;
