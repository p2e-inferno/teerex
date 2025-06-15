
import React, { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Navigate, useNavigate } from 'react-router-dom';
import { EventBasicInfo } from '@/components/create-event/EventBasicInfo';
import { EventDetails } from '@/components/create-event/EventDetails';
import { TicketSettings } from '@/components/create-event/TicketSettings';
import { EventPreview } from '@/components/create-event/EventPreview';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  const { authenticated } = usePrivy();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
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

  const steps = [
    { number: 1, title: 'Basic Info', component: EventBasicInfo },
    { number: 2, title: 'Details', component: EventDetails },
    { number: 3, title: 'Tickets', component: TicketSettings },
    { number: 4, title: 'Preview', component: EventPreview }
  ];

  const currentStepData = steps[currentStep - 1];
  const StepComponent = currentStepData.component;

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

  const createEvent = async () => {
    console.log('Creating event with data:', formData);
    setIsCreating(true);
    
    try {
      // Here we would deploy the Unlock Protocol lock
      // For now, we'll simulate the creation process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast({
        title: "Event Created Successfully!",
        description: "Your event has been created and the lock has been deployed.",
      });
      
      // Navigate to the explore page or event page
      navigate('/explore');
    } catch (error) {
      console.error('Error creating event:', error);
      toast({
        title: "Error Creating Event",
        description: "There was an error creating your event. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  const canContinue = isStepValid(currentStep);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Event</h1>
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
            <StepComponent 
              formData={formData} 
              updateFormData={updateFormData}
              onNext={nextStep}
            />
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
              {isCreating ? 'Creating Event...' : 'Create Event'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateEvent;
